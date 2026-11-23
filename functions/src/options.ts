import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * Imported first by every module that defines functions, so the region applies to all of them
 * (ES imports run before the importing module's own code).
 * Every function runs in Johannesburg, next to the Firestore database.
 */
setGlobalOptions({
  region: 'africa-south1',
  maxInstances: 10,
  // App Check on callable functions: switch on (APPCHECK_ENFORCE=true in functions/.env.cottid-72d51) once the
  // web app sends tokens (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY). The emulators never enforce it.
  enforceAppCheck: process.env.APPCHECK_ENFORCE === 'true',
});
if (!getApps().length) {
  initializeApp();
  // Legacy records leave some optional fields undefined; skip them, as `pnpm seed` does.
  getFirestore().settings({ ignoreUndefinedProperties: true });
}
