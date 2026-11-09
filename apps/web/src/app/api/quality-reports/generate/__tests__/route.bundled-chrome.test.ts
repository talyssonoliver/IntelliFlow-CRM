/**
 * POST /api/quality-reports/generate (Lighthouse) starts Lighthouse with Playwright's bundled
 * Chromium and the fixed profile, never the installed Chrome, and refuses when that Chromium
 * is missing. No process or browser is started here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { exec, execFile, bundledChromeLaunch } = vi.hoisted(() => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  bundledChromeLaunch: vi.fn(),
}));

vi.mock('node:child_process', () => ({ exec, execFile, default: { exec, execFile } }));
vi.mock('@/lib/lighthouse/bundled-chrome', () => ({ bundledChromeLaunch }));
vi.mock('@/lib/route-access', () => ({
  requireOperator: vi.fn(async () => null),
  requireSignedIn: vi.fn(async () => null),
  refuseInProduction: vi.fn(() => null),
}));
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
}));

import { POST } from '../route';

const lighthouseRequest = () =>
  ({
    json: async () => ({ reports: ['lighthouse'], url: 'http://localhost:3000' }),
    headers: new Headers(),
  }) as never;

beforeEach(() => {
  exec.mockReset();
  execFile.mockReset();
  bundledChromeLaunch.mockReset();
  // git rev-parse and `npx lighthouse --version` (no browser) both answer.
  exec.mockImplementation((_cmd: string, _opts: unknown, cb: (e: null, r: unknown) => void) =>
    cb(null, { stdout: '/repo\n', stderr: '' })
  );
  execFile.mockImplementation(
    (_file: string, _args: string[], _opts: unknown, cb: (e: null, r: unknown) => void) =>
      cb(null, { stdout: '', stderr: '' })
  );
});

describe('quality-reports Lighthouse run', () => {
  it('runs Lighthouse with the bundled Chromium and the fixed profile', async () => {
    bundledChromeLaunch.mockResolvedValue({
      chromeFlagsArg: '--chrome-flags=--headless=new --user-data-dir=/repo/.cache/profile',
      env: { CHROME_PATH: '/ms-playwright/chromium/chrome' },
    });

    await POST(lighthouseRequest());

    expect(execFile).toHaveBeenCalledTimes(1);
    const [program, args, options] = execFile.mock.calls[0];
    expect(program).toBe('npx');
    expect(args).toContain('--chrome-flags=--headless=new --user-data-dir=/repo/.cache/profile');
    expect(options.env.CHROME_PATH).toBe('/ms-playwright/chromium/chrome');
  });

  it('refuses, starting nothing, when the bundled Chromium is not installed', async () => {
    bundledChromeLaunch.mockRejectedValue(new Error('pnpm exec playwright install chromium'));

    const response = (await POST(lighthouseRequest())) as Response;
    const body = (await response.json()) as {
      success: boolean;
      data: { results: Array<{ success: boolean; message: string }> };
    };

    expect(body.success).toBe(false);
    expect(body.data.results[0]).toMatchObject({ success: false });
    expect(body.data.results[0].message).toMatch(/playwright install chromium/);
    expect(execFile).not.toHaveBeenCalled();
  });
});
