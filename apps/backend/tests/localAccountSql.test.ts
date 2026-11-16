// The whitespace the SQL account rules trim must be exactly what login trims.
// Database-free; localAccountSql.mysql.test.ts runs the SQL itself.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";
const { trimmedCodePoints } = await import("../api/utils/auth/localAccountSql.js");

describe("trimmedCodePoints", () => {
  it("lists exactly the characters String.prototype.trim removes", () => {
    const listed = new Set<number>();
    for (const [first, last] of trimmedCodePoints) {
      for (let codePoint = first; codePoint <= last; codePoint++) listed.add(codePoint);
    }

    const trimmed: number[] = [];
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
      if (String.fromCodePoint(codePoint).trim() === "") trimmed.push(codePoint);
    }

    assert.deepEqual([...listed].sort((a, b) => a - b), trimmed);
  });

  it("leaves out characters that look like whitespace but trim keeps", () => {
    const listed = (codePoint: number) => trimmedCodePoints.some(([first, last]) => codePoint >= first && codePoint <= last);

    // NEXT LINE, ZERO WIDTH SPACE and MONGOLIAN VOWEL SEPARATOR
    for (const codePoint of [0x0085, 0x200b, 0x180e]) {
      assert.equal(listed(codePoint), false, `U+${codePoint.toString(16).padStart(4, "0")}`);
    }
  });
});
