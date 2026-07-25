import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for #647 — "docs:build/docs:dev silently no-op".
 *
 * Root cause of the footgun: the scripts ran `pnpm --filter docs <script>`, but
 * `docs/` is deliberately NOT a workspace member, so the filter matched zero
 * projects and pnpm EXITED 0 — reporting success while building nothing. That is
 * the silence-as-success trap: a "green" docs build that never ran.
 *
 * These tests lock the fix in place so the no-op cannot silently return:
 *   1. The root scripts must invoke the standalone docs project directly
 *      (`pnpm --dir docs …`) and must NOT use the empty-matching `--filter docs`
 *      form while docs stays out of the workspace.
 *   2. The Docusaurus preset must declare an explicit content `path` so it can
 *      never silently fall back to the nonexistent default `docs/docs/`.
 *   3. `docs/` must stay OUT of pnpm-workspace.yaml (folding it in would drag
 *      `docusaurus build` into the required turbo Build gate — see #645 revert).
 */

const repoRoot = join(__dirname, '..', '..', '..');

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('#647 docs scripts cannot silently no-op', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };

  const SILENT_FILTER = /--filter[=\s]+docs(\s|$)/;

  it('docs:build invokes the standalone docs project (not an empty --filter)', () => {
    const script = pkg.scripts['docs:build'];
    expect(script, 'docs:build script must exist').toBeTruthy();
    // Must NOT use `--filter docs` — that matches no workspace project and exits 0.
    expect(script).not.toMatch(SILENT_FILTER);
    // Must run the docs project directly so its exit code propagates.
    expect(script).toMatch(/--dir\s+docs\b/);
    expect(script).toMatch(/\brun\s+build\b/);
  });

  it('docs:dev invokes the docs dev server via the real `start` script', () => {
    const script = pkg.scripts['docs:dev'];
    expect(script, 'docs:dev script must exist').toBeTruthy();
    expect(script).not.toMatch(SILENT_FILTER);
    expect(script).toMatch(/--dir\s+docs\b/);
    // docs/package.json exposes `start` (docusaurus start), not `dev`.
    expect(script).toMatch(/\brun\s+start\b/);
  });
});

describe('#647 Docusaurus content path is explicit', () => {
  it('the docs preset declares an explicit content path', () => {
    const cfg = read('docs/docusaurus.config.js');
    // Without an explicit `path`, Docusaurus defaults to docs/docs/ (which does
    // not exist) and hard-errors "The docs folder does not exist for version …".
    expect(cfg).toMatch(/path:\s*['"]\.['"]/);
  });
});

describe('#647 docs/ stays out of the pnpm workspace', () => {
  it('pnpm-workspace.yaml does not list docs as a package', () => {
    const ws = read('pnpm-workspace.yaml');
    const activePackageLines = ws
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'));
    // No active package entry may resolve docs/ (e.g. `- 'docs'` or `- docs`).
    for (const line of activePackageLines) {
      expect(line).not.toMatch(/^-\s*['"]?docs['"]?\s*$/);
    }
  });
});
