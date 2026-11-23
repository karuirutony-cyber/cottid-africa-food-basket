/**
 * Firebase web config. These are public identifiers, not secrets; any can be overridden with
 * VITE_FIREBASE_* environment variables (see .env.example).
 *
 * The SDK is loaded lazily (getFirebase) so that it is not part of the initial JavaScript budget.
 * Google Analytics is deliberately never initialised: the Terms promise no tracking cookies.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyDcr9GjSDlrUWL_chpsxBvDQKBTKxeaTRE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'cottid-72d51.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'cottid-72d51',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'cottid-72d51.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '237588065418',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:237588065418:web:f983f4077f2c2682cc1173',
  // Kept for completeness; getAnalytics is never called.
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-MQ08CVE5EF',
};

export const FUNCTIONS_REGION = 'africa-south1';
export const useEmulators = env.VITE_USE_EMULATORS === 'true';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let handles: Promise<FirebaseHandles> | null = null;

/** Initialises Firebase once, on first use. */
export function getFirebase(): Promise<FirebaseHandles> {
  handles ??= (async () => {
    const [{ initializeApp }, authMod, fsMod, fnMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);
    const app = initializeApp(firebaseConfig);
    // App Check (reCAPTCHA Enterprise): on when a site key is configured; never against the emulators.
    const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    if (siteKey && !useEmulators) {
      if (env.VITE_APPCHECK_DEBUG_TOKEN) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    });
    const db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
    const functions = fnMod.getFunctions(app, FUNCTIONS_REGION);
    if (useEmulators) {
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      fnMod.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
    return { app, auth, db, functions };
  })();
  return handles;
}
