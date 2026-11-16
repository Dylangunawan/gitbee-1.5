// The SQL account rules (utils/auth/localAccountSql.ts) must sort every user row
// the way login's getLocalRoles does: as a student, as staff, or as neither.
// This stores a few thousand awkward role and user_type spellings in the real
// user table and compares the two.
// Skipped unless TEST_DATABASE_URL points at a migrated test database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = databaseUrl ?? "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET ??= "local-account-sql-test-secret";
const { prisma } = await import("../api/prisma/client.js");
const { Prisma } = await import("../api/prisma/generated/prisma/client.js");
const { getLocalRoles } = await import("../api/utils/auth/auth.js");
const { isStaffAccount, isStudentAccount } = await import("../api/utils/auth/localAccountSql.js");

const domain = `account-rules-${randomBytes(5).toString("hex")}.example.test`;

const roles = [
  "Student", "student", "STUDENT", "Student ", " Student", "Stüdent",
  "Lecturer", "lecturer", "Lecturer ", "Admin", "admin", "ADMIN",
  "SCC", "scc", "HoP", "HOP", "hop", "", "Guest",
];
// Characters trim removes (space, tab, line breaks, no-break space, ideographic
// space, byte order mark), and some it keeps (NEXT LINE, zero width space, "_").
const paddings = ["", " ", "  ", "\t", "\r\n", "\u000b", " ", " ", " ", "　", "﻿", "\u0085", "​", "_"];
const words = ["student", "Student", "STUDENT", "staff", "Staff", "STAFF", "stüdent", "ſtaff", "students", "staf", "contractor", ""];
const userTypes = [...new Set<string | null>([
  null,
  ...words.flatMap((word) => paddings.flatMap((padding) => [padding + word, word + padding, padding + word + padding])),
])];

const label = (value: string | null) => (value === null ? "NULL" : JSON.stringify(value).replace(/[^\x20-\x7e]/g,
  (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`));

after(async () => {
  if (databaseUrl) await prisma.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  await prisma.$disconnect();
});

describe("SQL account rules against MySQL", {
  skip: databaseUrl ? false : "set TEST_DATABASE_URL to a migrated test database",
}, () => {
  it("classify every role and user_type combination the way login does", async () => {
    const accounts = roles.flatMap((role) => userTypes.map((user_type) => ({ role, user_type })));
    const data = accounts.map(({ role, user_type }, index) => ({
      email: `u${index}@${domain}`, name: `Rule case ${index}`, role, user_type,
    }));
    for (let start = 0; start < data.length; start += 1000) {
      await prisma.user.createMany({ data: data.slice(start, start + 1000) });
    }

    const rows = await prisma.$queryRaw<{ email: string; role: string; user_type: string | null; student: unknown; staff: unknown }[]>(
      Prisma.sql`SELECT email, role, user_type, ${isStudentAccount} AS student, ${isStaffAccount} AS staff
                 FROM user WHERE email LIKE ${`%@${domain}`}`
    );
    assert.equal(rows.length, accounts.length);

    const problems: string[] = [];
    for (const row of rows) {
      const stored = accounts[Number(row.email.slice(1, row.email.indexOf("@")))]!;
      if (row.role !== stored.role || row.user_type !== stored.user_type) {
        problems.push(`stored ${label(stored.role)} / ${label(stored.user_type)} but read back ${label(row.role)} / ${label(row.user_type)}`);
        continue;
      }
      const loginRoles = getLocalRoles(row);
      const login = loginRoles.includes("Student") ? "student" : loginRoles.length > 0 ? "staff" : "neither";
      const sql = Number(row.student) ? (Number(row.staff) ? "both" : "student") : Number(row.staff) ? "staff" : "neither";
      if (sql !== login) problems.push(`role ${label(row.role)}, user_type ${label(row.user_type)}: login says ${login}, SQL says ${sql}`);
    }

    assert.deepEqual(problems.slice(0, 20), [], `${problems.length} of ${rows.length} rows disagree`);
  });
});
