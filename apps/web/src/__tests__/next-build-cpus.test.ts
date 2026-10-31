/**
 * NEXT_BUILD_CPUS (#1111): pre-ship's local build sets it to cap `next build`'s
 * page workers, which default to one per CPU core less one. Without it, the
 * config leaves Next's default alone, so Vercel and CI builds are unchanged.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function experimental(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const mod = (await import('../../next.config.js')) as {
    default?: { experimental?: Record<string, unknown> };
    experimental?: Record<string, unknown>;
  };
  return (mod.default ?? mod).experimental ?? {};
}

describe('next.config experimental.cpus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_BUILD_CPUS when set', async () => {
    vi.stubEnv('NEXT_BUILD_CPUS', '2');
    expect((await experimental()).cpus).toBe(2);
  });

  it("keeps Next's default when NEXT_BUILD_CPUS is unset", async () => {
    vi.stubEnv('NEXT_BUILD_CPUS', '');
    expect((await experimental()).cpus).toBeUndefined();
  });
});
