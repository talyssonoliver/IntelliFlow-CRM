/**
 * The Playwright projects must partition tests/e2e: a spec runs logged out
 * (chromium/firefox/webkit) or logged in (authenticated), never both.
 *
 * Playwright matches testMatch globs against the ABSOLUTE file path, so a glob
 * that is correct on a developer machine (C:/Users/...) can match far more on the
 * CI runner, whose checkout lives under /home/runner/work/... . An unanchored
 * home-directory glob in AUTHED_SPECS did exactly that: every spec ran a second
 * time under the logged-in project, and the nightly E2E of 2026-10-07 failed 24
 * of its 46 tests that way. These checks use Playwright's own matcher and the
 * real config, with the specs placed under the CI runner's path.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_DIR = path.join(REPO_ROOT, 'tests/e2e');
const CI_ROOT = '/home/runner/work/IntelliFlow-CRM/IntelliFlow-CRM';

// `playwright` is not a direct dependency; reach it through @playwright/test.
const requireFromTest = createRequire(createRequire(import.meta.url).resolve('@playwright/test'));
const { createFileMatcher } = requireFromTest('playwright/lib/util') as {
  createFileMatcher: (patterns: string | RegExp | (string | RegExp)[]) => (file: string) => boolean;
};

type Project = { name?: string; testMatch?: string | RegExp | (string | RegExp)[] };

function specFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : specFiles(p);
    return e.name.endsWith('.spec.ts') ? [p] : [];
  });
}

/** The spec's path on the CI runner. */
const onRunner = (file: string) =>
  `${CI_ROOT}/${path.relative(REPO_ROOT, file).split(path.sep).join('/')}`;

let projects: Project[] = [];

beforeAll(async () => {
  // The authenticated project only exists when the QA env is present (HAS_QA_ENV).
  vi.stubEnv('SUPABASE_URL', 'http://supabase.example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x'.repeat(8));
  vi.stubEnv('DATABASE_URL', ['postgresql', '//db.example.invalid/e2e'].join(':'));
  vi.resetModules();
  const config = (await import('../../playwright.config')).default as { projects?: Project[] };
  projects = config.projects ?? [];
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const matcherOf = (name: string) => {
  const project = projects.find((p) => p.name === name);
  expect(project?.testMatch, `project ${name} has an explicit testMatch`).toBeDefined();
  return createFileMatcher(project!.testMatch!);
};

describe('playwright projects partition tests/e2e on the CI runner path', () => {
  it('no spec runs both logged out (chromium) and logged in (authenticated)', () => {
    const unauth = matcherOf('chromium');
    const authed = matcherOf('authenticated');
    const both = specFiles(E2E_DIR)
      .map(onRunner)
      .filter((f) => unauth(f) && authed(f));
    expect(both).toEqual([]);
  });

  it('the logged-out specs are not picked up by the authenticated project', () => {
    const authed = matcherOf('authenticated');
    for (const spec of ['signup.spec.ts', 'auth-flow.spec.ts', 'smoke.spec.ts', 'icons.spec.ts']) {
      expect(authed(`${CI_ROOT}/tests/e2e/${spec}`), spec).toBe(false);
    }
  });

  it('the home journey still runs logged in', () => {
    expect(matcherOf('authenticated')(`${CI_ROOT}/tests/e2e/home/home-page.spec.ts`)).toBe(true);
  });
});
