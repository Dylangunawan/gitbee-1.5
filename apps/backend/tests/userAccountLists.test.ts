// GET /user/admin/get-student-accounts and /get-staff-accounts: the paged
// account lists the admin UI reads after a CSV import. Database-free: Prisma
// is stubbed, so this covers the HTTP contract, the paging arithmetic and what
// reaches the queries. userAccountLists.mysql.test.ts runs the real queries.
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "user-account-lists-test-secret";
process.env.COOKIE_NAME = "account_lists_test";

const { prisma } = await import("../api/prisma/client.js");
const { default: userRoutes } = await import("../api/routes/user/userRoutes.js");
const { createLocalToken } = await import("../api/utils/auth/auth.js");

const app = express();
app.use(cookieParser());
app.use("/api/user", userRoutes);

const adminAccount = {
  id: 1, email: "admin@example.com", name: "Admin", role: "Admin", user_type: null,
  student_id: null, binusian_id: null, lecturer_code: "D5000", credential_version: 0,
};
const lecturerAccount = { ...adminAccount, id: 2, email: "lecturer@example.com", role: "Lecturer", lecturer_code: "D5001" };
const cookieFor = (account: typeof adminAccount) =>
  `${process.env.COOKIE_NAME}=${createLocalToken(account).token}`;
const adminCookie = cookieFor(adminAccount);

const studentsPath = "/api/user/admin/get-student-accounts";
const staffPath = "/api/user/admin/get-staff-accounts";

// The service counts and pages the matching ids in two raw queries inside one
// transaction, then loads that page's rows by id.
type RawQuery = { sql: string; values: unknown[] };
type RowQuery = { where?: unknown; select?: Record<string, unknown> };
let rawQueries: RawQuery[] = [];
let rowQueries: RowQuery[] = [];
let total = 0;
let pageIds: number[] = [];
let rows: unknown[] = [];
let failWith: Error | null = null;

const countQuery = () => rawQueries.find((query) => query.sql.includes("COUNT(*)"));
const pageQuery = () => rawQueries.find((query) => query.sql.includes("ORDER BY"));

const restores: (() => void)[] = [];
function stub<T extends object>(target: T, key: keyof T, value: unknown) {
  const object = target as Record<keyof T, unknown>;
  const original = object[key];
  object[key] = value;
  restores.push(() => { object[key] = original; });
}

beforeEach(() => {
  rawQueries = [];
  rowQueries = [];
  total = 0;
  pageIds = [];
  rows = [];
  failWith = null;
  stub(prisma.user, "findUnique", async ({ where }: { where: { id?: number } }) =>
    where.id === adminAccount.id ? adminAccount : where.id === lecturerAccount.id ? lecturerAccount : null);
  stub(prisma, "$queryRaw", (query: RawQuery) => { rawQueries.push({ sql: query.sql, values: query.values }); return query; });
  stub(prisma, "$transaction", async () => {
    if (failWith) throw failWith;
    return [[{ total: BigInt(total) }], pageIds.map((id) => ({ id }))];
  });
  stub(prisma.user, "findMany", (query: RowQuery) => { rowQueries.push(query); return rows; });
});
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
});
after(async () => prisma.$disconnect());

describe("account lists for the CSV imports", () => {
  it("require an admin session", async () => {
    for (const path of [studentsPath, staffPath]) {
      assert.equal((await request(app).get(path)).status, 401, path);
      assert.equal((await request(app).get(path).set("Cookie", cookieFor(lecturerAccount))).status, 403, path);
    }
    assert.equal(rawQueries.length, 0);
    assert.equal(rowQueries.length, 0);
  });

  it("returns the first page of student accounts, newest first", async () => {
    total = 1;
    pageIds = [7];
    rows = [{ id: 7, student_id: "2501000001", name: "Ana", email: "ana@example.com", binusian_id: null, created_at: new Date("2026-11-15T00:00:00Z") }];

    const response = await request(app).get(studentsPath).set("Cookie", adminCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      items: [{ id: 7, student_id: "2501000001", name: "Ana", email: "ana@example.com", binusian_id: null, created_at: "2026-11-15T00:00:00.000Z" }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    assert.equal(rawQueries.length, 2, "one count and one page of ids");
    assert.match(pageQuery()?.sql ?? "", /ORDER BY created_at DESC, id DESC LIMIT \? OFFSET \?$/);
    assert.deepEqual(pageQuery()?.values.slice(-2), [50n, 0n]);
    assert.deepEqual(countQuery()?.values, pageQuery()?.values.slice(0, -2), "counts with the same conditions it pages with");
    assert.deepEqual(rowQueries[0]?.where, { id: { in: [7] } });
    assert.ok(!("password" in (rowQueries[0]?.select ?? {})), "never selects the password hash");
  });

  it("keeps the rows in page order, whatever order they are loaded in", async () => {
    total = 3;
    pageIds = [9, 4, 7];
    rows = [4, 7, 9].map((id) => ({ id, student_id: `S${id}`, name: "N", email: `s${id}@example.com`, binusian_id: null, created_at: new Date(0) }));

    const response = await request(app).get(studentsPath).set("Cookie", adminCookie);

    assert.deepEqual(response.body.data.items.map((item: { id: number }) => item.id), [9, 4, 7]);
  });

  it("does not load rows for an empty page", async () => {
    total = 3;

    const response = await request(app).get(studentsPath).query({ page: "9" }).set("Cookie", adminCookie);

    assert.deepEqual(response.body.data, { items: [], total: 3, page: 9, pageSize: 50 });
    assert.equal(rowQueries.length, 0);
  });

  it("searches student identifiers, email and name, and pages with limit/offset", async () => {
    await request(app).get(studentsPath).query({ search: " 2501 ", page: "3", pageSize: "20" }).set("Cookie", adminCookie);

    const query = pageQuery();
    assert.match(query?.sql ?? "", /student_id LIKE \? ESCAPE '!' OR binusian_id LIKE \? ESCAPE '!' OR email LIKE \? ESCAPE '!' OR name LIKE \? ESCAPE '!'/);
    assert.deepEqual(query?.values.slice(-6), ["%2501%", "%2501%", "%2501%", "%2501%", 20n, 40n]);
  });

  it("searches for % and _ as typed, not as wildcards", async () => {
    await request(app).get(studentsPath).query({ search: "50%_off!" }).set("Cookie", adminCookie);

    assert.equal(pageQuery()?.values.at(-3), "%50!%!_off!!%");
  });

  it("treats a blank search as no filter", async () => {
    await request(app).get(studentsPath).query({ search: "   " }).set("Cookie", adminCookie);

    assert.ok(!pageQuery()?.sql.includes(" LIKE ?"));
  });

  it("lists staff accounts with their HoP majors and filters by role", async () => {
    total = 1;
    pageIds = [9];
    rows = [{
      id: 9, lecturer_code: "RA23-1", name: "Roger", email: "roger@example.com", binusian_id: "B1", role: "HoP",
      created_at: new Date("2026-11-15T00:00:00Z"),
      hopMajors: [{ major: { id: 6, name: "Computer Science" } }],
    }];

    const response = await request(app).get(staffPath).query({ roleFilter: "HoP", search: "RA23" }).set("Cookie", adminCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.items, [{
      id: 9, lecturer_code: "RA23-1", name: "Roger", email: "roger@example.com", binusian_id: "B1", role: "HoP",
      created_at: "2026-11-15T00:00:00.000Z", hop_major: [{ id: 6, name: "Computer Science" }],
    }]);
    const filtered = pageQuery();
    assert.match(filtered?.sql ?? "", /lecturer_code LIKE \? ESCAPE '!'/);
    assert.deepEqual(filtered?.values.slice(-6), ["%RA23%", "%RA23%", "%RA23%", "%RA23%", 50n, 0n]);

    // The role filter adds one exact role comparison to the ones that define staff.
    rawQueries = [];
    await request(app).get(staffPath).set("Cookie", adminCookie);
    const hopComparisons = (query: RawQuery | undefined) => query?.values.filter((value) => value === "HoP").length;
    assert.equal(hopComparisons(filtered), 2);
    assert.equal(hopComparisons(pageQuery()), 1);
  });

  it("rejects invalid paging and role filters before querying", async () => {
    for (const [path, query] of [
      [studentsPath, { page: "0" }],
      [studentsPath, { pageSize: "201" }],
      [studentsPath, { pageSize: "ten" }],
      [staffPath, { roleFilter: "Student" }],
      [staffPath, { page: "1.5" }],
    ] as const) {
      const response = await request(app).get(path).query(query).set("Cookie", adminCookie);
      assert.equal(response.status, 400, `${path} ${JSON.stringify(query)}`);
      assert.ok(Array.isArray(response.body.errors), "lists what was wrong");
    }
    assert.equal(rawQueries.length, 0);
  });

  it("answers a database failure with a generic 500", async () => {
    failWith = new Error("connect ECONNREFUSED 10.0.0.5:3306");

    for (const path of [studentsPath, staffPath]) {
      const response = await request(app).get(path).set("Cookie", adminCookie);
      assert.equal(response.status, 500);
      assert.equal(response.body.errors, "Fetch Failed");
    }
  });
});
