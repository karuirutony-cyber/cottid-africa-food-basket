// Admin SDK connection using a service account key (serviceAccount.json in the project root, never committed).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { ROOT } from './page.mjs';

const key = join(ROOT, 'serviceAccount.json');
if (!existsSync(key)) {
  console.error('Missing serviceAccount.json. In the Firebase console: Project settings > Service accounts > Generate new private key. Save it in the project folder as serviceAccount.json.');
  process.exit(1);
}
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(key, 'utf8'))) });
export const db = getFirestore(app);
export const auth = getAuth(app);
