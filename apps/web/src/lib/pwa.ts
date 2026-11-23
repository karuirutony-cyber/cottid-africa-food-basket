/** Registers the service worker after load so it never competes with first paint. */
export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  });
}
