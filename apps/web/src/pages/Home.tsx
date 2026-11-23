import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { HeritageMosaic, KiondoBand, sectionColour } from '@afb/ui';
import { pc, usd } from '@afb/engines';
import { SECTIONS } from '@/sections';
import { useDataset } from '@/data/datasets';
import { AfricaMap, MEASURES, type Measure } from '@/components/AfricaMap';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { SourceLinks, Select } from '@/components/ui';

const TASKS = ['countries', 'analytics', 'cost', 'directory', 'policy', 'data'] as const;
const MKEY = 'cottid-map-measure';

function storedMeasure(): Measure {
  try {
    const v = localStorage.getItem(MKEY);
    return v && v in MEASURES ? (v as Measure) : 'ssr';
  } catch {
    return 'ssr';
  }
}

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const summary = useDataset('summary').data;
  const map = useDataset('MAP').data;
  const [measure, setMeasure] = useState<Measure>(storedMeasure);
  const [mid, setMid] = useState('KE');
  const [food, setFood] = useState('rice');
  const traded = summary?.traded.includes(food) ?? false;

  const pickMeasure = (m: Measure) => {
    setMeasure(m);
    try {
      localStorage.setItem(MKEY, m);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <section
        className="relative overflow-hidden border-b border-line"
        style={{ background: 'radial-gradient(120% 90% at 0% 0%, #fff7ee 0, #ffefdc 60%, #fde3c6 100%)' }}
      >
        <HeritageMosaic />
        <div className="wrap relative grid gap-6 py-8 md:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="min-w-0">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-paprika">{t('home.kicker')}</p>
            <h1 className="m-0 mt-3 max-w-[22ch] text-[clamp(30px,4.2vw,46px)] font-bold leading-[1.04] text-earth [&_em]:text-paprika">
              <Trans i18nKey="home.h1" components={{ em: <em /> }} />
            </h1>
            <p className="mt-4 max-w-[58ch] text-[16.5px] text-muted">
              {summary
                ? `What each country grows, consumes and buys of ${summary.stats.foods} foods, from cereals and roots to vegetables, fruits, meat, fish, milk, coffee, tea and cocoa. What it will need by ${summary.stats.horizon}, and what it would take to grow more of its own.`
                : t('footer.tagline')}
            </p>

            {summary && (
              <form className="card mt-5 grid gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Find a country and a food">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CountrySelect summary={summary} value={mid} onChange={setMid} />
                  <FoodSelect summary={summary} value={food} onChange={setFood} />
                </div>
                <div>
                  <p className="m-0 text-[12.5px] font-semibold text-muted">The country</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => nav(`/countries/${mid}`)}>
                      Country summary
                    </button>
                    <button type="button" className="btn" onClick={() => nav(`/countries/${mid}/trade`)}>
                      Food trade
                    </button>
                    <button type="button" className="btn" onClick={() => nav(`/countries/${mid}/diet`)}>
                      Diet
                    </button>
                  </div>
                </div>
                <div>
                  <p className="m-0 text-[12.5px] font-semibold text-muted">This food in this country</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className="btn" onClick={() => nav(`/analytics/planner?c=${mid}&f=${food}`)}>
                      Plan
                    </button>
                    <button type="button" className="btn" onClick={() => nav(`/analytics/projections?c=${mid}&f=${food}`)}>
                      Projections
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={!traded}
                      title={traded ? undefined : 'Covers the ten traded staples only'}
                      onClick={() => nav(`/cost/calculator?c=${mid}&f=${food}`)}
                    >
                      Cost of Imports
                    </button>
                    <button type="button" className="btn" disabled={!traded} onClick={() => nav(`/directory/sellers?c=${mid}&f=${food}`)}>
                      Suppliers
                    </button>
                    <button type="button" className="btn" disabled={!traded} onClick={() => nav(`/directory/buyers?c=${mid}&f=${food}`)}>
                      Buyers
                    </button>
                  </div>
                  {!traded && (
                    <p className="m-0 mt-1 text-[12.5px] text-muted">
                      Landed cost, suppliers and buyers cover the ten traded staples; pick one to open them.
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="card min-w-0">
            {summary && map ? (
              <>
                <Select label="Colour by" value={measure} onChange={(v) => pickMeasure(v as Measure)} className="max-w-xs">
                  {(Object.keys(MEASURES) as Measure[]).map((k) => (
                    <option key={k} value={k}>
                      {MEASURES[k].label(summary)}
                    </option>
                  ))}
                </Select>
                <div className="mt-2">
                  <AfricaMap map={map} summary={summary} measure={measure} selected={mid} />
                </div>
                <p className="m-0 mt-1 text-[12.5px] text-muted">Select a country to open its summary.</p>
              </>
            ) : (
              <div className="aspect-[520/538] animate-pulse rounded-xl bg-sisal/40" role="status" aria-label={t('status.loading')} />
            )}
          </div>
        </div>
      </section>

      {summary && (
        <section className="border-b border-line bg-surface" aria-label="Coverage">
          <dl className="wrap m-0 grid grid-cols-2 gap-3 py-5 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                [String(summary.stats.countries), 'African countries'],
                [String(summary.stats.foods), `foods in ${summary.stats.groups} food groups`],
                [pc(summary.stats.grownAtHome, 0), 'of the food Africa consumes is grown at home, by weight'],
                [usd(summary.stats.africaImports), `food imports, ${summary.tradeYear}`],
                [String(summary.stats.horizon), 'projection horizon, with scenarios'],
                [summary.stats.points.toLocaleString('en-US'), 'sourced data points'],
              ] as const
            ).map(([b, l]) => (
              <div key={l} className="min-w-0">
                <dt className="sr-only">{l}</dt>
                <dd className="m-0">
                  <b className="block font-display text-[24px] leading-tight text-paprika">{b}</b>
                  <span className="text-[13px] text-muted">{l}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="wrap py-8" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="m-0 text-2xl font-bold text-earth">
          {t('home.tasks')}
        </h2>
        <KiondoBand height={8} className="mt-3 max-w-[84px] rounded-sm" />
        <ul className="m-0 mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map((id) => {
            const s = SECTIONS.find((x) => x.id === id)!;
            return (
              <li key={id}>
                <Link
                  to={s.path}
                  data-section={id}
                  className="card block h-full no-underline transition-shadow hover:shadow-md"
                  style={{ borderBlockStartColor: sectionColour[id] }}
                >
                  <span className="block font-display text-lg font-bold text-sec-ink">{t(`section.${id}`)}</span>
                  <span className="mt-1 block text-[15px] text-muted">{t(`home.task.${id}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {summary && (
        <section className="wrap grid gap-4 pb-6 lg:grid-cols-2">
          <div className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 font-body text-[16px] font-bold">Right now: {summary.climate.status}</h2>
              <span className="text-[12.5px] text-muted">{summary.climate.status_date}</span>
            </div>
            <ul className="m-0 mt-2 grid gap-1.5 ps-5 text-[14.5px]">
              {summary.climate.points.slice(1).map((x, i) => (
                <li key={x.t}>
                  <b>
                    {i < 2 ? 'Eastern Africa: ' : ''}
                    {x.t}.
                  </b>{' '}
                  <SourceLinks ids={x.src} />
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="m-0 font-body text-[16px] font-bold">Coverage and trust</h2>
            <ul className="m-0 mt-2 grid gap-1.5 ps-5 text-[14.5px]">
              <li>
                <b>Seven core markets</b> ({summary.core.map((k) => summary.markets[k]).join(', ')}): balances to{' '}
                {summary.baseYear}/{String(summary.baseYear + 1).slice(2)}, customs trade to {summary.baseYear - 1} and landed costs.
              </li>
              <li>
                <b>All other African countries</b>: balances to 2022, later years estimated by the model; landed cost at standard depth
                (MFN duty from WITS/TRAINS, indicative freight).
              </li>
              <li>
                Projections are planning ranges: tested on 2015–2022, the median demand error was {pc(summary.backtest.y1, 0)} at one year
                and {pc(summary.backtest.y5, 0)} at five.
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn" to="/about/methods">
                Methods
              </Link>
              <Link className="btn" to="/data/sources">
                Sources
              </Link>
              <Link className="btn" to="/analytics/advisory">
                Read the advisory
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
