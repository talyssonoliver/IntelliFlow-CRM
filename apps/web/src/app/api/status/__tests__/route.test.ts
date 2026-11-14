import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '../route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/status', () => {
  it('returns fresh checks for the three services, never cached', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
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
