import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import xlsx from "xlsx";

const source = (
  await readFile(
    new URL("../src/app/data-demo/readImportFiles.ts", import.meta.url),
    "utf8",
  )
).replace('"xlsx"', JSON.stringify(import.meta.resolve("xlsx/xlsx.mjs")));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { parseImportFile, readImportFiles } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const bytes = (value) => Uint8Array.from(value).buffer;
const csv = (value) => bytes(Buffer.from(value));
const headers = "nim,name,email,binusian_id,major_code,password";

test("the four demo files produce matching student/staff JSON without losing IDs", async () => {
  for (const [type, count] of [
    ["student", 8],
    ["staff", 6],
  ]) {
    const samples = [];
    for (const format of ["csv", "xlsx"]) {
      const name = type + "-sample." + format;
      const data = await readFile(
        new URL("../../backend/samples/demo/" + name, import.meta.url),
      );
      const result = parseImportFile(name, bytes(data));
      assert.equal(result.type, type);
      assert.equal(result.rows.length, count);
      samples.push(result.rows);
    }
    assert.deepEqual(samples[0], samples[1]);
  }
});

test("quoted CSV cells, Unicode, blank IDs and leading zeroes survive parsing", () => {
  const result = parseImportFile(
    "students.csv",
    csv(headers + '\n001234,"Ana, Āda",ana@example.test,,CS,secret\n'),
  );
  assert.equal(result.rows[0].data.nim, "001234");
  assert.equal(result.rows[0].data.name, "Ana, Āda");
  assert.equal(result.rows[0].data.binusian_id, "");
  assert.equal(result.rows[0].line, 2);
});

test("invalid headers, oversized data, formulas and multi-sheet workbooks are rejected", async () => {
  assert.throws(
    () => parseImportFile("bad.csv", csv("name,name\na,b")),
    /template headers/,
  );
  assert.throws(() => parseImportFile("bad.pdf", csv("hello")), /choose CSV/);
  assert.throws(
    () => parseImportFile("empty.csv", new ArrayBuffer(0)),
    /nonempty/,
  );
  assert.throws(
    () => parseImportFile("large.csv", new ArrayBuffer(5 * 1024 * 1024 + 1)),
    /5 MB/,
  );
  assert.throws(
    () =>
      parseImportFile(
        "many.csv",
        csv(
          headers +
            "\n" +
            new Array(1001).fill("1,A,a@example.test,,CS,secret").join("\n"),
        ),
      ),
    /1,000/,
  );
  await assert.rejects(() => readImportFiles([]), /at least one/);
  await assert.rejects(
    () =>
      readImportFiles([
        {
          name: "too-large.csv",
          size: 5 * 1024 * 1024 + 1,
          arrayBuffer() {
            assert.fail("Oversized files must be rejected before reading");
          },
        },
      ]),
    /5 MB/,
  );
  const book = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    headers.split(","),
    ["001", "Ada", "ada@example.test", "", "CS", "secret"],
  ]);
  sheet.B2 = { t: "s", f: 'CONCAT("A","da")', v: "Ada" };
  xlsx.utils.book_append_sheet(book, sheet, "Students");
  assert.throws(
    () =>
      parseImportFile(
        "formula.xlsx",
        bytes(xlsx.write(book, { type: "buffer", bookType: "xlsx" })),
      ),
    /formulas/,
  );
  delete sheet.B2.f;
  xlsx.utils.book_append_sheet(book, sheet, "Extra");
  assert.throws(
    () =>
      parseImportFile(
        "multi.xlsx",
        bytes(xlsx.write(book, { type: "buffer", bookType: "xlsx" })),
      ),
    /one worksheet/,
  );
});

test("accepts more than four files and bounds their combined row count", async () => {
  const small = new File(
    [headers + "\n001,Ada,ada@example.test,,CS,secret"],
    "student.csv",
  );
  assert.equal((await readImportFiles(new Array(6).fill(small))).length, 6);
  const large = new File(
    [
      headers +
        "\n" +
        new Array(1000).fill("001,Ada,ada@example.test,,CS,secret").join("\n"),
    ],
    "students.csv",
  );
  await assert.rejects(
    () => readImportFiles(new Array(5).fill(large)),
    /4,000 rows/,
  );
});
