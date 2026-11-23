import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** A polite status line while the connection is down. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <div role="status" aria-live="polite" className="no-print">
      {!online && (
        <p className="m-0 bg-earth px-4 py-2 text-center text-sm font-semibold text-[#fbf3e6]">
          {t('status.offline')}
        </p>
      )}
    </div>
  );
}
