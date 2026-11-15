import { z } from "zod";
import {
  csvRowSchemas,
  type CsvValidationResult,
  type StudentCsvRow,
  type StaffCsvRow,
} from "../csv/csvParser.js";
import { importCsvUsers } from "../csv/csvUserImport.js";

// The JSON contract contains source row numbers so every result can be traced
// back to the displayed file. Never trust validation performed by the browser.
const requestSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            name: z.string().min(1).max(255),
            type: z.enum(["student", "staff"]),
            rows: z
              .array(
                z
                  .object({
                    line: z.number().int().min(2).max(100000),
                    data: z.record(z.string().max(50), z.string().max(2000)),
                  })
                  .strict(),
              )
              .min(1)
              .max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

export class DemoInputError extends Error {}

export function validateDemoData(body: unknown) {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    // Do not echo request values (especially credentials) in errors or logs.
    throw new DemoInputError(
      "Send 1–4 files, each with a name, student/staff type, and 1–1,000 numbered rows of text fields.",
    );
  }
  return parsed.data.files.map((file) => {
    const validation: CsvValidationResult<StudentCsvRow | StaffCsvRow> = {
      totalRows: file.rows.length,
      validRows: [],
      failedRows: [],
    };
    const lines = new Set<number>();
    for (const row of file.rows) {
      if (lines.has(row.line))
        throw new DemoInputError(
          "Row numbers must be unique within each file.",
        );
      lines.add(row.line);
      const input = Object.fromEntries(
        Object.entries(row.data).map(([key, value]) => [
          key,
          value.replaceAll("\uFEFF", "").trim(),
        ]),
      );
      const result = csvRowSchemas[file.type].strict().safeParse(input);
      if (result.success) {
        validation.validRows.push({
          row_number: row.line,
          identifier:
            "nim" in result.data ? result.data.nim : result.data.lecturer_code,
          data: result.data,
        });
      } else {
        validation.failedRows.push({
          row_number: row.line,
          identifier: null,
          error: result.error.issues
            .map((issue) => issue.path.join(".") + ": " + issue.message)
            .join("; "),
        });
      }
    }
    return { name: file.name, type: file.type, validation };
  });
}

type ValidatedFiles = ReturnType<typeof validateDemoData>;

export function previewDemoData(files: ValidatedFiles) {
  return {
    files: files.map(({ name, type, validation }) => ({
      name,
      type,
      totalRows: validation.totalRows,
      validCount: validation.validRows.length,
      failedRows: validation.failedRows,
      rows: validation.validRows.slice(0, 10).map(({ row_number, data }) => ({
        line: row_number,
        ...Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== "password"),
        ),
      })),
    })),
  };
}

export function logDemoReceipt(
  files: ValidatedFiles,
  action: "preview" | "save",
) {
  // Explicitly opt in for the local demo. JSON.stringify escapes newlines in
  // filenames and cells, and only validated, non-credential fields are logged.
  if (process.env.DEMO_IMPORT_LOG !== "true") return;
  console.info(
    "[data-demo] " +
      JSON.stringify({
        event: "received",
        action,
        files: previewDemoData(files).files.map(
          ({ rows, failedRows, ...file }) => ({
            ...file,
            failedCount: failedRows.length,
            sampleRows: rows.slice(0, 2),
          }),
        ),
      }),
  );
}

export async function saveDemoData(files: ValidatedFiles) {
  const reports = [];
  // Sequential imports let later files see duplicates saved by earlier ones.
  // The existing importer hashes passwords and retains partial-import reports.
  for (const file of files) {
    reports.push({
      name: file.name,
      type: file.type,
      ...(await importCsvUsers(file.validation)),
    });
  }
  return { files: reports };
}
