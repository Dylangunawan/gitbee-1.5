import styles from "./demo.module.css";
export type Row = Record<string, string | number | boolean | null>;
export function Grid({
  rows,
  columns,
}: {
  rows: Row[];
  columns?: string[] | undefined;
}) {
  const keys = columns ?? Object.keys(rows[0] ?? {});
  if (!rows.length)
    return <p className={styles.empty}>No records to display.</p>;
  return (
    <div className={styles.tableScroll}>
      <table>
        <thead>
          <tr>
            {keys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {keys.map((key) => (
                <td key={key}>
                  {row[key] === null ? (
                    <span className={styles.null}>NULL</span>
                  ) : (
                    String(row[key] ?? "")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
