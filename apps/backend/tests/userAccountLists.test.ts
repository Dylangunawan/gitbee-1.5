// GET /user/admin/get-student-accounts and /get-staff-accounts: the paged
// account lists the admin UI reads after a CSV import. Database-free: Prisma
// is stubbed; userAccountLists.mysql.test.ts runs the real queries.
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

type Query = { where?: unknown; skip?: number; take?: number; orderBy?: unknown; select?: Record<string, unknown> };
let countQueries: Query[] = [];
let findManyQueries: Query[] = [];
let total = 0;
let rows: unknown[] = [];
let failWith: Error | null = null;

const restores: (() => void)[] = [];
function stub<T extends object>(target: T, key: keyof T, value: unknown) {
  const object = target as Record<keyof T, unknown>;
  const original = object[key];
  object[key] = value;
  restores.push(() => { object[key] = original; });
}

beforeEach(() => {
  countQueries = [];
  findManyQueries = [];
  total = 0;
  rows = [];
  failWith = null;
  stub(prisma.user, "findUnique", async ({ where }: { where: { id?: number } }) =>
    where.id === adminAccount.id ? adminAccount : where.id === lecturerAccount.id ? lecturerAccount : null);
  stub(prisma.user, "count", (query: Query) => { countQueries.push(query); return total; });
  stub(prisma.user, "findMany", (query: Query) => { findManyQueries.push(query); return rows; });
  stub(prisma, "$transaction", async (operations: unknown[]) => {
    if (failWith) throw failWith;
    return Promise.all(operations);
  });
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
    assert.equal(findManyQueries.length, 0);
  });

  it("returns the first page of student accounts, newest first", async () => {
    total = 1;
    rows = [{ id: 7, student_id: "2501000001", name: "Ana", email: "ana@example.com", binusian_id: null, created_at: new Date("2026-11-15T00:00:00Z") }];

    const response = await request(app).get(studentsPath).set("Cookie", adminCookie);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      items: [{ id: 7, student_id: "2501000001", name: "Ana", email: "ana@example.com", binusian_id: null, created_at: "2026-11-15T00:00:00.000Z" }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const [query] = findManyQueries;
    assert.deepEqual(query?.where, { AND: [{ OR: [{ role: "Student" }, { user_type: "student" }] }, {}] });
    assert.deepEqual(countQueries[0]?.where, query?.where);
    assert.deepEqual(query?.orderBy, [{ created_at: "desc" }, { id: "desc" }]);
    assert.equal(query?.skip, 0);
    assert.equal(query?.take, 50);
    assert.ok(!("password" in (query?.select ?? {})), "never selects the password hash");
  });

  it("searches student identifiers, email and name, and pages with skip/take", async () => {
    await request(app).get(studentsPath).query({ search: " 2501 ", page: "3", pageSize: "20" }).set("Cookie", adminCookie);

    const [query] = findManyQueries;
    assert.deepEqual(query?.where, {
      AND: [
        { OR: [{ role: "Student" }, { user_type: "student" }] },
        { OR: [
          { student_id: { contains: "2501" } },
          { binusian_id: { contains: "2501" } },
          { email: { contains: "2501" } },
          { name: { contains: "2501" } },
        ] },
      ],
    });
    assert.equal(query?.skip, 40);
    assert.equal(query?.take, 20);
  });

  it("treats a blank search as no filter", async () => {
    await request(app).get(studentsPath).query({ search: "   " }).set("Cookie", adminCookie);

    assert.deepEqual((findManyQueries[0]?.where as { AND: unknown[] }).AND[1], {});
  });

  it("lists staff accounts with their HoP majors and filters by role", async () => {
    total = 1;
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
    assert.deepEqual(findManyQueries[0]?.where, {
      AND: [
        { role: { in: ["Lecturer", "Admin", "SCC", "HoP"] }, OR: [{ user_type: null }, { user_type: "staff" }] },
        { role: "HoP" },
        { OR: [
          { lecturer_code: { contains: "RA23" } },
          { binusian_id: { contains: "RA23" } },
          { email: { contains: "RA23" } },
          { name: { contains: "RA23" } },
        ] },
      ],
    });
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
    assert.equal(findManyQueries.length, 0);
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
