/**
 * POST /api/metrics/web-vitals starts Lighthouse with Playwright's bundled Chromium and the
 * fixed profile, never the installed Chrome, and refuses when that Chromium is missing.
 * No process or browser is started here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileSync, bundledChromeLaunch } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  bundledChromeLaunch: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFileSync }));
vi.mock('../lib/bundled-chrome', () => ({ bundledChromeLaunch }));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

import { POST } from '../app/api/metrics/web-vitals/route';

const request = (url: string) => ({ json: async () => ({ url }) }) as never;

beforeEach(() => {
  execFileSync.mockReset();
  bundledChromeLaunch.mockReset();
});

describe('web-vitals Lighthouse scan', () => {
  it('runs Lighthouse with the bundled Chromium and the fixed profile', async () => {
    bundledChromeLaunch.mockResolvedValue({
      chromeFlagsArg: '--chrome-flags=--headless=new --user-data-dir=/repo/.cache/profile',
      env: { CHROME_PATH: '/ms-playwright/chromium/chrome' },
    });

    await POST(request('http://localhost:3000/'));

    const [program, args, options] = execFileSync.mock.calls[0];
    expect(program).toBe('npx');
    expect(args).toContain('--chrome-flags=--headless=new --user-data-dir=/repo/.cache/profile');
    expect(options.env.CHROME_PATH).toBe('/ms-playwright/chromium/chrome');
  });

  it('refuses, starting nothing, when the bundled Chromium is not installed', async () => {
    bundledChromeLaunch.mockRejectedValue(
      Object.assign(new Error('pnpm exec playwright install chromium'), {
        name: 'BundledChromeMissingError',
      })
    );

    const response = (await POST(request('http://localhost:3000/'))) as unknown as {
      status: number;
      body: { details: string };
    };

    expect(response.status).toBe(503);
    expect(response.body.details).toMatch(/playwright install chromium/);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
