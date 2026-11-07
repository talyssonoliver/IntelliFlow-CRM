/**
 * How a Lighthouse CLI run started from the project tracker gets its browser: Playwright's
 * bundled Chromium with one fixed profile, never the installed Chrome (each start of that with
 * a temporary profile is a failed Windows sign-in). The rules live in one place,
 * tools/lighthouse/bundled-chrome.cjs, loaded at runtime from the repo root.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface LighthouseCliLaunch {
  /** The `--chrome-flags=...` argv element: headless, with the fixed profile. */
  chromeFlagsArg: string;
  /** The environment for the child process, with CHROME_PATH set to the bundled Chromium. */
  env: NodeJS.ProcessEnv;
}

interface BundledChromeModule {
  lighthouseCliLaunch(baseEnv?: NodeJS.ProcessEnv): LighthouseCliLaunch;
}

/**
 * The launch settings for a Lighthouse CLI run. Rejects with BundledChromeMissingError (a
 * message naming the install command) when Playwright's Chromium is not installed.
 */
export async function bundledChromeLaunch(projectRoot: string): Promise<LighthouseCliLaunch> {
  const helper = pathToFileURL(path.join(projectRoot, 'tools', 'lighthouse', 'bundled-chrome.cjs'));
  const loaded = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ helper.href
  )) as BundledChromeModule | { default: BundledChromeModule };
  const api = 'default' in loaded ? loaded.default : loaded;
  return api.lighthouseCliLaunch(process.env);
}
