import * as xlsx from "xlsx";

export const importHeaders = {
  student: ["nim", "name", "email", "binusian_id", "major_code", "password"],
  staff: [
    "lecturer_code",
    "name",
    "email",
    "binusian_id",
    "role",
    "major_codes",
    "password",
  ],
};
export type ImportFile = {
  name: string;
  type: "student" | "staff";
  rows: { line: number; data: Record<string, string> }[];
};

export function parseImportFile(name: string, bytes: ArrayBuffer): ImportFile {
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
    throw new Error(name + ": choose a nonempty file up to 5 MB.");
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx")
    throw new Error(name + ": choose CSV or Excel (.xlsx).");
  const input =
    extension === "csv"
      ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      : bytes;
  const workbook = xlsx.read(input, {
    type: extension === "csv" ? "string" : "array",
    raw: true,
    sheetRows: 1002,
    cellFormula: true,
  });
  if (workbook.SheetNames.length !== 1)
    throw new Error(name + ": use exactly one worksheet.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet?.["!ref"]) throw new Error(name + ": no rows found.");
  const range = xlsx.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
  if (range.e.r > 1000 || range.e.c > 30)
    throw new Error(name + ": use at most 1,000 data rows and 31 columns.");
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith("!") && cell.f)
      throw new Error(
        name + ": replace formulas with plain values (" + address + ").",
      );
  }
  const values = xlsx.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    range: 0,
  });
  const headers = (values[0] ?? []).map((value) =>
    value.replaceAll("\uFEFF", "").trim(),
  );
  const type = headers.includes("nim") ? "student" : "staff";
  const expected = importHeaders[type];
  if (
    headers.length !== expected.length ||
    new Set(headers).size !== headers.length ||
    expected.some((key) => !headers.includes(key))
  )
    throw new Error(name + ": use the student or staff template headers.");
  const rows = values
    .slice(1)
    .map((row, index) => ({ row, line: index + 2 }))
    .filter(({ row }) => row.some((value) => value.trim() !== ""))
    .map(({ row, line }) => {
      if (row.length > headers.length)
        throw new Error(name + ": row " + line + " has extra columns.");
      return {
        line,
        data: Object.fromEntries(
          headers.map((key, index) => [key, (row[index] ?? "").trim()]),
        ),
      };
    });
  if (!rows.length) throw new Error(name + ": no data rows found.");
  return { name, type, rows };
}

export async function readImportFiles(files: File[]): Promise<ImportFile[]> {
  if (!files.length || files.length > 4)
    throw new Error("Choose between one and four files.");
  const parsed = [];
  for (const file of files) {
    if (!file.size || file.size > 5 * 1024 * 1024)
      throw new Error(file.name + ": choose a nonempty file up to 5 MB.");
    parsed.push(parseImportFile(file.name, await file.arrayBuffer()));
  }
  return parsed;
}
