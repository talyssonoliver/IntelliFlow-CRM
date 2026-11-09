/**
 * The browser every Lighthouse run in this repo uses: Playwright's chrome-headless-shell.
 *
 * Why: on the owner's Windows PC every start of a full Chrome or Chromium with a fresh
 * temporary profile is a failed Windows sign-in, and enough of them lock the account.
 * Lighthouse (through chrome-launcher) starts its browser with a fresh temporary profile on
 * each run, and the Lighthouse CLI gives no way to replace it: chrome-launcher puts its own
 * --user-data-dir first, and a later one does not take effect. So:
 *
 * - every Lighthouse run uses Playwright's chrome-headless-shell, never a full Chrome or
 *   Chromium, the installed Chrome included;
 * - when the headless shell is not installed, this refuses with the install command; there is
 *   no fallback to any other browser;
 * - the fixed profile under the repo's gitignored .cache is still passed: Puppeteer login
 *   scripts honour it (puppeteerLaunchOptions.userDataDir), and so does any launcher that
 *   accepts one.
 *
 * The one exception: a Linux CI runner (CI=true, not Windows) keeps its own Chrome, as before.
 * There is no Windows account there, and the Lighthouse CI action provides the browser.
 *
 * Every Lighthouse launch site goes through this module; tools/lighthouse/__tests__/
 * bundled-chrome-guard.test.ts fails if a new one does not.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(REPO_ROOT, '.cache', 'lighthouse-chromium-profile');

const MISSING_MESSAGE =
  "Lighthouse needs Playwright's chrome-headless-shell, and it is not installed. Install it " +
  'with `pnpm exec playwright install chromium`. No other browser is used: on this PC each ' +
  'start of a full Chrome or Chromium with a temporary profile is a failed Windows sign-in.';

class BundledChromeMissingError extends Error {
  constructor() {
    super(MISSING_MESSAGE);
    this.name = 'BundledChromeMissingError';
  }
}

/** True on a Linux CI runner, which keeps its own Chrome (no Windows account to protect). */
function isLinuxCi(env = process.env, platform = process.platform) {
  return env.CI === 'true' && platform !== 'win32';
}

/** Playwright's full Chromium path, used only to locate the headless shell of the same build. */
function playwrightChromiumPath() {
  const requireFromRoot = createRequire(path.join(REPO_ROOT, 'package.json'));
  for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      const executable = requireFromRoot(name).chromium.executablePath();
      if (executable) return executable;
    } catch {
      // Not resolvable from the repo root: try the next package.
    }
  }
  return null;
}

/**
 * The chrome-headless-shell of the same Playwright build as `chromiumPath`
 * (ms-playwright/chromium-<rev>/... -> ms-playwright/chromium_headless_shell-<rev>/
 * chrome-headless-shell-<platform>/chrome-headless-shell[.exe]), or null when not installed.
 */
function headlessShellFor(chromiumPath) {
  if (!chromiumPath) return null;
  const parts = path.resolve(chromiumPath).split(path.sep);
  const index = parts.findIndex((part) => /^chromium-\d+$/.test(part));
  if (index < 0) return null;
  const revision = parts[index].slice('chromium-'.length);
  const shellRoot = path.join(...parts.slice(0, index), `chromium_headless_shell-${revision}`);
  const absoluteRoot = path.isAbsolute(shellRoot) ? shellRoot : path.sep + shellRoot;
  let platformDirs;
  try {
    platformDirs = fs
      .readdirSync(absoluteRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chrome-headless-shell-'));
  } catch {
    return null;
  }
  for (const dir of platformDirs) {
    for (const file of ['chrome-headless-shell.exe', 'chrome-headless-shell']) {
      const candidate = path.join(absoluteRoot, dir.name, file);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Playwright's chrome-headless-shell, or null when Playwright or the shell is missing. */
function playwrightHeadlessShellPath() {
  return headlessShellFor(playwrightChromiumPath());
}

/**
 * The headless shell and the fixed profile directory. Throws BundledChromeMissingError when
 * the headless shell is not installed; never returns a full Chrome or Chromium.
 */
function resolveBundledChrome(findHeadlessShell = playwrightHeadlessShellPath) {
  const chromePath = findHeadlessShell();
  if (!chromePath) throw new BundledChromeMissingError();
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return { chromePath, userDataDir: PROFILE_DIR };
}

/** Chrome flags for a Lighthouse run, with the fixed profile. */
function lighthouseChromeFlags(userDataDir, extra = []) {
  return ['--headless', '--no-sandbox', '--disable-gpu', ...extra, `--user-data-dir=${userDataDir}`];
}

/**
 * For the Lighthouse CLI (`npx lighthouse ...`): the extra argv flag and the environment that
 * make it start the headless shell (chrome-launcher reads CHROME_PATH).
 */
function lighthouseCliLaunch(baseEnv = process.env, findHeadlessShell = playwrightHeadlessShellPath) {
  const { chromePath, userDataDir } = resolveBundledChrome(findHeadlessShell);
  return {
    chromeFlagsArg: `--chrome-flags=${lighthouseChromeFlags(userDataDir).join(' ')}`,
    env: { ...baseEnv, CHROME_PATH: chromePath },
  };
}

/**
 * For a lighthouserc `ci.collect` block: chromePath and the Chrome flags to merge into
 * `settings`. Empty on a Linux CI runner, which keeps its own Chrome.
 */
function lhciCollectBrowser(
  env = process.env,
  platform = process.platform,
  findHeadlessShell = playwrightHeadlessShellPath
) {
  if (isLinuxCi(env, platform)) return { chromePath: undefined, chromeFlags: undefined };
  const { chromePath, userDataDir } = resolveBundledChrome(findHeadlessShell);
  return { chromePath, chromeFlags: lighthouseChromeFlags(userDataDir).join(' ') };
}

module.exports = {
  BundledChromeMissingError,
  PROFILE_DIR,
  headlessShellFor,
  isLinuxCi,
  lhciCollectBrowser,
  lighthouseChromeFlags,
  lighthouseCliLaunch,
  playwrightChromiumPath,
  playwrightHeadlessShellPath,
  resolveBundledChrome,
};
