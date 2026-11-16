// The account lists against real MySQL: which rows count as student or staff
// (the same rules as login), search, paging, and reading back a CSV import.
// Skipped unless TEST_DATABASE_URL points at a migrated test database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "user-account-lists-mysql-secret";
process.env.COOKIE_NAME = "account_lists_mysql";
const { prisma } = await import("../api/prisma/client.js");
const { default: routes } = await import("../api/routes/Routes.js");
const { createLocalToken } = await import("../api/utils/auth/auth.js");

const app = express();
app.use(express.json(), cookieParser());
app.use("/api", routes);

const suffix = randomBytes(5).toString("hex");
const domain = `accounts-${suffix}.example.test`;
let adminCookie = "";
let majorId = 0;

interface ListBody<T> { items: T[]; total: number; page: number; pageSize: number }
type StudentItem = { id: number; student_id: string; created_at: string } & Record<string, unknown>;
type StaffItem = { id: number; lecturer_code: string; role: string; hop_major: { id: number; name: string }[] } & Record<string, unknown>;

const list = async <T>(path: string, query: Record<string, string> = {}) => {
  const response = await request(app).get(`/api/user/admin/${path}`)
    .query({ search: domain, ...query }).set("Cookie", adminCookie);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data as ListBody<T>;
};
const isNewestFirst = (items: { id: number; created_at: string }[]) => items.every((item, index) => {
  const next = items[index + 1];
  return !next || item.created_at > next.created_at || (item.created_at === next.created_at && item.id > next.id);
});

before(async () => {
  if (!databaseUrl) return;
  majorId = (await prisma.major.create({ data: { name: `Major ${suffix}` } })).id;
  const admin = await prisma.user.create({
    data: { email: `admin@${domain}`, name: "List Admin", role: "Admin", lecturer_code: `ADM-${suffix}` },
  });
  adminCookie = `${process.env.COOKIE_NAME}=${createLocalToken(admin).token}`;

  await prisma.user.createMany({ data: [
    // Students: by role, by user_type (any case), or both.
    { email: `s1@${domain}`, name: "Student Both", role: "Student", user_type: "student", student_id: `S1-${suffix}`, binusian_id: `BS1-${suffix}` },
    { email: `s2@${domain}`, name: "Student Role", role: "Student", user_type: null, student_id: `S2-${suffix}` },
    { email: `s3@${domain}`, name: "Student Type", role: "Lecturer", user_type: "STUDENT", student_id: `S3-${suffix}` },
    // Staff: a staff role with no type or the "staff" type (any case).
    { email: `lec@${domain}`, name: "Staff Lecturer", role: "Lecturer", user_type: null, lecturer_code: `LEC-${suffix}` },
    { email: `scc@${domain}`, name: "Staff SCC", role: "SCC", user_type: "staff", lecturer_code: `SCC-${suffix}` },
    // Login gives an unrecognised type no roles, so neither list shows it.
    { email: `bad@${domain}`, name: "Unclassified", role: "Lecturer", user_type: "contractor", lecturer_code: `BAD-${suffix}` },
  ] });
  await prisma.user.create({
    data: {
      email: `hop@${domain}`, name: "Staff HoP", role: "HoP", user_type: "Staff", lecturer_code: `HOP-${suffix}`,
      hopMajors: { create: [{ major: { connect: { id: majorId } } }] },
    },
  });
});

after(async () => {
  if (databaseUrl) {
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
    await prisma.major.deleteMany({ where: { id: majorId } });
  }
  await prisma.$disconnect();
});

describe("account lists against MySQL", { skip: databaseUrl ? false : "set TEST_DATABASE_URL to a migrated test database" }, () => {
  it("lists exactly the accounts login treats as students, newest first", async () => {
    const body = await list<StudentItem>("get-student-accounts");

    assert.equal(body.total, 3);
    assert.deepEqual(body.items.map((item) => item.student_id).sort(), [`S1-${suffix}`, `S2-${suffix}`, `S3-${suffix}`]);
    assert.ok(isNewestFirst(body.items));
    assert.ok(body.items.every((item) => !("password" in item)));
  });

  it("pages through students without gaps or overlap", async () => {
    const first = await list<StudentItem>("get-student-accounts", { page: "1", pageSize: "2" });
    const second = await list<StudentItem>("get-student-accounts", { page: "2", pageSize: "2" });
    const third = await list<StudentItem>("get-student-accounts", { page: "3", pageSize: "2" });

    assert.deepEqual([first.items.length, second.items.length, third.items.length], [2, 1, 0]);
    assert.deepEqual([first.total, second.total, third.total], [3, 3, 3]);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 3);
  });

  it("lists staff the way login does, with HoP majors, and filters by role", async () => {
    const all = await list<StaffItem>("get-staff-accounts");
    assert.deepEqual(all.items.map((item) => item.lecturer_code).sort(),
      [`ADM-${suffix}`, `HOP-${suffix}`, `LEC-${suffix}`, `SCC-${suffix}`]);

    const hop = await list<StaffItem>("get-staff-accounts", { roleFilter: "HoP" });
    assert.equal(hop.total, 1);
    assert.deepEqual(hop.items[0]?.hop_major, [{ id: majorId, name: `Major ${suffix}` }]);
  });

  it("searches case-insensitively, like the column collation", async () => {
    const body = await list<StudentItem>("get-student-accounts", { search: `S2-${suffix}`.toUpperCase() });

    assert.deepEqual(body.items.map((item) => item.student_id), [`S2-${suffix}`]);
  });

  it("shows students imported by CSV at the top of the list", async () => {
    const csv = [
      "nim,name,email,binusian_id,major_code,password",
      `N1-${suffix},Imported One,n1@${domain},,COMP,first-pass`,
      `N2-${suffix},Imported Two,n2@${domain},,COMP,second-pass`,
    ].join("\n");
    const upload = await request(app).post("/api/user/admin/upload-student-csv")
      .attach("file", Buffer.from(csv), { filename: "students.csv", contentType: "text/csv" })
      .set("Cookie", adminCookie);
    assert.equal(upload.status, 200, JSON.stringify(upload.body));
    assert.equal(upload.body.data.createdCount, 2);

    const firstPage = await list<StudentItem>("get-student-accounts", { pageSize: "2" });

    assert.equal(firstPage.total, 5);
    assert.deepEqual(firstPage.items.map((item) => item.student_id).sort(), [`N1-${suffix}`, `N2-${suffix}`]);
  });

  it("round-trips JSON demo imports through both account routes", async () => {
    const files = [
      { name: "new-students.csv", type: "student", rows: [{ line: 2, data: {
        nim: `JSON-S-${suffix}`, name: "JSON Student", email: `json-student@${domain}`,
        binusian_id: `JSON-B-${suffix}`, major_code: "CS", password: "roundtrip-secret",
      } }] },
      { name: "new-staff.xlsx", type: "staff", rows: [{ line: 2, data: {
        lecturer_code: `JSON-L-${suffix}`, name: "JSON Lecturer", email: `json-staff@${domain}`,
        binusian_id: "", role: "Lecturer", major_codes: "CS;DS", password: "roundtrip-secret",
      } }] },
    ];
    const path = "/api/user/admin/data-tools/imports/";
    for (const action of ["preview", "save"]) {
      assert.equal((await request(app).post(path + action).send({ files })).status, 401);
    }
    const preview = await request(app).post(path + "preview").set("Cookie", adminCookie).send({ files });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual(preview.body.data.files.map((file: { validCount: number }) => file.validCount), [1, 1]);
    assert.ok(!JSON.stringify(preview.body).includes("roundtrip-secret"));
    assert.equal(await prisma.user.count({ where: { email: { startsWith: "json-", endsWith: `@${domain}` } } }), 0);
    const saved = await request(app).post(path + "save").set("Cookie", adminCookie).send({ files });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.data.files.map((file: { createdCount: number }) => file.createdCount), [1, 1]);

    const students = await list<StudentItem>("get-student-accounts", { pageSize: "1" });
    assert.equal(students.items[0]?.student_id, `JSON-S-${suffix}`);
    assert.equal(students.items[0]?.major_code, "CS");
    const staff = await list<StaffItem>("get-staff-accounts", { roleFilter: "Lecturer", pageSize: "1" });
    assert.equal(staff.items[0]?.lecturer_code, `JSON-L-${suffix}`);
    assert.equal(staff.items[0]?.major_codes, "CS;DS");
    assert.deepEqual(staff.items[0]?.hop_major, []);
    for (const item of [...students.items, ...staff.items]) {
      assert.ok(!("password" in item));
      assert.ok(!("credential_version" in item));
    }
    const again = await request(app).post(path + "save").set("Cookie", adminCookie).send({ files });
    assert.deepEqual(again.body.data.files.map((file: { createdCount: number; skippedCount: number }) =>
      [file.createdCount, file.skippedCount]), [[0, 1], [0, 1]]);
    const missing = await list<StudentItem>("get-student-accounts", { search: `missing-${suffix}` });
    assert.equal(missing.total, 0);
    assert.deepEqual(missing.items, []);
  });
});
