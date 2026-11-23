import { useNavigate } from 'react-router-dom';
import type { MapData } from '@afb/engines';
import { pc, usd } from '@afb/engines/format';
import type { Summary } from '@/data/datasets';

/*
 * The Africa map from the legacy page: pre-projected country outlines (MAP.shapes), coloured by one of
 * five measures with the legacy bins, ramps and captions. Countries are keyboard-focusable links.
 */
export type Measure = 'ssr' | 'imp' | 'bal' | 'kcal' | 'prot';

const GREEN = ['#e3f1e7', '#b9dcc4', '#86c29b', '#4f9f6d', '#22804a'];
const RED = ['#fde8dc', '#f8c1a3', '#ee8b62', '#d4512e', '#8f1f0d'];
const cut = (edges: number[]) => (v: number | null) => {
  if (v == null) return -1;
  let b = 0;
  while (b < edges.length && v >= edges[b]!) b++;
  return b;
};
const usdMap = (v: number) =>
  v >= 1000 ? `US$${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} bn` : `US$${Math.round(v).toLocaleString('en-US')} m`;

type Row = Summary['countries'][string];
export const MEASURES: Record<
  Measure,
  { label: (s: Summary) => string; bins: string[]; ramp: string[]; bin: (r: Row) => number; tip: (r: Row) => string; cap: string }
> = {
  ssr: {
    label: () => 'Self-sufficiency',
    bins: ['under 25%', '25–50%', '50–75%', '75–100%', '100% or more'],
    ramp: GREEN,
    bin: (r) => (r.ssr == null ? -1 : r.ssr < 0.25 ? 0 : r.ssr < 0.5 ? 1 : r.ssr < 0.75 ? 2 : r.ssr < 1 ? 3 : 4),
    tip: (r) => (r.ssr != null ? `${pc(r.ssr, 0)} self-sufficient` : 'not grown or no data'),
    cap: 'Food self-sufficiency, all foods by weight: production as a share of consumption.',
  },
  imp: {
    label: (s) => `Food import bill, ${s.tradeYear}`,
    bins: ['under US$100 m', 'US$100–500 m', 'US$0.5–1 bn', 'US$1–5 bn', 'US$5 bn or more'],
    ramp: RED,
    bin: (r) => cut([100, 500, 1000, 5000])(r.imp),
    tip: (r) => (r.imp == null ? 'no trade data' : `${usdMap(r.imp)} of food imports`),
    cap: 'Imports of the 27 traded foods, 2024, UN Comtrade (partner reports where a country has not reported).',
  },
  bal: {
    label: (s) => `Food trade balance, ${s.tradeYear}`,
    bins: ['deficit over US$1 bn', 'deficit US$250 m–1 bn', 'deficit under US$250 m', 'surplus under US$250 m', 'surplus over US$250 m'],
    ramp: ['#8f1f0d', '#d4512e', '#f8c1a3', '#b9dcc4', '#22804a'],
    bin: (r) => (r.imp == null && r.exp == null ? -1 : cut([-1000, -250, 0, 250])((r.exp ?? 0) - (r.imp ?? 0))),
    tip: (r) => {
      if (r.imp == null && r.exp == null) return 'no trade data';
      const d = (r.exp ?? 0) - (r.imp ?? 0);
      return `${d < 0 ? 'deficit of ' : 'surplus of '}${usdMap(Math.abs(d))}`;
    },
    cap: 'Exports minus imports of the 27 traded foods, 2024, UN Comtrade.',
  },
  kcal: {
    label: (s) => `Calories per person, ${s.nutYear}`,
    bins: ['under 2,100', '2,100–2,400', '2,400–2,700', '2,700–3,000', '3,000 or more'],
    ramp: GREEN,
    bin: (r) => cut([2100, 2400, 2700, 3000])(r.kcal),
    tip: (r) => (r.kcal == null ? 'no food balance' : `${Math.round(r.kcal).toLocaleString('en-US')} kcal per person per day`),
    cap: 'Food supply in kilocalories per person per day, FAOSTAT food balances. Supply, not measured intake.',
  },
  prot: {
    label: (s) => `Protein per person, ${s.nutYear}`,
    bins: ['under 50 g', '50–60 g', '60–70 g', '70–80 g', '80 g or more'],
    ramp: GREEN,
    bin: (r) => cut([50, 60, 70, 80])(r.prot),
    tip: (r) => (r.prot == null ? 'no food balance' : `${r.prot.toFixed(0)} g of protein per person per day`),
    cap: 'Protein supply in grams per person per day, FAOSTAT food balances.',
  },
};

export function AfricaMap({
  map,
  summary,
  measure,
  selected,
  hrefFor = (id) => `/countries/${id}`,
}: {
  map: MapData;
  summary: Summary;
  measure: Measure;
  selected?: string;
  hrefFor?: (id: string) => string;
}) {
  const nav = useNavigate();
  const M = MEASURES[measure];
  return (
    <div>
      <svg viewBox={`0 0 ${map.w} ${map.h}`} className="block h-auto w-full" role="group" aria-label="Map of Africa: select a country">
        {map.shapes.map((sh) => {
          if (sh.id === 'EH')
            return (
              <path key={sh.id} d={sh.d} fill="#f1ece6" stroke="#fff" strokeWidth={0.7}>
                <title>Western Sahara: no data</title>
              </path>
            );
          const row = summary.countries[sh.id];
          const name = summary.markets[sh.id] ?? sh.name ?? sh.id;
          const b = row ? M.bin(row) : -1;
          return (
            <a
              key={sh.id}
              href={hrefFor(sh.id)}
              aria-label={`${name}: ${row ? M.tip(row) : 'no data'}`}
              onClick={(e) => {
                e.preventDefault();
                nav(hrefFor(sh.id));
              }}
              className="group outline-none"
            >
              <path
                d={sh.d}
                fill={b < 0 ? '#f1ece6' : M.ramp[b]}
                stroke={sh.id === selected ? '#3a2416' : '#fff'}
                strokeWidth={sh.id === selected ? 1.6 : 0.7}
                className="cursor-pointer transition-opacity group-hover:opacity-80 group-focus-visible:stroke-[#1d3f7a] group-focus-visible:[stroke-width:2.5]"
              >
                <title>{`${name}: ${row ? M.tip(row) : 'no data'}`}</title>
              </path>
            </a>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
        {M.bins.map((b, i) => (
          <span key={b} className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: M.ramp[i] }} />
            {b}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[#f1ece6]" />
          no data
        </span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-muted">{M.cap}</p>
    </div>
  );
}

export const measureValue = (m: Measure, r: Row) =>
  m === 'ssr' ? pc(r.ssr, 0) : m === 'imp' ? usd(r.imp) : m === 'bal' ? (r.imp == null && r.exp == null ? '–' : usd((r.exp ?? 0) - (r.imp ?? 0))) : m === 'kcal' ? (r.kcal == null ? '–' : Math.round(r.kcal).toLocaleString('en-US')) : r.prot == null ? '–' : r.prot.toFixed(0);
