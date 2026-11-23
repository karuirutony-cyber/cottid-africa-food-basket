import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** "Suggest a correction", pre-filled with this page and (optionally) the record. */
export function SuggestLink({ target, item, className = '' }: { target?: string; item?: string; className?: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const q = new URLSearchParams({ page: pathname + search, ...(target ? { target } : {}), ...(item ? { item } : {}) });
  return (
    <Link to={`/contribute?${q}`} className={`no-print text-[12.5px] ${className}`} aria-label={item ? `${t('action.suggest')}: ${item}` : undefined}>
      {t('action.suggest')}
    </Link>
  );
}
