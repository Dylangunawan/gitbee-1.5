import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, it } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL =
  databaseUrl ?? "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "roundtrip-integration-test";
process.env.COOKIE_NAME = "roundtrip_test";
const { prisma } = await import("../api/prisma/client.js");
const { default: routes } = await import(
  "../api/routes/user/admin/dataToolsRoutes.js"
);
const { sampleFile } = await import("../api/utils/demo/sampleFiles.js");
const { parseSpreadsheet } = await import(
  "../api/utils/csv/spreadsheetParser.js"
);
const { createLocalToken } = await import("../api/utils/auth/auth.js");
const { fetchDemoData } = await import("../api/utils/demo/fetchDemoData.js");
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(routes);
const run = randomBytes(5).toString("hex");
const domain = run + ".roundtrip.example.test";
after(async () => {
  if (databaseUrl)
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@" + domain } },
    });
  await prisma.$disconnect();
});

it(
  "round trips four CSV/Excel payloads through JSON routes and real ORM reads",
  {
    skip: !databaseUrl && "set TEST_DATABASE_URL to a migrated test database",
  },
  async () => {
    const admin = await prisma.user.create({
      data: {
        name: "Roundtrip Admin",
        email: "admin@" + domain,
        role: "Admin",
      },
    });
    const cookie = "roundtrip_test=" + createLocalToken(admin).token;
    const files = [];
    for (const type of ["student", "staff"] as const) {
      for (const format of ["csv", "xlsx"] as const) {
        const buffer = sampleFile(type, format);
        const validation = await parseSpreadsheet(
          buffer,
          type + "." + format,
          type,
        );
        const parsed = {
          name: type + "." + format,
          type,
          rows: validation.validRows.map(({ row_number, data }) => ({
            line: row_number,
            data: Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, value ?? ""]),
            ),
          })),
        };
        parsed.rows.forEach(({ data }) => {
          data.email = data.email!.split("@")[0] + "@" + domain;
          for (const key of ["nim", "lecturer_code", "binusian_id"])
            if (data[key]) data[key] = run + data[key];
        });
        files.push(parsed);
      }
    }
    const body = { files };
    const ownUsers = { where: { email: { endsWith: "@" + domain } } };
    const before = await prisma.user.count(ownUsers);
    const preview = await request(app)
      .post("/imports/preview")
      .set("Cookie", cookie)
      .send(body);
    assert.equal(preview.status, 200);
    assert.equal(await prisma.user.count(ownUsers), before);
    const response = await request(app)
      .post("/imports/save")
      .set("Cookie", cookie)
      .send(body);
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.files.map(
        (file: { createdCount: number; skippedCount: number }) => [
          file.createdCount,
          file.skippedCount,
        ],
      ),
      [
        [8, 0],
        [0, 8],
        [6, 0],
        [0, 6],
      ],
    );
    // Disconnect the connection pool: the next HTTP request must read persisted DB rows.
    await prisma.$disconnect();
    const fetched = await request(app)
      .get("/saved-users")
      .set("Cookie", cookie);
    assert.equal(fetched.status, 200);
    // Other integration files may insert concurrently into the same test DB.
    const allRows = new Map<string, Record<string, unknown>>();
    let data = fetched.body.data;
    for (let page = 1; ; page++) {
      for (const row of data.rows) allRows.set(row.email, row);
      if (page * data.pageSize >= data.total) break;
      data = (
        await request(app)
          .get("/saved-users?page=" + (page + 1))
          .set("Cookie", cookie)
      ).body.data;
    }
    const saved = [...allRows.values()].filter(
      (row) =>
        String(row.email).endsWith("@" + domain) && row.email !== admin.email,
    );
    assert.equal(saved.length, 14);
    for (const source of [files[0]!, files[2]!]) {
      for (const { data } of source.rows) {
        const row = saved.find((candidate) => candidate.email === data.email);
        assert.ok(row);
        for (const key of ["name", "email", "binusian_id"])
          assert.equal(row[key], data[key] || null);
        assert.equal(row.student_id, data.nim ?? null);
        assert.equal(row.lecturer_code, data.lecturer_code ?? null);
        assert.equal(row.major_code, data.major_code ?? null);
        assert.equal(row.major_codes, data.major_codes ?? null);
        assert.equal(row.role, data.role ?? "Student");
        assert.ok(!("password" in row));
        assert.ok(!("credential_version" in row));
      }
    }
    const again = await request(app)
      .post("/imports/save")
      .set("Cookie", cookie)
      .send(body);
    assert.equal(
      again.body.data.files.reduce(
        (sum: number, file: { createdCount: number }) =>
          sum + file.createdCount,
        0,
      ),
      0,
    );
    assert.equal((await fetchDemoData(100000)).rows.length, 0);
  },
);
