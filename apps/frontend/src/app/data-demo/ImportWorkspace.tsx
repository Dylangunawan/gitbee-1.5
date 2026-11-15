"use client";
import { useRef, useState } from "react";
import { api, base } from "./dataApi";
import { Grid, type Row } from "./DataGrid";
import type { ImportFile } from "./readImportFiles";
import styles from "./demo.module.css";

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
type Saved = { rows: Row[]; total: number; page: number; pageSize: number };

export default function ImportWorkspace({ onSaved }: { onSaved: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [payload, setPayload] = useState<ImportFile[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
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
        for (const format of ["csv", "xlsx"]) {
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
      setSaved(null);
      onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function getData(page = 1) {
    setFetching(true);
    setFetchError("");
    try {
      setSaved(await api<Saved>("/saved-users?page=" + page));
    } catch (cause) {
      setSaved(null);
      setFetchError(message(cause));
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className={styles.importWorkspace}>
      <section className={styles.card}>
        <div className={styles.sectionHeading}>
          <span className={styles.step}>1</span>
          <div>
            <h2>Choose your files</h2>
            <p>Upload up to four student or staff spreadsheets together.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => loadSamples()}
          >
            Load four sample files
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
          CSV and Excel samples contain the same accounts. Repeated accounts are
          skipped.
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
        </details>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={!files.length || files.length > 4 || busy}
            onClick={validate}
          >
            Validate & preview
          </button>
          <button
            className={styles.primary}
            disabled={
              !payload ||
              !preview?.files.some((file) => file.validCount > 0) ||
              busy ||
              fetching
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
      </section>

      {preview && (
        <section className={styles.card} aria-live="polite">
          <h2>2. Preview your data</h2>
          {preview.files.map((file, index) => (
            <div className={styles.filePreview} key={index}>
              <h3>{file.name}</h3>
              <p>
                {file.totalRows} rows · {file.validCount} pass field validation
                · {file.failedRows.length} invalid
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
        </section>
      )}

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

      <section className={styles.card} aria-label="Saved accounts">
        <div className={styles.sectionHeading}>
          <span className={styles.step}>3</span>
          <div>
            <h2>Get saved data</h2>
            <p>
              Read accounts from the database, including after refreshing this
              page.
            </p>
          </div>
        </div>
        <button
          className={styles.primary}
          disabled={fetching || busy}
          onClick={() => getData()}
        >
          {fetching ? "Fetching…" : "Get Data"}
        </button>
        {fetchError && (
          <p className={styles.error} role="alert">
            {fetchError}
          </p>
        )}
        {!saved && !fetchError && (
          <p className={styles.muted}>
            Click Get Data to display saved accounts here.
          </p>
        )}
        {saved && (
          <div aria-live="polite" aria-busy={fetching}>
            <p>
              {saved.total} saved accounts · Page {saved.page} of{" "}
              {Math.max(1, Math.ceil(saved.total / saved.pageSize))}
            </p>
            <Grid rows={saved.rows} />
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                disabled={fetching || busy || saved.page <= 1}
                onClick={() => getData(saved.page - 1)}
              >
                Previous saved page
              </button>
              <button
                className={styles.secondary}
                disabled={
                  fetching || busy || saved.page * saved.pageSize >= saved.total
                }
                onClick={() => getData(saved.page + 1)}
              >
                Next saved page
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
