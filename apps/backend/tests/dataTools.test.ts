import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "data-tools-test-secret";
process.env.COOKIE_NAME = "test_auth";
process.env.DEMO_TOOLS = "true";
const { default: routes } = await import(
  "../api/routes/user/admin/dataToolsRoutes.js"
);
const { prisma } = await import("../api/prisma/client.js");
const { createLocalToken } = await import("../api/utils/auth/auth.js");
const { prismaUserStore } = await import("../api/utils/csv/csvUserImport.js");
const { createFakeUserStore } = await import("./fakeUserStore.js");
const { sampleFile } = await import("../api/utils/demo/sampleFiles.js");
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use("/", routes);
const admin = {
  id: 1,
  email: "admin@example.test",
  name: "Admin",
  role: "Admin",
  user_type: null,
  student_id: null,
  lecturer_code: "DEMO1",
  binusian_id: null,
  credential_version: 0,
};
const cookie = `test_auth=${createLocalToken(admin).token}`;
let fake = createFakeUserStore();
const delegate = prisma.user as Record<"findUnique", unknown>;
let original: unknown;
beforeEach(() => {
  fake = createFakeUserStore();
  original = delegate.findUnique;
  delegate.findUnique = async () => admin;
  mock.method(prismaUserStore, "findExistingUsers", fake.findExistingUsers);
  mock.method(prismaUserStore, "collationKeys", fake.collationKeys);
  mock.method(prismaUserStore, "createMany", fake.createMany);
});
afterEach(() => {
  mock.restoreAll();
  delegate.findUnique = original;
});
after(() => prisma.$disconnect());

describe("Admin data workspace", () => {
  it("blocks anonymous and demoted sessions on every endpoint", async () => {
    for (const path of [
      "/database",
      "/database/user",
      "/samples/student/xlsx",
    ]) {
      assert.equal((await request(app).get(path)).status, 401);
    }
    assert.equal((await request(app).post("/imports/save")).status, 401);
    delegate.findUnique = async () => ({
      ...admin,
      role: "Student",
      user_type: "student",
    });
    assert.equal(
      (await request(app).get("/database").set("Cookie", cookie)).status,
      403,
    );
    assert.equal(
      (await request(app).post("/imports/save").set("Cookie", cookie)).status,
      403,
    );
  });
  it("rejects removed endpoints and invalid database requests", async () => {
    for (const path of ["/student/preview", "/student/import", "/staff/import"]) {
      const response = await request(app).post(path).set("Cookie", cookie)
        .attach("file", sampleFile("staff", "csv"), "staff.csv");
      assert.equal(response.status, 404);
    }
    assert.equal((await request(app).get("/saved-users").set("Cookie", cookie)).status, 404);
    assert.equal(fake.users.length, 0);
    assert.equal((await request(app).get("/database/user%3BDELETE%20FROM%20user").set("Cookie", cookie)).status, 404);
    assert.equal((await request(app).get("/database/user?page=-1").set("Cookie", cookie)).status, 400);
  });
  it("serves a usable sample workbook as a download", async () => {
    const response = await request(app)
      .get("/samples/staff/xlsx")
      .set("Cookie", cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers["content-disposition"], /staff-sample.xlsx/);
    assert.match(response.headers["cache-control"], /no-store/);
  });

  it("validates JSON on save, preserves major codes, and never logs passwords", async () => {
    const { parseAndValidateCsvBuffer } = await import("../api/utils/csv/csvParser.js");
    const parsed = await parseAndValidateCsvBuffer(sampleFile("student", "csv"), "student");
    const data = {
      files: [
        {
          name: "students.csv",
          type: "student",
          rows: parsed.validRows.map((row) => ({
            line: row.row_number,
            data: { ...row.data, binusian_id: row.data.binusian_id ?? "" },
          })),
        },
      ],
    };
    const previousLogging = process.env.DEMO_IMPORT_LOG;
    process.env.DEMO_IMPORT_LOG = "true";
    const logs = mock.method(console, "info", () => {});
    try {
      const preview = await request(app)
        .post("/imports/preview")
        .set("Cookie", cookie)
        .send(data);
      assert.equal(preview.status, 200);
      assert.equal(preview.body.data.files[0].validCount, 8);
      assert.equal(fake.users.length, 0);
      assert.ok(!JSON.stringify(preview.body).includes("password"));
      // Modify the JSON after preview: the server must validate it again.
      data.files[0]!.rows[0]!.data.email = "bad-email";
      const saved = await request(app)
        .post("/imports/save")
        .set("Cookie", cookie)
        .send(data);
      assert.equal(saved.body.data.files[0].createdCount, 7);
      assert.equal(saved.body.data.files[0].failedCount, 1);
      assert.equal(
        fake.users[0]!.major_code,
        parsed.validRows[1]!.data.major_code,
      );
      assert.notEqual(
        fake.users[0]!.password,
        parsed.validRows[1]!.data.password,
      );
      const logText = JSON.stringify(
        logs.mock.calls.map((call) => call.arguments),
      );
      assert.match(logText, /received/);
      assert.match(logText, /import.student.2@example.test/);
      assert.ok(!logText.includes(parsed.validRows[1]!.data.password));
      assert.ok(!logText.includes("password"));
    } finally {
      if (previousLogging === undefined) delete process.env.DEMO_IMPORT_LOG;
      else process.env.DEMO_IMPORT_LOG = previousLogging;
    }
  });

  it("protects new routes and rejects malformed or excessive JSON batches", async () => {
    assert.equal(
      (await request(app).post("/imports/save").send({ files: [] })).status,
      401,
    );
    for (const data of [
      { files: [] },
      { files: new Array(5).fill({}) },
      {
        files: [{ name: "x", type: "student", rows: new Array(1001).fill({}) }],
      },
    ]) {
      assert.equal(
        (
          await request(app)
            .post("/imports/save")
            .set("Cookie", cookie)
            .send(data)
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await request(app)
          .post("/imports/save")
          .set("Cookie", cookie)
          .type("text")
          .send("{}")
      ).status,
      415,
    );
    delegate.findUnique = async () => ({ ...admin, role: "Student" });
    assert.equal(
      (
        await request(app)
          .post("/imports/preview")
          .set("Cookie", cookie)
          .send({ files: [] })
      ).status,
      403,
    );
  });

  it("returns a generic error when the database read fails", async () => {
    const originalQuery = prisma.$queryRaw;
    prisma.$queryRaw = () => { throw new Error("private database detail"); };
    try {
      const response = await request(app).get("/database").set("Cookie", cookie);
      assert.equal(response.status, 503);
      assert.equal(response.body.data, null);
      assert.ok(!JSON.stringify(response.body).includes("private database detail"));
    } finally {
      prisma.$queryRaw = originalQuery;
    }
  });

  it("accepts batches larger than four files and rejects more than 4,000 rows", async () => {
    const row = {
      line: 2,
      data: {
        nim: "001",
        name: "Demo",
        email: "demo@example.test",
        binusian_id: "",
        major_code: "CS",
        password: "secret",
      },
    };
    const file = { name: "students.csv", type: "student", rows: [row] };
    const preview = await request(app)
      .post("/imports/preview")
      .set("Cookie", cookie)
      .send({ files: new Array(6).fill(file) });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.files.length, 6);
    const manyRows = Array.from({ length: 1000 }, (_, i) => ({
      ...row,
      line: i + 2,
    }));
    const oversized = await request(app)
      .post("/imports/save")
      .set("Cookie", cookie)
      .send({ files: new Array(5).fill({ ...file, rows: manyRows }) });
    assert.equal(oversized.status, 400);
    assert.equal(fake.users.length, 0);
  });
});
