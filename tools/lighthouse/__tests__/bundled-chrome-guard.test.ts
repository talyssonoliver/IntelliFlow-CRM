/**
 * Guard: every Lighthouse run in the repo uses Playwright's bundled Chromium with the fixed
 * profile (tools/lighthouse/bundled-chrome.cjs), never the installed Chrome. Each start of the
 * installed Chrome with a temporary profile is a failed Windows sign-in on the owner's PC, and
 * enough of them lock the account. This scans every tracked source file, so a new launch site
 * that skips the helper fails here.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIPPED = [
  /(^|\/)node_modules\//,
  /(^|\/)__tests__\//,
  /\.test\.[a-z]+$/,
  /\.spec\.[a-z]+$/,
  /^\.agents\//,
  /^\.specify\//,
  /^docs\//,
  /^tools\/lighthouse\/bundled-chrome\.cjs$/,
];

function trackedSources(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => SOURCE.test(file) && !SKIPPED.some((skip) => skip.test(file)));
}

const read = (file: string) => readFileSync(path.join(REPO_ROOT, file), 'utf8');

/**
 * A child-process call: a bare call, or one on child_process / cp. `pattern.exec(...)` (a
 * RegExp method) is not one.
 */
const PROCESS_CALL =
  /(?:(?<![.\w$])|\b(?:cp|childProcess|child_process)\.)(exec|execSync|execFile|execFileSync|spawn|spawnSync|execa|execAsync|execFileAsync)\s*\(/g;
/** Lighthouse or LHCI named in the call: as the program, an argv element or an argv builder. */
const NAMES_LIGHTHOUSE = /lighthouse|lhci/i;
const CALL_WINDOW = 400;
const USES_HELPER = /\b(bundledChromeLaunch|lighthouseCliLaunch)\b/;

/** True when a process call in `text` names Lighthouse or LHCI within its arguments. */
function runsLighthouse(text: string): boolean {
  for (const call of text.matchAll(PROCESS_CALL)) {
    const args = text.slice(call.index, call.index + CALL_WINDOW);
    if (NAMES_LIGHTHOUSE.test(args)) return true;
  }
  return false;
}

describe('Lighthouse never starts the installed Chrome', () => {
  const files = trackedSources();

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('runs every Lighthouse or LHCI process through the bundled-Chromium helper', () => {
    const offenders = files.filter((file) => {
      const text = read(file);
      return runsLighthouse(text) && !USES_HELPER.test(text);
    });
    expect(offenders, 'run Lighthouse with bundledChromeLaunch / lighthouseCliLaunch').toEqual([]);
  });

  it('recognises a Lighthouse launch, and a RegExp exec is not one', () => {
    expect(runsLighthouse("execFileSync('npx', ['lighthouse', url])")).toBe(true);
    expect(runsLighthouse("await execFileAsync('npx', buildLighthouseArgs(url, out))")).toBe(true);
    expect(runsLighthouse("cp.spawn('npx', ['lhci', 'autorun'])")).toBe(true);
    expect(runsLighthouse('const m = /lighthouse (\\d+)/.exec(text)')).toBe(false);
    expect(runsLighthouse("spawn(shell, args); const metric = 'other'")).toBe(false);
  });

  it('never launches a browser through chrome-launcher, Lighthouse or Puppeteer directly', () => {
    const offenders = files.filter((file) =>
      /from ['"](chrome-launcher|lighthouse)['"]|require\(['"](chrome-launcher|lighthouse)['"]\)|puppeteer\.launch\(/.test(
        read(file)
      )
    );
    expect(offenders).toEqual([]);
  });

  it("never asks Playwright for the installed Chrome (channel: 'chrome')", () => {
    const offenders = files.filter((file) => /channel:\s*['"]chrome/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('gives every lighthouserc config the bundled Chromium, also to its Puppeteer login', () => {
    const configs = files.filter((file) => /^lighthouserc(\.[\w-]+)?\.js$/.test(file));
    expect(configs.length).toBeGreaterThanOrEqual(4);
    for (const file of configs) {
      const text = read(file);
      expect(text, file).toMatch(/require\(['"]\.\/tools\/lighthouse\/bundled-chrome\.cjs['"]\)/);
      expect(text, file).toMatch(/lhciCollectBrowser\(/);
      expect(text, file).toMatch(/chromePath: browser\.chromePath/);
      expect(text, file).toMatch(/chromeFlags: browser\.chromeFlags/);
      if (/puppeteerScript:/.test(text)) {
        expect(text, file).toMatch(
          /puppeteerLaunchOptions:\s*\{\s*executablePath: browser\.chromePath,\s*userDataDir: PROFILE_DIR/
        );
      }
    }
  });
});
