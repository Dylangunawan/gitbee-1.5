import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, it } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import * as xlsx from "xlsx";

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL =
  databaseUrl ?? "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "roundtrip-integration-test";
process.env.COOKIE_NAME = "roundtrip_test";
process.env.DEMO_TOOLS = "true";
const { prisma } = await import("../api/prisma/client.js");
const { default: routes } = await import(
  "../api/routes/Routes.js"
);
const { sampleFile } = await import("../api/utils/demo/sampleFiles.js");
const { createLocalToken } = await import("../api/utils/auth/auth.js");
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api", routes);
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
        const workbook = xlsx.read(buffer, { type: "buffer", raw: true });
        const values = xlsx.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, {
          header: 1, raw: false, defval: "",
        });
        const headers = values[0]!;
        const parsed = {
          name: type + "." + format,
          type,
          rows: values.slice(1).map((row, index) => ({
            line: index + 2,
            data: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
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
      .post("/api/user/admin/data-tools/imports/preview")
      .set("Cookie", cookie)
      .send(body);
    assert.equal(preview.status, 200);
    assert.equal(await prisma.user.count(ownUsers), before);
    const response = await request(app)
      .post("/api/user/admin/data-tools/imports/save")
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
    const saved: Record<string, unknown>[] = [];
    // Restrict every page to this run. Other test files add/remove thousands of
    // accounts concurrently, which must not move our rows between offsets.
    for (const type of ["student", "staff"]) {
      for (let page = 1; ; page++) {
        const fetched = await request(app)
          .get(`/api/user/admin/get-${type}-accounts`)
          .query({ search: domain, page, pageSize: 5 })
          .set("Cookie", cookie);
        assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
        const { items, total, pageSize } = fetched.body.data;
        saved.push(...items.filter((row: { email: string }) => row.email !== admin.email));
        if (page * pageSize >= total) break;
      }
      const empty = await request(app).get(`/api/user/admin/get-${type}-accounts`)
        .query({ search: domain, page: 100000 }).set("Cookie", cookie);
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.body.data.items, []);
    }
    assert.equal(saved.length, 14);
    for (const source of [files[0]!, files[2]!]) {
      for (const { data } of source.rows) {
        const row = saved.find((candidate) => candidate.email === data.email);
        assert.ok(row);
        for (const key of ["name", "email", "binusian_id"])
          assert.equal(row[key], data[key] || null);
        assert.equal(row.student_id ?? null, data.nim ?? null);
        assert.equal(row.lecturer_code ?? null, data.lecturer_code ?? null);
        assert.equal(row.major_code ?? null, data.major_code ?? null);
        assert.equal(row.major_codes ?? null, data.major_codes ?? null);
        assert.equal(row.role ?? "Student", data.role ?? "Student");
        assert.ok(!("password" in row));
        assert.ok(!("credential_version" in row));
      }
    }
    const again = await request(app)
      .post("/api/user/admin/data-tools/imports/save")
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
  },
);
