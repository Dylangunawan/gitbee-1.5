"use client";
import { useEffect, useRef, useState } from "react";
import {
  getAccounts,
  type AccountPage,
  type AccountType,
  type StaffRole,
} from "@/lib/accountApi";
import { Grid } from "./DataGrid";
import styles from "./demo.module.css";

type Query = { type: AccountType; search: string; role: StaffRole | ""; page: number };

export default function SavedAccounts({
  autoLoad,
  initialType,
  busy,
}: {
  autoLoad: boolean;
  initialType: AccountType;
  busy: boolean;
}) {
  const [type, setType] = useState<AccountType>(initialType);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<StaffRole | "">("");
  const [result, setResult] = useState<{ query: Query; data: AccountPage | null; error: string } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState<Query | null>(
    autoLoad ? { type: initialType, search: "", role: "", page: 1 } : null,
  );

  const saved = result?.query === query ? result?.data : null;
  const error = result?.query === query ? result?.error : "";
  const fetching = query !== null && result?.query !== query;

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    requestRef.current = controller;
    getAccounts(query.type, {
      search: query.search,
      page: query.page,
      roleFilter: query.role,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ query, data, error: "" });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setResult({
          query, data: null,
          error: cause instanceof Error ? cause.message : "Could not fetch accounts. Please retry.",
        });
      });
    return () => controller.abort();
  }, [query]);

  function changeType(next: AccountType) {
    requestRef.current?.abort();
    setType(next);
    setRole("");
    setQuery(null);
  }

  return (
    <section className={styles.card} aria-label="Saved accounts">
      <div className={styles.sectionHeading}>
        <span className={styles.step}>3</span>
        <div>
          <h2>Get saved data</h2>
          <p>
            Read student and staff accounts from the database, including after
            refreshing this page.
          </p>
        </div>
      </div>
      <form
        className={styles.accountFilters}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ type, search, role, page: 1 });
        }}
      >
        <label>
          Account type
          <select
            value={type}
            disabled={busy}
            onChange={(event) => changeType(event.target.value as AccountType)}
          >
            <option value="student">Students</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <label>
          Search accounts
          <input
            value={search}
            maxLength={150}
            disabled={busy}
            placeholder="Name, email or account ID"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {type === "staff" && (
          <label>
            Staff role
            <select
              value={role}
              disabled={busy}
              onChange={(event) =>
                setRole(event.target.value as StaffRole | "")
              }
            >
              <option value="">All staff</option>
              {(["Lecturer", "Admin", "SCC", "HoP"] as const).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        <button className={styles.primary} disabled={fetching || busy}>
          {fetching ? "Fetching…" : "Get Data"}
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!saved && !error && !fetching && (
        <p className={styles.muted}>
          Click Get Data to display saved accounts here.
        </p>
      )}
      {saved && (
        <div aria-live="polite">
          <p>
            {saved.total} {query?.type === "student" ? "student" : "staff"}{" "}
            accounts · Page {saved.page} of{" "}
            {Math.max(1, Math.ceil(saved.total / saved.pageSize))}
          </p>
          <Grid
            rows={saved.items.map(({ hop_major, ...account }) => ({
              ...account,
              ...(hop_major
                ? { hop_major: hop_major.map((major) => major.name).join(", ") }
                : {}),
            }))}
          />
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              disabled={fetching || busy || saved.page <= 1}
              onClick={() =>
                setQuery((value) => value && { ...value, page: saved.page - 1 })
              }
            >
              Previous saved page
            </button>
            <button
              className={styles.secondary}
              disabled={
                fetching || busy || saved.page * saved.pageSize >= saved.total
              }
              onClick={() =>
                setQuery((value) => value && { ...value, page: saved.page + 1 })
              }
            >
              Next saved page
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
