/**
 * Registers the service worker after load so it never competes with first paint, and keeps it current:
 * it checks for a new version on every visit, whenever the tab comes back into view, and every hour,
 * then switches over by itself (autoUpdate reloads the page once the new version is active).
 */
export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(_url, registration) {
          if (!registration) return;
          const check = () => {
            // A version left waiting by an older worker is told to take over.
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            if (navigator.onLine) void registration.update().catch(() => undefined);
          };
          check();
          setInterval(check, 60 * 60 * 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
        },
      });
    });
  });
}
