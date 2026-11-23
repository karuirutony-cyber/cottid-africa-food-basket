import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KiondoBand } from '@afb/ui';

/** Loading and error states for data pages. */
export function DataState({ loading, error }: { loading: boolean; error: unknown }) {
  const { t } = useTranslation();
  if (error)
    return (
      <div className="wrap py-8">
        <div className="card" role="alert">
          <p className="m-0 font-semibold">{t('status.dataNotAvailable')}</p>
          <p className="m-0 mt-1 text-sm text-muted">{String((error as Error).message ?? error)}</p>
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="wrap py-10" role="status" aria-live="polite">
        <div className="h-6 w-64 animate-pulse rounded bg-sisal/60" />
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-sisal/40" />
        <span className="sr-only">{t('status.loading')}</span>
      </div>
    );
  return null;
}

export function Page({
  kicker,
  title,
  lead,
  actions,
  children,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="wrap pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2 pt-7">
        <div className="min-w-0">
          {kicker && <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-sec-ink">{kicker}</p>}
          <h1 className="m-0 mt-1 text-[clamp(24px,3vw,34px)] font-bold leading-tight text-sec-ink">{title}</h1>
          <KiondoBand height={8} className="mt-3 max-w-[84px] rounded-sm" />
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {lead && <p className="mt-2 max-w-[78ch] text-muted">{lead}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </div>
  );
}

export function Card({ title, children, className = '', aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || aside) && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="m-0 font-body text-[16px] font-bold text-ink">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className="block text-[12.5px] font-semibold text-muted">{label}</span>
      <b className="block font-display text-[22px] leading-tight text-sec-ink">{value}</b>
      {sub && <span className="block text-[12.5px] text-muted">{sub}</span>}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">{children}</div>;
}

export function Pill({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'go' | 'watch' | 'no' | 'neutral'; title?: string }) {
  const cls = {
    go: 'bg-[#e3f1e7] text-[#1d5e36] border-[#b9dcc4]',
    watch: 'bg-[#fff3dc] text-[#7a4b00] border-[#f2d49b]',
    no: 'bg-[#fde8dc] text-[#8f1f0d] border-[#f8c1a3]',
    neutral: 'bg-[#f4f8fd] text-[#145a9c] border-[#cfe0f3]',
  }[tone];
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/** Source IDs ("S5;S27" or ["D6","D5"]) as links to the sources page. */
export function SourceLinks({ ids }: { ids: string | string[] | undefined }) {
  const list = (Array.isArray(ids) ? ids : (ids ?? '').split(/[;,\s]+/)).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className="text-[12px] text-muted">
      {list.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <Link to={`/data/sources#${id}`} className="text-muted">
            {id}
          </Link>
        </span>
      ))}
    </span>
  );
}

/** Footer line every data page carries: sources and as-of date. */
export function SourceFooter({ ids, asOf, note }: { ids?: string | string[]; asOf?: string; note?: ReactNode }) {
  return (
    <p className="m-0 text-[12.5px] text-muted">
      {note}
      {note && ' '}
      {ids && (
        <>
          Sources: <SourceLinks ids={ids} />.{' '}
        </>
      )}
      {asOf && <>Data as of {asOf}.</>}
    </p>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`grid gap-1 text-[12.5px] font-semibold text-muted ${className}`}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-[40px] w-full rounded-lg border border-line bg-surface px-2 text-[14.5px] font-medium text-ink"
      >
        {children}
      </select>
    </label>
  );
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid gap-1 text-[12.5px] font-semibold text-muted">
      {label}
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] w-full rounded-lg border border-line bg-surface px-3 text-[14.5px] text-ink"
      />
    </label>
  );
}

/** Rows to a CSV download. Values are written as shown (strings) or raw numbers. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function CsvButton({ onClick, label = 'Download CSV' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn no-print" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

export function Csv({ name, header, rows }: { name: string; header: string[]; rows: (string | number | null | undefined)[][] }) {
  return <CsvButton onClick={() => downloadCsv(name, header, rows)} />;
}

/** Saves the first chart <svg> inside `el` as a PNG. */
export async function downloadPng(el: HTMLElement | null, filename: string) {
  const svg = el?.querySelector('svg[data-chart]') as SVGSVGElement | null;
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const scale = 2;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = vb.width * scale;
  canvas.height = vb.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${filename}.png`;
  a.click();
}

/** A disclosure that reveals the numbers behind a chart. */
export function Numbers({ children, label = 'Show the numbers' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-2" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-sec-ink">{label}</summary>
      {open && <div className="mt-2">{children}</div>}
    </details>
  );
}

export function NotAvailable({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return <p className="m-0 text-muted">{children ?? t('status.dataNotAvailable')}</p>;
}
