/**
 * GET /api/cron?job=alerts|ingest, called by Vercel Cron (see vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set; nothing runs without it.
 */
import { errorResponse, json } from './_lib/server.js';
import { ingest, runAlerts } from './_lib/jobs.js';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { error: { code: 'unauthenticated', message: 'Cron only.' } });
  const job = new URL(req.url).searchParams.get('job');
  try {
    if (job === 'alerts') return json(200, await runAlerts());
    if (job === 'ingest') return json(200, await ingest('system:cron'));
    return json(404, { error: { code: 'not_found', message: 'Unknown job.' } });
  } catch (e) {
    return errorResponse(e);
  }
}
