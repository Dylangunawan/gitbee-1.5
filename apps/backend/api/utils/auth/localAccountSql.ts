import { Prisma } from "../../prisma/generated/prisma/client.js";
import { staffRoles } from "../csv/csvParser.js";

// SQL versions of the rules in getLocalRoles (./auth.ts), for queries that must
// return exactly the accounts login signs in as students or as staff.
//
// The user table's collation cannot stand in for those rules. It ignores case
// and trailing spaces in `role`, where login needs an exact match, and it does
// not trim `user_type` the way login does. tests/localAccountSql.mysql.test.ts
// compares these conditions with getLocalRoles on real MySQL, so change the two
// together.

/** The code points String.prototype.trim removes (ECMAScript WhiteSpace and LineTerminator), as [first, last] ranges. */
export const trimmedCodePoints: readonly (readonly [number, number])[] = [
    [0x0009, 0x000d],
    [0x0020, 0x0020],
    [0x00a0, 0x00a0],
    [0x1680, 0x1680],
    [0x2000, 0x200a],
    [0x2028, 0x2029],
    [0x202f, 0x202f],
    [0x205f, 0x205f],
    [0x3000, 0x3000],
    [0xfeff, 0xfeff],
];

// The same set as an ICU character class. Spelled out rather than \s, which in
// MySQL's ICU also matches U+0085, a character trim keeps.
const icuCodePoint = (codePoint: number) => `\\x{${codePoint.toString(16).toUpperCase().padStart(4, "0")}}`;
const trimmed = `[${trimmedCodePoints
    .map(([first, last]) => (first === last ? icuCodePoint(first) : `${icuCodePoint(first)}-${icuCodePoint(last)}`))
    .join("")}]`;

/**
 * `user_type.trim().toLowerCase() === word`, for a lower-case ASCII word.
 * Anchored with \A and \z, because $ also matches just before a final line
 * terminator. The 'c' flag makes the match case-sensitive whatever the
 * collation, so only the listed letters match.
 */
const userTypeIs = (word: string) => {
    const letters = [...word].map((letter) => `[${letter}${letter.toUpperCase()}]`).join("");
    return Prisma.sql`REGEXP_LIKE(user_type, ${`\\A${trimmed}*${letters}${trimmed}*\\z`}, 'c')`;
};

/** `role === value`: a byte comparison, so case and trailing spaces count as they do in login. */
export const roleIs = (role: string) => Prisma.sql`CAST(role AS BINARY) = CAST(${role} AS BINARY)`;

/** True for the user rows login signs in as students. */
export const isStudentAccount = Prisma.sql`(${roleIs("Student")} OR IFNULL(${userTypeIs("student")}, FALSE))`;

/**
 * True for the user rows login signs in as staff: one of the staff roles, with
 * no user_type or the staff type. Such a row is never also a student.
 */
export const isStaffAccount = Prisma.sql`((${Prisma.join(staffRoles.map(roleIs), " OR ")}) AND (user_type IS NULL OR ${userTypeIs("staff")}))`;
