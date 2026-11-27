import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET, revalidate } from '../route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SOURCE = readFileSync(resolve(__dirname, '../route.ts'), 'utf8');
// Code only: the comments above the route explain what must not be added.
function stripComments(source: string): string {
  let out = '';
  let rest = source;
  for (let start = rest.indexOf('/*'); start !== -1; start = rest.indexOf('/*')) {
    const end = rest.indexOf('*/', start + 2);
    out += rest.slice(0, start);
    rest = end === -1 ? '' : rest.slice(end + 2);
  }
  return (out + rest)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}
const CODE = stripComments(SOURCE);

describe('GET /api/status', () => {
  it('returns checks for the three services', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const res = await GET();
    const body = (await res.json()) as {
      services: { id: string; state: string }[];
      checkedAt: string;
    };
    expect(body.services.map((s) => [s.id, s.state])).toEqual([
      ['api', 'not_checked'],
      ['ai', 'not_checked'],
      ['auth', 'not_checked'],
    ]);
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });
});

// Free-plan budget (owner rule 20/11/2026): Vercel Hobby CPU and Supabase egress are shared by
// every project, so visitors must share one cached answer instead of each running the checks.
describe('/api/status cache window', () => {
  it('shares one answer for 5 minutes', () => {
    expect(revalidate).toBe(300);
    // Literal in the source: Next.js reads the segment config statically at build time.
    expect(CODE).toMatch(/export const revalidate = 300;/);
  });

  it('is at most 12 rounds of checks an hour (3 health requests each)', () => {
    expect(Math.floor(3600 / revalidate)).toBeLessThanOrEqual(12);
  });

  it('stays cacheable: nothing makes the route run per request', () => {
    expect(CODE).not.toMatch(/force-dynamic/);
    expect(CODE).not.toMatch(/no-store/);
    expect(CODE).not.toMatch(/next\/headers/);
    expect(CODE).not.toMatch(/\b(headers|cookies)\(/);
    expect(CODE).not.toMatch(/export (async )?function GET\(\s*\w/);
    expect(CODE).not.toMatch(/export const (dynamic|runtime|fetchCache) /);
  });

  it('sets no Cache-Control of its own, so the revalidate window applies', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBeNull();
  });
});
