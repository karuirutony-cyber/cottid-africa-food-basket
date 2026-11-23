import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeritageMosaic, KiondoBand } from '@afb/ui';
import { SECTIONS } from '@/sections';

/** Copyright year is fixed by the brand brief. */
const COPYRIGHT_YEAR = 2026;

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-12">
      <KiondoBand height={14} />
      <div className="relative overflow-hidden bg-[#f3e4cb]">
        <HeritageMosaic />
        <div className="wrap relative grid gap-6 py-8 md:grid-cols-[1.2fr_2fr]">
          <div>
            <p className="m-0 font-display text-lg font-bold text-earth">{t('brand.name')}</p>
            <p className="mt-1 max-w-[44ch] text-sm text-muted">{t('footer.tagline')}</p>
          </div>
          <nav aria-label={t('a11y.sections')}>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0 text-sm sm:grid-cols-4">
              {SECTIONS.filter((s) => s.id !== 'home').map((s) => (
                <li key={s.id}>
                  <Link to={s.path} className="text-earth">
                    {t(`section.${s.id}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="m-0 border-t border-line pt-4 text-sm text-earth md:col-span-2">
            {t('footer.rights', { year: COPYRIGHT_YEAR })}
          </p>
        </div>
      </div>
    </footer>
  );
}
