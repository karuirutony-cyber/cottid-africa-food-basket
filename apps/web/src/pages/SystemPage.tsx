import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';

function SystemMessage({ title, body, retry }: { title: string; body: string; retry?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="wrap pb-10">
      <PageHeader title={title} lead={body} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/" className="btn btn-primary">
          {t('system.goHome')}
        </Link>
        {retry && (
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('system.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return <SystemMessage title={t('system.notFoundTitle')} body={t('system.notFoundBody')} />;
}

export function Offline() {
  const { t } = useTranslation();
  return <SystemMessage title={t('system.offlineTitle')} body={t('system.offlineBody')} retry />;
}

export function Maintenance() {
  const { t } = useTranslation();
  return <SystemMessage title={t('system.maintenanceTitle')} body={t('system.maintenanceBody')} retry />;
}

/**
 * Route error boundary. A lazy page that fails to load while offline shows the offline page;
 * an unknown route shows 404; anything else is logged and shows a retry.
 */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return <Offline />;
  console.error(error);
  return <ErrorPage />;
}

function ErrorPage() {
  const { t } = useTranslation();
  return <SystemMessage title={t('system.errorTitle')} body={t('system.errorBody')} retry />;
}
