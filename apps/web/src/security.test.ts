import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import headers from '../../../security-headers.json';

/** Hosting must send exactly the headers the preview (and so every journey) runs under. */
describe('security headers', () => {
  const firebase = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'firebase.json'), 'utf8'));
  const sent: { key: string; value: string }[] = firebase.hosting.headers.find((h: { source: string }) => h.source === '**').headers;

  it('firebase.json sends security-headers.json unchanged', () => {
    expect(Object.fromEntries(sent.map((h) => [h.key, h.value]))).toEqual(headers);
  });
  it('the policy blocks framing, plugins and inline scripts', () => {
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/script-src 'self'[^;]*;/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });
  it('the API is reached through a Hosting rewrite, not exposed elsewhere', () => {
    expect(firebase.hosting.rewrites[0]).toEqual({ source: '/api/**', function: { functionId: 'api', region: 'africa-south1' } });
  });
});

describe('Vercel config', () => {
  const vercel = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'vercel.json'), 'utf8'));
  it('sends the same security headers as Firebase Hosting', () => {
    const all = vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[];
    expect(Object.fromEntries(all.map((h) => [h.key, h.value]))).toEqual(headers);
  });
  it('builds from the workspace root whatever the Root Directory, then serves the SPA and routes the API', () => {
    expect(vercel.buildCommand).toBe('pnpm -w run build:vercel');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' });
    expect(vercel.rewrites[0].source).toBe('/api/v1/:path*');
  });
  it('is identical at the repository root and in apps/web (the Vercel Root Directory)', () => {
    expect(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')).toBe(readFileSync(join(__dirname, '..', '..', '..', 'vercel.json'), 'utf8'));
  });
});
