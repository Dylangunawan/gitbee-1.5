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
  let input: string | ArrayBuffer = bytes;
  if (extension === "csv") {
    try {
      input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(name + ": save CSV files using UTF-8 encoding (CSV UTF-8 in Excel).");
    }
  }
  const workbook = xlsx.read(input, {
    type: extension === "csv" ? "string" : "array",
    raw: true,
    cellFormula: true,
  });
  if (workbook.SheetNames.length !== 1)
    throw new Error(name + ": use exactly one worksheet.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet?.["!ref"]) throw new Error(name + ": no rows found.");
  // Excel's used range includes formatted empty cells. Inspect populated cells
  // instead, preserving physical row numbers even across large blank gaps.
  const populated = new Map<number, string[]>();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (cell.f)
      throw new Error(
        name + ": replace formulas with plain values (" + address + ").",
      );
    if (cell.v === undefined || cell.v === null || cell.t === "z") continue;
    const value = xlsx.utils.format_cell(cell).trim();
    if (!value) continue;
    const { r, c } = xlsx.utils.decode_cell(address);
    if (r >= 1048576 || c > 30)
      throw new Error(name + ": use at most 31 columns within Excel's row limit.");
    const row = populated.get(r) ?? [];
    row[c] = value;
    populated.set(r, row);
    if (populated.size - (populated.has(0) ? 1 : 0) > 1000)
      throw new Error(name + ": use at most 1,000 data rows.");
  }
  const headers = Array.from(populated.get(0) ?? [], (value) =>
    (value ?? "").replaceAll("\uFEFF", "").trim(),
  );
  const type = headers.includes("nim") ? "student" : "staff";
  const expected = importHeaders[type];
  if (
    headers.length !== expected.length ||
    new Set(headers).size !== headers.length ||
    expected.some((key) => !headers.includes(key))
  )
    throw new Error(name + ": use the student or staff template headers.");
  const rows = [...populated.entries()]
    .filter(([index]) => index > 0)
    .sort(([left], [right]) => left - right)
    .map(([index, row]) => ({ row, line: index + 1 }))
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
  if (!files.length) throw new Error("Choose at least one file.");
  const parsed = [];
  let totalRows = 0;
  for (const file of files) {
    if (!file.size || file.size > 5 * 1024 * 1024)
      throw new Error(file.name + ": choose a nonempty file up to 5 MB.");
    const next = parseImportFile(file.name, await file.arrayBuffer());
    totalRows += next.rows.length;
    if (totalRows > 4000)
      throw new Error("Use at most 4,000 rows across the selected files.");
    parsed.push(next);
  }
  return parsed;
}
