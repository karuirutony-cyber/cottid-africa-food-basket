import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { HeritageMosaic, KiondoBand, sectionColour } from '@afb/ui';
import { SECTIONS } from '@/sections';

const TASKS = ['countries', 'analytics', 'cost', 'directory', 'policy', 'data'] as const;

export default function Home() {
  const { t } = useTranslation();
  return (
    <>
      <section
        className="relative overflow-hidden border-b border-line"
        style={{ background: 'radial-gradient(120% 90% at 0% 0%, #fff7ee 0, #ffefdc 60%, #fde3c6 100%)' }}
      >
        <HeritageMosaic />
        <div className="wrap relative py-10 md:py-14">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-paprika">{t('home.kicker')}</p>
          {/* Heading taken verbatim from the legacy page, in all five languages. */}
          <h1 className="m-0 mt-3 max-w-[22ch] text-[clamp(30px,4.2vw,48px)] font-bold leading-[1.04] text-earth [&_em]:text-paprika">
            <Trans i18nKey="home.h1" components={{ em: <em /> }} />
          </h1>
          <p className="mt-4 max-w-[60ch] text-[17px] text-muted">{t('footer.tagline')}</p>
        </div>
      </section>

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
    </>
  );
}
