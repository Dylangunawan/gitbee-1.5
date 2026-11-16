"use client";
import { useRef, useState } from "react";
import { api, base } from "./dataApi";
import { Grid, type Row } from "./DataGrid";
import type { ImportFile } from "./readImportFiles";
import styles from "./demo.module.css";
import SavedAccounts from "./SavedAccounts";
import type { AccountType } from "@/lib/accountApi";

type Preview = {
  files: {
    name: string;
    type: string;
    totalRows: number;
    validCount: number;
    rows: Row[];
    failedRows: { row_number: number; error: string }[];
  }[];
};
type Report = {
  files: {
    name: string;
    type: string;
    totalParsed: number;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    errors: { line: number; errors: string[] }[];
  }[];
};

export default function ImportWorkspace({ onSaved }: { onSaved: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [payload, setPayload] = useState<ImportFile[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [savedType, setSavedType] = useState<AccountType>("student");
  const input = useRef<HTMLInputElement>(null);
  const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : "Request failed. Please retry.";

  function selectFiles(next: File[]) {
    setFiles(next);
    setPayload(null);
    setPreview(null);
    setReport(null);
    setError("");
  }
  async function loadSamples(withErrors = false) {
    setBusy(true);
    setError("");
    try {
      const samples: File[] = [];
      for (const type of ["student", "staff"]) {
        for (const format of ["csv"]) {
          const response = await fetch(
            base + "/samples/" + type + "/" + format + "?errors=" + withErrors,
            { credentials: "include" },
          );
          if (!response.ok)
            throw new Error(
              "Could not load samples. Check your admin session.",
            );
          samples.push(
            new File(
              [await response.blob()],
              type + (withErrors ? "-with-errors." : "-sample.") + format,
            ),
          );
        }
      }
      selectFiles(samples);
      if (input.current) input.current.value = "";
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    setBusy(true);
    setError("");
    setPreview(null);
    setPayload(null);
    setReport(null);
    try {
      const { readImportFiles } = await import("./readImportFiles");
      const parsed = await readImportFiles(files);
      const result = await api<Preview>("/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: parsed }),
      });
      setPayload(parsed);
      setPreview(result);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      setReport(
        await api<Report>("/imports/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: payload }),
        }),
      );
      setPayload(null);
      setSavedType(
        payload.some((file) => file.type === "student") ? "student" : "staff",
      );
      setRevision((value) => value + 1);
      onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.importWorkspace}>
      <section className={styles.card}>
        <div className={styles.sectionHeading}>
          <span className={styles.step}>1</span>
          <div>
            <h2>Choose your files</h2>
            <p>Upload one or more student or staff spreadsheets together.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => loadSamples()}
          >
            Load sample files
          </button>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => loadSamples(true)}
          >
            Try samples with errors
          </button>
        </div>
        <p className={styles.muted}>
          Load example students and staff, or choose your own files. Existing
          accounts are skipped.
        </p>
        <label className={styles.dropzone}>
          <span className={styles.uploadIcon}>↑</span>
          <strong>Choose spreadsheets</strong>
          <span>CSV or Excel (.xlsx) · 5 MB and 1,000 rows per file</span>
          <input
            ref={input}
            aria-label="Spreadsheet files"
            type="file"
            multiple
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(event) =>
              selectFiles(Array.from(event.target.files ?? []))
            }
          />
        </label>
        {files.length > 0 && (
          <ul>
            {files.map((file, index) => (
              <li key={index}>{file.name}</li>
            ))}
          </ul>
        )}
        <details>
          <summary>Fields and import rules</summary>
          <p>Students: nim, name, email, binusian_id, major_code, password.</p>
          <p>
            Staff: lecturer_code, name, email, binusian_id, role, major_codes,
            password.
          </p>
          <p>
            Binusian ID may be blank. Major codes are saved as source text; they
            do not assign a major. Lecturer, Admin, and SCC imports are
            supported. HoP imports require a major lookup and are rejected.
          </p>
          <p>
            Passwords are hashed when saved and are never shown in previews or
            fetched records. Valid new accounts are saved even if other rows are
            invalid or duplicated.
          </p>
          <p>
            You can select any number of files, with up to 4,000 data rows in
            total.
          </p>
        </details>
      </section>

      <section
        className={styles.card}
        aria-label="Validate and save"
        aria-live="polite"
      >
        <div className={styles.sectionHeading}>
          <span className={styles.step}>2</span>
          <div>
            <h2>Validate & preview</h2>
            <p>Review your data, then save the valid new accounts.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={!files.length || busy}
            onClick={validate}
          >
            Validate & preview
          </button>
          <button
            className={styles.primary}
            disabled={
              !payload ||
              !preview?.files.some((file) => file.validCount > 0) ||
              busy
            }
            onClick={save}
          >
            Save to database
          </button>
          {busy && <span role="status">Processing files…</span>}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!preview && (
          <p className={styles.muted}>
            Choose files in step 1, then click Validate & preview to see their
            rows here.
          </p>
        )}
        {preview && (
          <div>
            {preview.files.map((file, index) => (
              <div className={styles.filePreview} key={index}>
                <h3>{file.name}</h3>
                <p>
                  {file.totalRows} rows · {file.validCount} pass field
                  validation · {file.failedRows.length} invalid
                </p>
                <Grid rows={file.rows} />
                <p className={styles.muted}>
                  First 10 valid rows shown. Duplicate accounts are checked when
                  saving.
                </p>
                {file.failedRows.map((row) => (
                  <p className={styles.error} key={row.row_number}>
                    Row {row.row_number}: {row.error}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {report && (
        <section className={styles.card} aria-live="polite">
          <h2>Save results</h2>
          {report.files.map((file, index) => (
            <div className={styles.filePreview} key={index}>
              <h3>{file.name}</h3>
              <p>
                {file.createdCount} created · {file.skippedCount} skipped ·{" "}
                {file.failedCount} failed
              </p>
              {file.errors.length > 0 && (
                <details>
                  <summary>Row results ({file.errors.length})</summary>
                  {file.errors.map((row, i) => (
                    <p key={i}>
                      Row {row.line}: {row.errors.join("; ")}
                    </p>
                  ))}
                </details>
              )}
            </div>
          ))}
          <p>Use Get Data below to retrieve the saved accounts.</p>
        </section>
      )}

      <SavedAccounts
        key={revision}
        autoLoad={revision > 0}
        initialType={savedType}
        busy={busy}
      />
    </div>
  );
}
