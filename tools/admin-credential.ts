/**
 * Credentials for the Admin SDK tools (seed, make-admin) against the real project:
 *   1. serviceAccount.json in the project folder (Firebase console -> Project settings -> Service accounts ->
 *      Generate new private key). It is git-ignored; never commit or share it.
 *   2. otherwise GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, type Credential } from 'firebase-admin/app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function adminCredential(): { credential: Credential; source: string; projectId?: string } {
  const file = join(root, 'serviceAccount.json');
  if (existsSync(file)) {
    const sa = JSON.parse(readFileSync(file, 'utf8')) as { project_id?: string };
    return { credential: cert(file), source: 'serviceAccount.json', projectId: sa.project_id };
  }
  return { credential: applicationDefault(), source: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'GOOGLE_APPLICATION_CREDENTIALS' : 'application default credentials' };
}

/** Turns the usual first-run failures into instructions. */
export function explain(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/Could not load the default credentials|ENOENT.*credentials/i.test(m))
    return 'No credentials. Save a service-account key as serviceAccount.json in the project folder (Firebase console -> Project settings -> Service accounts -> Generate new private key), then run this again.';
  if (/NOT_FOUND|database .* does not exist/i.test(m))
    return 'The Firestore database does not exist yet. Create it (Firebase console -> Firestore Database -> Create database, location africa-south1), then run this again.';
  if (/PERMISSION_DENIED|insufficient permission/i.test(m))
    return 'The credentials are not allowed to write to this project. Use a key from the cottid-72d51 project with the Firebase Admin role.';
  return m;
}
