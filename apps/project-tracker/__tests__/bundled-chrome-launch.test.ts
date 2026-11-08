/**
 * bundledChromeLaunch loads tools/lighthouse/bundled-chrome.cjs from the given repo root and
 * returns its launch settings. A stub helper in a temporary root stands in for the real one,
 * so nothing looks for or starts a browser.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundledChromeLaunch } from '../lib/bundled-chrome';

const roots: string[] = [];

function repoWithHelper(body: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'bundled-chrome-tracker-'));
  roots.push(root);
  mkdirSync(path.join(root, 'tools', 'lighthouse'), { recursive: true });
  writeFileSync(path.join(root, 'tools', 'lighthouse', 'bundled-chrome.cjs'), body);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bundledChromeLaunch (project tracker)', () => {
  it("returns the helper's launch settings, given this process's environment", async () => {
    const root = repoWithHelper(
      `module.exports = { lighthouseCliLaunch: (env) => ({
         chromeFlagsArg: '--chrome-flags=--headless=new --user-data-dir=/fixed',
         env: { CHROME_PATH: '/stub/chrome-headless-shell', SAW_PATH: String(Boolean(env && env.PATH)) },
       }) };`
    );
    const launch = await bundledChromeLaunch(root);
    expect(launch.chromeFlagsArg).toBe('--chrome-flags=--headless=new --user-data-dir=/fixed');
    expect(launch.env.CHROME_PATH).toBe('/stub/chrome-headless-shell');
    expect(launch.env.SAW_PATH).toBe(String(Boolean(process.env.PATH)));
  });

  it('rejects with the helper error when the bundled Chromium is missing', async () => {
    const root = repoWithHelper(
      `module.exports = { lighthouseCliLaunch: () => {
         throw new Error('Run: pnpm exec playwright install chromium');
       } };`
    );
    await expect(bundledChromeLaunch(root)).rejects.toThrow(/playwright install chromium/);
  });
});
