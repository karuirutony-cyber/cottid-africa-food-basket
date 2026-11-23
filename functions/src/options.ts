import { initializeApp, getApps } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * Imported first by every module that defines functions, so the region applies to all of them
 * (ES imports run before the importing module's own code).
 * Every function runs in Johannesburg, next to the Firestore database.
 */
setGlobalOptions({ region: 'africa-south1', maxInstances: 10 });
if (!getApps().length) initializeApp();
