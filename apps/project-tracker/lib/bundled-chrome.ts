/**
 * The browser for a Lighthouse CLI run started from the project tracker: Playwright's headless
 * shell with the fixed profile, decided by tools/lighthouse/bundled-chrome.cjs and loaded from
 * the repo root at runtime.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as BundledChrome from '../../../tools/lighthouse/bundled-chrome.cjs';

export type { LighthouseCliLaunch } from '../../../tools/lighthouse/bundled-chrome.cjs';

/** Rejects with BundledChromeMissingError when the headless shell is not installed. */
export async function bundledChromeLaunch(projectRoot: string) {
  const file = pathToFileURL(path.join(projectRoot, 'tools/lighthouse/bundled-chrome.cjs'));
  const { default: helper } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ file.href
  )) as { default: typeof BundledChrome };
  return helper.lighthouseCliLaunch(process.env);
}
