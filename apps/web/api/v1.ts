/** GET /api/v1/... (vercel.json rewrites /api/v1/<path> here as ?path=<path>). */
import { errorResponse, json } from './_lib/server.js';
import { charge, FOOD, ISO2, openapi, ROUTES, secondsToMidnight } from './_lib/v1.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-API-Key, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) => json(status, { error: { code, message } }, { ...CORS, ...extra });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/v1/, '');
  const path = ('/' + raw.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/openapi.json') return json(200, openapi(url.origin), CORS);
  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) return fail(404, 'not_found', `No endpoint ${path}. See /api/v1/openapi.json.`);

  const key = req.headers.get('x-api-key') ?? url.searchParams.get('key') ?? '';
  if (!key) return fail(401, 'missing_key', 'Send your API key in the X-API-Key header.');
  try {
    const c = await charge(key);
    if (!c.ok) return fail(c.status, c.code, c.message, c.limit ? { 'X-RateLimit-Limit': String(c.limit), 'X-RateLimit-Remaining': '0', 'Retry-After': String(secondsToMidnight()) } : {});
    const rate = { 'X-RateLimit-Limit': String(c.limit), 'X-RateLimit-Remaining': String(c.remaining) };
    const [re, names, handler] = route;
    const m = path.match(re)!;
    const params = Object.fromEntries(names.map((n, i) => [n, m[i + 1]!]));
    if (params.iso2 && !ISO2.test(params.iso2.toUpperCase())) return fail(400, 'bad_request', 'iso2 must be two letters.', rate);
    if (params.food && !FOOD.test(params.food)) return fail(400, 'bad_request', 'Unknown food id.', rate);
    const query = new URLSearchParams(url.search);
    query.delete('path');
    query.delete('key');
    const out = await handler(params, query);
    return json(out.status ?? 200, out.body, { ...CORS, ...rate });
  } catch (e) {
    return errorResponse(e, CORS);
  }
}
