import { useRef, useState, type ReactNode } from 'react';
import { downloadCsv, downloadPng, Numbers } from './ui';

/*
 * Charts ported from the legacy page's own SVG charts (lineChart, stackChart, bars), so they read
 * the same. Each has a "Show the numbers" table, CSV and PNG export, and a text alternative.
 */

const nice = (max: number) => {
  if (!(max > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};
const axisFmt = (v: number) =>
  Math.abs(v) >= 1000
    ? (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k'
    : v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 1 : 0 });

export const COL = { use: '#c22e16', imp: '#1f7fd1', prod: '#22804a', exp: '#8a4fc0', extra: '#b06a00' };

type V = number | null | undefined;
export interface LineSeries {
  key: string;
  label: string;
  color: string;
  vals: Record<number, V>;
  dash?: boolean;
}

function Figure({
  title,
  unit,
  legend,
  children,
  table,
  csv,
  name,
}: {
  title: string;
  unit?: string;
  legend?: ReactNode;
  children: ReactNode;
  table: ReactNode;
  csv: () => void;
  name: string;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <figure ref={ref} className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {title} <span className="text-[12.5px] font-normal text-muted">{unit}</span>
        </span>
        <span className="no-print flex gap-1">
          <button type="button" className="btn min-h-[32px] px-2.5 py-1 text-[12.5px]" onClick={csv}>
            CSV
          </button>
          <button
            type="button"
            className="btn min-h-[32px] px-2.5 py-1 text-[12.5px]"
            onClick={() => void downloadPng(ref.current, name)}
          >
            PNG
          </button>
        </span>
      </figcaption>
      {legend && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">{legend}</div>}
      <div className="mt-1 overflow-hidden">{children}</div>
      <Numbers>{table}</Numbers>
    </figure>
  );
}

const Key = ({ color, label, dash }: { color: string; label: string; dash?: boolean }) => (
  <span className="inline-flex items-center gap-1.5">
    <i className="inline-block h-[3px] w-4 rounded" style={{ background: color, opacity: dash ? 0.55 : 1 }} />
    {label}
  </span>
);

export function LineChart({
  title,
  unit,
  years,
  series,
  split,
  band,
  fmt = (v) => v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 2 : 0 }),
  name = 'chart',
}: {
  title: string;
  unit?: string;
  years: number[];
  series: LineSeries[];
  split?: number;
  band?: { lo: Record<number, V>; hi: Record<number, V>; color: string; label: string };
  fmt?: (v: number) => string;
  name?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const Wd = 720,
    Ht = 300,
    m = { l: 52, r: 24, t: 14, b: 30 };
  const all: number[] = [];
  series.forEach((s) => years.forEach((y) => s.vals[y] != null && all.push(s.vals[y]!)));
  if (band) years.forEach((y) => band.hi[y] != null && all.push(band.hi[y]!));
  if (!all.length) return <p className="text-sm text-muted">Data not available for this selection.</p>;
  const top = nice(Math.max(...all) * 1.04);
  const x = (y: number) => m.l + (years.indexOf(y) / Math.max(1, years.length - 1)) * (Wd - m.l - m.r);
  const yv = (v: number) => Ht - m.b - (v / top) * (Ht - m.t - m.b);
  const step = years.length > 13 ? 2 : 1;
  const path = (s: LineSeries, from: (y: number) => boolean) => {
    let d = '';
    let pen = false;
    years.forEach((y) => {
      const v = s.vals[y];
      if (v == null || !from(y)) {
        pen = false;
        return;
      }
      d += `${pen ? ' L' : ' M'}${x(y).toFixed(1)} ${yv(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const csv = () =>
    downloadCsv(
      name,
      ['Year', ...series.map((s) => s.label), ...(band ? ['Range low', 'Range high'] : [])],
      years.map((y) => [y, ...series.map((s) => s.vals[y] ?? ''), ...(band ? [band.lo[y] ?? '', band.hi[y] ?? ''] : [])]),
    );
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * Wd;
    let best = years[0]!;
    let bd = 1e9;
    years.forEach((y) => {
      const d = Math.abs(x(y) - px);
      if (d < bd) {
        bd = d;
        best = y;
      }
    });
    setHover(best);
  };
  return (
    <Figure
      title={title}
      unit={unit}
      name={name}
      csv={csv}
      legend={
        series.length > 1 || band ? (
          <>
            {series.map((s) => (
              <Key key={s.key} color={s.color} label={s.label} dash={s.dash} />
            ))}
            {band && <Key color={band.color} label={band.label} />}
            {split && <span>dashed: projected</span>}
          </>
        ) : null
      }
      table={
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Year</th>
                {series.map((s) => (
                  <th key={s.key} className="n">
                    {s.label}
                  </th>
                ))}
                {band && <th className="n">Range</th>}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <td>
                    {y}
                    {split && y >= split ? <span className="text-xs text-muted"> proj.</span> : null}
                  </td>
                  {series.map((s) => (
                    <td key={s.key} className="n">
                      {s.vals[y] == null ? '–' : fmt(s.vals[y]!)}
                    </td>
                  ))}
                  {band && (
                    <td className="n">
                      {band.hi[y] != null ? `${fmt(Math.max(0, band.lo[y] ?? 0))}–${fmt(band.hi[y]!)}` : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <div className="relative">
        <svg data-chart viewBox={`0 0 ${Wd} ${Ht}`} className="block h-auto w-full" role="img" aria-label={title}>
          {split && years.includes(split) && (
            <>
              <rect
                x={x(split) - (x(years[1]!) - x(years[0]!)) / 2}
                y={m.t}
                width={Wd - m.r - x(split) + (x(years[1]!) - x(years[0]!)) / 2 + 6}
                height={Ht - m.t - m.b}
                fill="#f4f8fd"
              />
              <text x={x(split) - (x(years[1]!) - x(years[0]!)) / 2 + 6} y={m.t + 12} fontSize="11" fill="#54463d">
                Projection
              </text>
            </>
          )}
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (top * i) / 4;
            return (
              <g key={i}>
                <line x1={m.l} x2={Wd - m.r} y1={yv(v)} y2={yv(v)} stroke="#efe3d5" />
                <text x={m.l - 8} y={yv(v) + 4} textAnchor="end" fontSize="11" fill="#54463d">
                  {axisFmt(v)}
                </text>
              </g>
            );
          })}
          {years.map((y, i) =>
            (years.length - 1 - i) % step === 0 ? (
              <text key={y} x={x(y)} y={Ht - 9} textAnchor="middle" fontSize="11" fill="#54463d">
                {y}
              </text>
            ) : null,
          )}
          {band &&
            (() => {
              const pts = years.filter((y) => band.hi[y] != null);
              if (pts.length < 2) return null;
              const d = `M${pts.map((y) => `${x(y)} ${yv(band.hi[y]!)}`).join(' L')} L${pts
                .slice()
                .reverse()
                .map((y) => `${x(y)} ${yv(Math.max(0, band.lo[y] ?? 0))}`)
                .join(' L')} Z`;
              return <path d={d} fill={band.color} opacity={0.13} />;
            })()}
          {series.map((s) =>
            split && !s.dash ? (
              <g key={s.key}>
                <path d={path(s, (y) => y < split)} fill="none" stroke={s.color} strokeWidth={2} />
                <path d={path(s, (y) => y >= split - 1)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="5 4" />
              </g>
            ) : (
              <path
                key={s.key}
                d={path(s, () => true)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash ? '2 4' : undefined}
              />
            ),
          )}
          {series
            .filter((s) => !s.dash)
            .map((s) =>
              years.map((y) =>
                s.vals[y] == null ? null : (
                  <circle
                    key={`${s.key}${y}`}
                    cx={x(y)}
                    cy={yv(s.vals[y]!)}
                    r={split && y >= split ? 2.5 : 3.2}
                    fill={split && y >= split ? '#fff' : s.color}
                    stroke={split && y >= split ? s.color : '#fff'}
                    strokeWidth={1.5}
                  />
                ),
              ),
            )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={Ht - m.b} stroke="#1b1410" opacity={0.35} />}
          <rect
            x={m.l - 10}
            y={m.t}
            width={Wd - m.l - m.r + 20}
            height={Ht - m.t - m.b}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-md"
            style={{ insetInlineStart: `${Math.min(70, (x(hover) / Wd) * 100)}%` }}
          >
            <b>
              {hover}
              {split && hover >= split ? ' · projected' : ''}
            </b>
            {series.map((s) =>
              s.vals[hover] == null ? null : (
                <div key={s.key} className="flex items-center gap-2">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}: <b>{fmt(s.vals[hover]!)}</b>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </Figure>
  );
}

export interface StackRow {
  y: number;
  a: number;
  b: number;
  x?: number | null;
  line?: number | null;
  proj?: boolean;
}

/** Production (a) and imports (b) stacked, exports as a diamond, consumption as a line. */
export function StackChart({
  title,
  unit,
  rows,
  la = 'Production',
  lb = 'Imports',
  lx = 'Exports',
  projLabel = 'Projection',
  name = 'balance',
}: {
  title: string;
  unit?: string;
  rows: StackRow[];
  la?: string;
  lb?: string;
  lx?: string;
  projLabel?: string;
  name?: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted">Data not available.</p>;
  const Wd = 720,
    Ht = 280,
    m = { l: 52, r: 16, t: 14, b: 30 };
  const top = nice(Math.max(...rows.map((r) => Math.max(r.a + r.b, r.line ?? 0))) * 1.05);
  const slot = (Wd - m.l - m.r) / rows.length;
  const bw = Math.min(34, slot - 6);
  const x = (i: number) => m.l + (i + 0.5) * slot;
  const yv = (v: number) => Ht - m.b - (v / top) * (Ht - m.t - m.b);
  const fi = rows.findIndex((r) => r.proj);
  const step = rows.length > 13 ? 2 : 1;
  const lp = rows.map((r, i) => (r.line != null ? `${x(i).toFixed(1)} ${yv(r.line).toFixed(1)}` : null)).filter(Boolean);
  const n0 = (v: number | null | undefined) => (v == null ? '–' : Math.round(v).toLocaleString('en-US'));
  const csv = () =>
    downloadCsv(
      name,
      ['Year', la, lb, lx, 'Consumption', 'Projected'],
      rows.map((r) => [r.y, r.a, r.b, r.x ?? '', r.line ?? '', r.proj ? 'yes' : '']),
    );
  return (
    <Figure
      title={title}
      unit={unit}
      name={name}
      csv={csv}
      legend={
        <>
          <Key color={COL.prod} label={la} />
          <Key color={COL.imp} label={lb} />
          {rows.some((r) => (r.x ?? 0) > 0) && <Key color={COL.exp} label={lx} />}
          {lp.length > 1 && <Key color={COL.use} label="Total consumption" />}
        </>
      }
      table={
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th className="n">{la}</th>
                <th className="n">{lb}</th>
                <th className="n">{lx}</th>
                <th className="n">Consumption</th>
                <th className="n">Local share of supply</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.y}>
                  <td>
                    {r.y}
                    {r.proj && <span className="text-xs text-muted"> proj.</span>}
                  </td>
                  <td className="n">{n0(r.a)}</td>
                  <td className="n">{n0(r.b)}</td>
                  <td className="n">{r.x ? n0(r.x) : '–'}</td>
                  <td className="n">{n0(r.line)}</td>
                  <td className="n">{r.a + r.b > 0 ? `${((r.a / (r.a + r.b)) * 100).toFixed(0)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <svg data-chart viewBox={`0 0 ${Wd} ${Ht}`} className="block h-auto w-full" role="img" aria-label={title}>
        {fi > 0 && (
          <>
            <rect x={x(fi) - slot / 2} y={m.t} width={Wd - m.r - x(fi) + slot / 2} height={Ht - m.t - m.b} fill="#f4f8fd" />
            <text x={x(fi) - slot / 2 + 6} y={m.t + 12} fontSize="11" fill="#54463d">
              {projLabel}
            </text>
          </>
        )}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top * i) / 4;
          return (
            <g key={i}>
              <line x1={m.l} x2={Wd - m.r} y1={yv(v)} y2={yv(v)} stroke="#efe3d5" />
              <text x={m.l - 8} y={yv(v) + 4} textAnchor="end" fontSize="11" fill="#54463d">
                {axisFmt(v)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const ya = yv(r.a);
          const yb = yv(r.a + r.b);
          const op = r.proj ? 0.62 : 1;
          return (
            <g key={r.y}>
              <title>
                {`${r.y}${r.proj ? ' (projection)' : ''}: ${la} ${n0(r.a)}, ${lb} ${n0(r.b)}${r.x ? `, ${lx} ${n0(r.x)}` : ''}${r.line ? `, consumption ${n0(r.line)}` : ''} thousand t`}
              </title>
              {r.a > 0 && <rect x={x(i) - bw / 2} y={ya} width={bw} height={Math.max(0, Ht - m.b - ya)} fill={COL.prod} opacity={op} />}
              {r.b > 0 && (
                <rect x={x(i) - bw / 2} y={yb} width={bw} height={Math.max(0, ya - yb - 2)} rx={3} fill={COL.imp} opacity={op} />
              )}
              {(r.x ?? 0) > 0 && (
                <path
                  d={`M${x(i) - 6} ${yv(r.x!)} L${x(i)} ${yv(r.x!) - 6} L${x(i) + 6} ${yv(r.x!)} L${x(i)} ${yv(r.x!) + 6} Z`}
                  fill={COL.exp}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )}
              {(rows.length - 1 - i) % step === 0 && (
                <text x={x(i)} y={Ht - 9} textAnchor="middle" fontSize="11" fill="#54463d">
                  {r.y}
                </text>
              )}
            </g>
          );
        })}
        {lp.length > 1 && <path d={`M${lp.join(' L')}`} fill="none" stroke={COL.use} strokeWidth={2} />}
      </svg>
    </Figure>
  );
}

/** Horizontal bars: partners of a trade flow. */
export function BarList({ rows, color, fmt }: { rows: { label: string; value: number; note?: string }[]; color: string; fmt: (v: number) => string }) {
  if (!rows.length) return <p className="text-sm text-muted">Data not available.</p>;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[13.5px]">
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#f3e9dc]">
            <span className="block h-full rounded-full" style={{ width: `${((r.value / max) * 100).toFixed(1)}%`, background: color }} />
          </span>
          <span className="whitespace-nowrap text-muted">
            {fmt(r.value)}
            {r.note ? ` · ${r.note}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
