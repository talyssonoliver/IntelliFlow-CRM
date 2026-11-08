/**
 * tools/lighthouse/bundled-chrome.cjs: Lighthouse runs use Playwright's bundled Chromium with
 * one fixed profile, and never the installed Chrome. No browser is started here.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Imported through vitest (not createRequire) so the coverage run counts the helper's lines.
import * as helperModule from '../bundled-chrome.cjs';

const helper = ((helperModule as { default?: unknown }).default ?? helperModule) as {
  headlessShellFor(chromiumPath: string | null): string | null;
  BundledChromeMissingError: new () => Error;
  PROFILE_DIR: string;
  playwrightChromiumPath(): string | null;
  playwrightHeadlessShellPath(): string | null;
  resolveBundledChrome(find?: () => string | null): { chromePath: string; userDataDir: string };
  isLinuxCi(env?: Record<string, string | undefined>, platform?: string): boolean;
  lhciCollectBrowser(
    env?: Record<string, string | undefined>,
    platform?: string,
    find?: () => string | null
  ): { chromePath?: string; chromeFlags?: string };
  lighthouseCliLaunch(
    env?: Record<string, string | undefined>,
    find?: () => string | null
  ): { chromeFlagsArg: string; env: Record<string, string | undefined> };
};

const FAKE_CHROMIUM = path.join(
  'ms-playwright',
  'chromium_headless_shell-0000',
  'chrome-headless-shell-win64',
  'chrome-headless-shell.exe'
);
const found = () => FAKE_CHROMIUM;
const missing = () => null;

describe("Playwright's chrome-headless-shell, located from its Chromium build", () => {
  function playwrightCache(withShell: boolean): string {
    const root = mkdtempSync(path.join(tmpdir(), 'ms-playwright-'));
    mkdirSync(path.join(root, 'chromium-1248', 'chrome-win64'), { recursive: true });
    writeFileSync(path.join(root, 'chromium-1248', 'chrome-win64', 'chrome.exe'), '');
    if (withShell) {
      const shellDir = path.join(
        root,
        'chromium_headless_shell-1248',
        'chrome-headless-shell-win64'
      );
      mkdirSync(shellDir, { recursive: true });
      writeFileSync(path.join(shellDir, 'chrome-headless-shell.exe'), '');
    }
    return root;
  }

  it('finds the headless shell of the same build, never the full Chromium', () => {
    const root = playwrightCache(true);
    try {
      const chromium = path.join(root, 'chromium-1248', 'chrome-win64', 'chrome.exe');
      expect(helper.headlessShellFor(chromium)).toBe(
        path.join(
          root,
          'chromium_headless_shell-1248',
          'chrome-headless-shell-win64',
          'chrome-headless-shell.exe'
        )
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gives nothing when the platform folder holds no headless shell executable', () => {
    const root = playwrightCache(false);
    try {
      mkdirSync(path.join(root, 'chromium_headless_shell-1248', 'chrome-headless-shell-win64'), {
        recursive: true,
      });
      const chromium = path.join(root, 'chromium-1248', 'chrome-win64', 'chrome.exe');
      expect(helper.headlessShellFor(chromium)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gives nothing when the headless shell is not installed, so the caller refuses', () => {
    const root = playwrightCache(false);
    try {
      const chromium = path.join(root, 'chromium-1248', 'chrome-win64', 'chrome.exe');
      expect(helper.headlessShellFor(chromium)).toBeNull();
      expect(helper.headlessShellFor(null)).toBeNull();
      expect(helper.headlessShellFor(path.join(root, 'Google', 'Chrome', 'chrome.exe'))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the headless shell for Lighthouse', () => {
  it('keeps the profile in one fixed directory under the gitignored .cache', () => {
    expect(helper.PROFILE_DIR.split(path.sep)).toContain('.cache');
    expect(path.basename(helper.PROFILE_DIR)).toBe('lighthouse-chromium-profile');
  });

  it('gives the Lighthouse CLI the bundled Chromium and the fixed profile', () => {
    const launch = helper.lighthouseCliLaunch({ PATH: 'x' }, found);
    expect(launch.env.CHROME_PATH).toBe(FAKE_CHROMIUM);
    expect(launch.env.PATH).toBe('x');
    expect(launch.chromeFlagsArg.startsWith('--chrome-flags=')).toBe(true);
    // Last, so it replaces the temporary profile chrome-launcher adds before these flags.
    expect(launch.chromeFlagsArg.endsWith(`--user-data-dir=${helper.PROFILE_DIR}`)).toBe(true);
  });

  it('refuses when Playwright Chromium is missing, instead of using the installed Chrome', () => {
    expect(() => helper.lighthouseCliLaunch({}, missing)).toThrow(helper.BundledChromeMissingError);
    expect(() => helper.lighthouseCliLaunch({}, missing)).toThrow(/playwright install chromium/);
    expect(() => helper.lhciCollectBrowser({}, 'win32', missing)).toThrow(
      helper.BundledChromeMissingError
    );
  });

  it('gives lighthouserc the bundled Chromium on a developer machine, Windows CI included', () => {
    for (const [env, platform] of [
      [{}, 'win32'],
      [{}, 'linux'],
      [{ CI: 'true' }, 'win32'],
    ] as const) {
      const browser = helper.lhciCollectBrowser({ ...env }, platform, found);
      expect(browser.chromePath).toBe(FAKE_CHROMIUM);
      expect(browser.chromeFlags).toContain(`--user-data-dir=${helper.PROFILE_DIR}`);
    }
  });

  /**
   * The defaults read this machine: Playwright's install and process.env. Only paths are looked
   * up (Playwright's executablePath() starts nothing), so the result is either the headless
   * shell or the refusal, never another browser.
   */
  it('with the defaults, finds the installed headless shell or refuses', () => {
    const chromium = helper.playwrightChromiumPath();
    expect(chromium === null || typeof chromium === 'string').toBe(true);
    const shell = helper.playwrightHeadlessShellPath();
    if (shell !== null) expect(path.basename(shell)).toMatch(/^chrome-headless-shell(\.exe)?$/);

    expect(helper.isLinuxCi()).toBe(process.env.CI === 'true' && process.platform !== 'win32');

    const outcomes = [
      () => helper.resolveBundledChrome().chromePath,
      () => helper.lighthouseCliLaunch().env.CHROME_PATH,
      () => helper.lhciCollectBrowser().chromePath,
    ].map((run) => {
      try {
        return run();
      } catch (error) {
        expect(error).toBeInstanceOf(helper.BundledChromeMissingError);
        return 'refused';
      }
    });
    for (const outcome of outcomes) {
      if (outcome === 'refused' || outcome === undefined) continue; // undefined: Linux CI
      expect(path.basename(String(outcome))).toMatch(/^chrome-headless-shell(\.exe)?$/);
    }
  });

  it('leaves a Linux CI runner its own Chrome (no Windows account there)', () => {
    expect(helper.isLinuxCi({ CI: 'true' }, 'linux')).toBe(true);
    expect(helper.lhciCollectBrowser({ CI: 'true' }, 'linux', missing)).toEqual({
      chromePath: undefined,
      chromeFlags: undefined,
    });
  });
});
