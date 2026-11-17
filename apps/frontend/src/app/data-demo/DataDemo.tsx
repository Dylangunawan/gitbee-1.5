"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./demo.module.css";

import { Grid, type Row } from "./DataGrid";
import { api } from "./dataApi";
import ImportWorkspace from "./ImportWorkspace";
type Table = {
  name: string;
  model: string;
  count: number;
  columns: {
    name: string;
    type: string;
    required: boolean;
    primaryKey: boolean;
    unique: boolean;
  }[];
  relationships: { columns: string[]; target: string; references: string[] }[];
};
export default function DataDemo() {
  const [tab, setTab] = useState("import");
  const [dbError, setDbError] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState("user");
  const [rowResult, setRowResult] = useState<{ key: string; rows: Row[] } | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const rowKey = `${selected}:${page}:${revision}`;
  const loading = rowResult?.key !== rowKey;
  const rows = rowResult?.key === rowKey ? rowResult.rows : [];
  const active = tables.find((table) => table.name === selected);

  useEffect(() => {
    const controller = new AbortController();
    api<{ tables: Table[] }>("/database", { signal: controller.signal })
      .then((data) => {
        setTables(data.tables);
        setDbError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDbError(cause.message);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ rows: Row[] }>(`/database/${selected}?page=${page}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRowResult({ key: rowKey, rows: data.rows });
          setDbError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setDbError(cause.message);
          setRowResult({ key: rowKey, rows: [] });
        }
      });
    return () => controller.abort();
  }, [selected, page, revision, rowKey]);

  return (
    <main className={styles.root}>
      <div className={styles.topline}>
        <span className={styles.eyebrow}>GITBEE / DATA WORKSPACE</span>
        <Link href="/dashboard-admin">Back to dashboard ↗</Link>
      </div>
      <div className={styles.hero}>
        <div>
          <p>
            Import people, inspect the records, and see how the database fits
            together.
          </p>
        </div>
        <div className={styles.connection}>
          <span className={dbError ? styles.offline : styles.dot} />
          {dbError
            ? "Connection needs attention"
            : tables.length
              ? "Connected to MySQL / MariaDB"
              : "Connecting…"}
          <small>Live database · Admin access</small>
        </div>
      </div>
      <div className={styles.stats}>
        {[
          [
            "User accounts",
            tables.find((table) => table.name === "user")?.count,
          ],
          ["Projects", tables.find((table) => table.name === "project")?.count],
          [
            "Roster entries",
            tables.find((table) => table.name === "student_list_transaction")
              ?.count,
          ],
          ["Database tables", tables.length || undefined],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
      <nav className={styles.tabs} aria-label="Demo sections">
        {[
          ["import", "01", "Import data"],
          ["database", "02", "Browse database"],
          ["schema", "03", "Schema & relationships"],
        ].map(([value, number, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value!)}
          >
            <small>{number}</small>
            {label}
          </button>
        ))}
      </nav>
      {dbError && (
        <div role="alert" className={styles.error}>
          {dbError} <Link href="/demo-login">Sign in</Link> ·{" "}
          <button onClick={() => setRevision((value) => value + 1)}>
            Retry connection
          </button>
        </div>
      )}
      {tab === "import" && (
        <ImportWorkspace onSaved={() => setRevision((value) => value + 1)} />
      )}
      {tab === "database" && (
        <section className={styles.card}>
          <div className={styles.toolbar}>
            <div>
              <h2>Inside the database</h2>
              <p>
                Live rows, newest first. Read-only view; credentials are
                excluded.
              </p>
            </div>
            <button
              className={styles.secondary}
              onClick={() => setRevision((value) => value + 1)}
            >
              ↻ Refresh
            </button>
          </div>
          <div className={styles.databaseLayout}>
            <aside className={styles.tableList} aria-label="Database tables">
              {tables.map((table) => (
                <button
                  aria-pressed={selected === table.name}
                  key={table.name}
                  onClick={() => {
                    setSelected(table.name);
                    setPage(1);
                  }}
                >
                  {table.name}
                  <span>{table.count}</span>
                </button>
              ))}
            </aside>
            <div className={styles.records}>
              <div className={styles.toolbar}>
                <h3>{selected}</h3>
                <span className={styles.badge}>
                  {active?.count ?? 0} records
                </span>
              </div>
              {loading ? (
                <p role="status">Loading records…</p>
              ) : (
                <Grid
                  rows={rows}
                  columns={active?.columns.map((column) => column.name)}
                />
              )}
              <div className={styles.pagination}>
                <button
                  disabled={page === 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  ← Previous
                </button>
                <span>
                  Page {page} of{" "}
                  {Math.max(1, Math.ceil((active?.count ?? 0) / 20))}
                </span>
                <button
                  disabled={page * 20 >= (active?.count ?? 0) || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
      {tab === "schema" && (
        <section className={styles.card}>
          <h2>How the data connects</h2>
          <p>
            The Prisma schema defines {tables.length} application tables.
            Foreign keys below are enforced by the database.
          </p>
          <div className={styles.flow}>
            <div>
              <small>ACCOUNTS</small>
              <strong>user</strong>
              <span>Students & staff</span>
            </div>
            <span>↔</span>
            <div>
              <small>PROJECT HUB</small>
              <strong>project</strong>
              <span>Details · groups · reviews</span>
            </div>
            <span>↔</span>
            <div>
              <small>REFERENCE DATA</small>
              <strong>major · status · category</strong>
              <span>Project classification</span>
            </div>
          </div>
          <p className={styles.muted}>
            Account-to-project links use student IDs and lecturer codes, not
            foreign keys. Class rosters are snapshots. Imported major codes are
            retained as text and do not create major relationships.
          </p>
          <div className={styles.schemaGrid}>
            {tables.map((table) => (
              <details className={styles.schemaCard} key={table.name}>
                <summary>
                  <strong>{table.name}</strong>
                  <span>{table.columns.length} visible columns</span>
                </summary>
                <table>
                  <tbody>
                    {table.columns.map((column) => (
                      <tr key={column.name}>
                        <td>
                          {column.name}
                          {column.primaryKey ? " 🔑" : ""}
                        </td>
                        <td>
                          {column.type}
                          {column.required ? "" : "?"}
                          {column.unique ? " · unique" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.relationships.map((relation) => (
                  <p key={`${relation.columns.join(",")}:${relation.target}:${relation.references.join(",")}`}>
                    <code>{relation.columns.join(", ")}</code> →{" "}
                    <strong>{relation.target}</strong> (
                    {relation.references.join(", ")})
                  </p>
                ))}
                {!table.relationships.length && (
                  <p className={styles.muted}>No outgoing foreign keys.</p>
                )}
              </details>
            ))}
          </div>
        </section>
      )}
      <footer className={styles.workspaceFooter}>
        <span>GitBee data workspace</span>
        <span>CSV / XLSX → validation → account import → MySQL</span>
      </footer>
    </main>
  );
}
