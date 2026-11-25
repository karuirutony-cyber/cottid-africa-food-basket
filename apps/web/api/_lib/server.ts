/**
 * Shared server code for the Vercel functions (the platform's server while Firebase functions need the
 * Blaze plan). Uses the Firebase Admin SDK with a service account from the FIREBASE_SERVICE_ACCOUNT
 * environment variable (the JSON key, as is or base64). Files under api/_lib are not routes.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'cottid-72d51';
export const SITE = process.env.SITE_URL ?? 'https://cottid-africa-food-basket.vercel.app';

/** Thrown when the service account is not configured; answered with 503 so the site falls back. */
export class NotConfigured extends Error {}
/** An error with an HTTP status and a message the person can act on. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function configured(): boolean {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIRESTORE_EMULATOR_HOST);
}

function init() {
  if (getApps().length) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? PROJECT_ID });
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) throw new NotConfigured('FIREBASE_SERVICE_ACCOUNT is not set');
  const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as { project_id: string; client_email: string; private_key: string };
  initializeApp({ credential: cert({ projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key }), projectId: json.project_id });
}

let firestore: Firestore | null = null;
export function db(): Firestore {
  init();
  if (!firestore) {
    firestore = getFirestore();
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
export function auth() {
  init();
  return getAuth();
}

export const RANKS: Record<string, number> = { member: 1, contributor: 2, verifier: 3, content_editor: 4, data_steward: 5, platform_admin: 6, super_admin: 7 };

/** The signed-in caller, from the Firebase ID token in the Authorization header. */
export async function caller(req: Request): Promise<DecodedIdToken> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'unauthenticated', 'Sign in first.');
  try {
    return await auth().verifyIdToken(m[1]!);
  } catch (e) {
    if (e instanceof NotConfigured) throw e;
    throw new HttpError(401, 'unauthenticated', 'Your session has ended. Sign in again.');
  }
}

/**
 * The same staff check as the security rules: the role on the profile (else the claim), and a second
 * factor unless settings/security has requireTwoStep: false.
 */
export async function requireStaff(tok: DecodedIdToken, min: string): Promise<string> {
  const [profile, security] = await Promise.all([db().doc(`users/${tok.uid}`).get(), db().doc('settings/security').get()]);
  const role = String((profile.exists ? profile.get('role') : tok.role) ?? 'member');
  if ((RANKS[role] ?? 1) < (RANKS[min] ?? 99)) throw new HttpError(403, 'permission-denied', `Needs the ${min.replace('_', ' ')} role.`);
  const required = security.get('requireTwoStep') !== false;
  if (required && !(tok.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor)
    throw new HttpError(403, 'permission-denied', 'Staff actions need two-step verification. Turn it on in your account.');
  return role;
}

export async function audit(actor: string, action: string, target: string, before: unknown, after: unknown) {
  await db()
    .collection('auditLog')
    .add({ actor, action, target, before: before ?? null, after: after ?? null, time: FieldValue.serverTimestamp() });
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/** Turns any error into a JSON answer: 503 when not configured, the HttpError's status, else 500. */
export function errorResponse(e: unknown, headers: Record<string, string> = {}): Response {
  if (e instanceof NotConfigured) return json(503, { error: { code: 'not_configured', message: 'The server is not configured yet (FIREBASE_SERVICE_ACCOUNT).' } }, headers);
  if (e instanceof HttpError) return json(e.status, { error: { code: e.code, message: e.message } }, headers);
  console.error(e);
  return json(500, { error: { code: 'internal', message: 'Something went wrong on the server. Try again in a moment.' } }, headers);
}
