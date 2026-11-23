import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { sectionFor } from '@/sections';

/** Placeholder for a page whose milestone has not landed yet. Shows no figures, so nothing is invented. */
export default function Building({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  return (
    <div className="wrap">
      <PageHeader kicker={section ? t(`section.${section.id}`) : undefined} title={t(titleKey)} />
      <div className="card mt-4 max-w-[68ch]">
        <p className="m-0 text-muted">{t('status.building')}</p>
      </div>
    </div>
  );
}
