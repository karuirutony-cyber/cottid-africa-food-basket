import { useMemo, useState, type ReactNode } from 'react';
import { Card, Csv, SearchBox, Select } from './ui';

export interface Column<T> {
  label: string;
  cell: (r: T) => ReactNode;
  csv?: (r: T) => string | number | null | undefined;
  className?: string;
}
export interface Filter<T> {
  label: string;
  all: string;
  options: [value: string, label: string][];
  match: (r: T, value: string) => boolean;
  initial?: string;
}

/** A searchable, filterable table of records with CSV export and a live result count. */
export function RecordTable<T>({
  rows,
  columns,
  filters = [],
  search,
  name,
  title,
  empty = 'No records match these filters.',
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  filters?: Filter<T>[];
  search: (r: T) => string;
  name: string;
  title?: ReactNode;
  empty?: string;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [vals, setVals] = useState<string[]>(() => filters.map((f) => f.initial ?? ''));
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(
      (r) =>
        filters.every((f, i) => !vals[i] || f.match(r, vals[i]!)) &&
        (!words.length || words.every((w) => search(r).toLowerCase().includes(w))),
    );
  }, [rows, filters, vals, q, search]);
  return (
    <Card
      title={title}
      aside={<Csv name={name} header={columns.map((c) => c.label)} rows={shown.map((r) => columns.map((c) => (c.csv ? c.csv(r) : String(c.cell(r) ?? ''))))} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchBox label="Search" value={q} onChange={setQ} />
        {filters.map((f, i) => (
          <Select
            key={f.label}
            label={f.label}
            value={vals[i] ?? ''}
            onChange={(v) => setVals((old) => old.map((o, j) => (j === i ? v : o)))}
          >
            <option value="">{f.all}</option>
            {f.options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        ))}
      </div>
      <p className="m-0 mt-3 text-[13px] text-muted" role="status" aria-live="polite">
        {shown.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} shown
      </p>
      <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-2 max-h-[720px] overflow-y-auto">
        {shown.length ? (
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className={c.className}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.label} className={c.className}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 py-4 text-muted">{empty}</p>
        )}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </Card>
  );
}

/** Sorted unique values as select options. */
export const optionsOf = (values: (string | undefined | null)[], label: (v: string) => string = (v) => v): [string, string][] =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => label(a).localeCompare(label(b))).map((v) => [v, label(v)]);

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
