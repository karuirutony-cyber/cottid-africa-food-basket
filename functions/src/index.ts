import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { ROLES } from '@afb/schema';

/** Every function runs in Johannesburg unless a feature is unavailable there (noted per function). */
setGlobalOptions({ region: 'africa-south1', maxInstances: 10 });

/**
 * M0 placeholder so the codebase builds and deploys. M1 adds ensureProfile, syncRoleClaim and bootstrap;
 * later milestones add the rest of section 7.
 */
export const health = onRequest((_req, res) => {
  res.json({ ok: true, roles: ROLES.length });
});
