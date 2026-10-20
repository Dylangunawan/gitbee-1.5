import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CsvParsingError,
  parseAndValidateCsvBuffer,
} from "../api/utils/csv/csvParser.js";

const studentHeaders = "nim,name,email,binusian_id,major_code,password";
const staffHeaders =
  "lecturer_code,name,email,binusian_id,role,major_codes,password";

describe("CSV parsing and row validation", () => {
  it("rejects an empty buffer with the expected error", async () => {
    await assert.rejects(
      parseAndValidateCsvBuffer(Buffer.alloc(0), "student"),
      (error: unknown) =>
        error instanceof CsvParsingError &&
        error.message === "CSV file cannot be empty"
    );
  });

  it("strips BOM markers and trims headers and values", async () => {
    const contents = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(
        ` ${studentHeaders} \n 2501959296 , Ada , ada@example.com , B123 , COMP , secret `
      ),
    ]);

    const result = await parseAndValidateCsvBuffer(contents, "student");

    assert.equal(result.totalParsed, 1);
    assert.deepEqual(result.validRows[0], {
      nim: "2501959296",
      name: "Ada",
      email: "ada@example.com",
      binusian_id: "B123",
      major_code: "COMP",
      password: "secret",
    });
    assert.deepEqual(result.errors, []);
  });

  it("reports invalid rows using data-row line numbers", async () => {
    const result = await parseAndValidateCsvBuffer(
      Buffer.from(
        `${studentHeaders}\n2501959296,Ada,ada@example.com,B123,COMP,secret\ninvalid,Bob,invalid,B123,COMP,secret\n`
      ),
      "student"
    );

    assert.equal(result.totalParsed, 2);
    assert.equal(result.validRows.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.line, 3);
    assert.match(result.errors[0]?.errors[0] ?? "", /^email:/);
  });

  it("rejects CSV files missing required columns", async () => {
    await assert.rejects(
      parseAndValidateCsvBuffer(
        Buffer.from("nim,name,email\n2501959296,Ada,ada@example.com\n"),
        "student"
      ),
      /Missing required CSV columns: binusian_id, major_code, password/
    );
  });

  it("checks staff headers and validates staff rows separately", async () => {
    const result = await parseAndValidateCsvBuffer(
      Buffer.from(
        `${staffHeaders}\nTY23-1,Ada,ada@example.com,B123,Lecturer,COMP;MATH,secret\n`
      ),
      "staff"
    );

    assert.equal(result.totalParsed, 1);
    assert.deepEqual(result.validRows[0], {
      lecturer_code: "TY23-1",
      name: "Ada",
      email: "ada@example.com",
      binusian_id: "B123",
      role: "Lecturer",
      major_codes: "COMP;MATH",
      password: "secret",
    });
  });

  it("strips BOM markers from field values", async () => {
    const result = await parseAndValidateCsvBuffer(
      Buffer.from(
        `${studentHeaders}\n2501959296,\uFEFFAda,ada@example.com,B123,COMP,secret\n`
      ),
      "student"
    );

    assert.equal(result.validRows[0]?.name, "Ada");
  });
});
