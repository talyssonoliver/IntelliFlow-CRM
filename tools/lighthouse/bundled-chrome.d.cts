/** Types for bundled-chrome.cjs: the browser every Lighthouse run uses (see that file). */

/** Launch settings for a Lighthouse CLI run. */
export interface LighthouseCliLaunch {
  /** The `--chrome-flags=...` argv element: headless, with the fixed profile. */
  chromeFlagsArg: string;
  /** The environment for the child process, with CHROME_PATH set to the headless shell. */
  env: NodeJS.ProcessEnv;
}

/** Settings for a lighthouserc `ci.collect` block; empty on a Linux CI runner. */
export interface LhciCollectBrowser {
  chromePath: string | undefined;
  chromeFlags: string | undefined;
}

export class BundledChromeMissingError extends Error {}

export const PROFILE_DIR: string;

export function isLinuxCi(env?: NodeJS.ProcessEnv, platform?: string): boolean;
export function playwrightChromiumPath(): string | null;
export function headlessShellFor(chromiumPath: string | null): string | null;
export function playwrightHeadlessShellPath(): string | null;
export function resolveBundledChrome(findHeadlessShell?: () => string | null): {
  chromePath: string;
  userDataDir: string;
};
export function lighthouseChromeFlags(userDataDir: string, extra?: string[]): string[];
export function lighthouseCliLaunch(
  baseEnv?: NodeJS.ProcessEnv,
  findHeadlessShell?: () => string | null
): LighthouseCliLaunch;
export function lhciCollectBrowser(
  env?: NodeJS.ProcessEnv,
  platform?: string,
  findHeadlessShell?: () => string | null
): LhciCollectBrowser;
