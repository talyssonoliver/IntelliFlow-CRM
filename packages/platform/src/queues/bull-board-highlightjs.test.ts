/**
 * Regression guard: CVE-2020-26237 (highlight.js prototype pollution)
 *
 * @bull-board/ui ships its own pre-built UI bundle, and that bundle vendors a
 * copy of highlight.js as a static asset under
 * `dist/static/js/async/*.js` — it is not a resolvable npm dependency of
 * *our* lockfile, so a `pnpm.overrides` / `patchedDependencies` entry on
 * `highlight.js` itself does nothing to it. The deployed api image gets
 * whatever highlight.js build is embedded inside the installed
 * `@bull-board/ui` package, full stop.
 *
 * GitHub code-scanning alert #2269 (tool: dependency-check, rule
 * CVE-2020-26237) flagged exactly this vendored file
 * (`.../@bull-board/ui/dist/static/js/async/highlight.*.js`) — highlight.js
 * before 9.18.2 / before 10.1.2 is vulnerable to prototype pollution via a
 * crafted code-block language name.
 *
 * Verified 2026-10-12 (issue #452, debt item
 * DEP-CVE-HIGHLIGHTJS-BULLBOARD-001): the alert is already `state: "fixed"`
 * (fixed_at 2026-10-06) and the currently installed @bull-board/ui bundles
 * highlight.js >=11, far past the fixed thresholds — confirmed three ways:
 * the exact flagged file's own embedded `versionString`, @bull-board/ui's
 * own package.json `highlight.js` devDependency, and the GitHub alert state.
 * There is nothing left to patch. This test exists so that a future
 * downgrade/pin of @bull-board/ui that reintroduces an old vendored
 * highlight.js build fails CI instead of shipping into the deployed image.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// This package builds to CommonJS (see tsconfig.json: module/moduleResolution
// "Node16" with no package.json "type": "module"), so the ambient CJS
// `require` is available directly — no need for `createRequire(import.meta.url)`.

/**
 * CVE-2020-26237 vulnerable ranges per the advisory: >=7.2.0 <9.18.2 and
 * >=10.0.0 <10.1.2. We treat *any* version below the two fixed thresholds as
 * vulnerable (a superset of the named range) — intentionally conservative.
 */
function isVulnerableHighlightJsVersion(version: string): boolean {
  const parts = version.split('.').map(Number);
  const [major, minor, patch] = parts;
  if (parts.length !== 3 || [major, minor, patch].some((n) => Number.isNaN(n))) {
    throw new Error(`Unparseable highlight.js version string: "${version}"`);
  }
  if (major < 9 || (major === 9 && (minor < 18 || (minor === 18 && patch < 2)))) {
    return true;
  }
  if (major === 10 && (minor < 1 || (minor === 1 && patch < 2))) {
    return true;
  }
  return false;
}

describe('isVulnerableHighlightJsVersion (CVE-2020-26237 range)', () => {
  it.each([
    ['9.17.9', true],
    ['9.18.1', true],
    ['9.18.2', false],
    ['10.0.0', true],
    ['10.1.1', true],
    ['10.1.2', false],
    ['10.6.0', false],
    ['11.11.1', false],
    ['11.12.0', false],
  ] as const)('%s -> vulnerable=%s', (version, expected) => {
    expect(isVulnerableHighlightJsVersion(version)).toBe(expected);
  });

  it('throws rather than silently passing on an unparseable version', () => {
    expect(() => isVulnerableHighlightJsVersion('not-a-version')).toThrow();
  });
});

describe('bull-board vendored highlight.js (CVE-2020-26237)', () => {
  it('bundles a highlight.js build that is not in the vulnerable range', () => {
    const uiPackageJsonPath = require.resolve('@bull-board/ui/package.json');
    const asyncChunkDir = join(dirname(uiPackageJsonPath), 'dist', 'static', 'js', 'async');

    const chunkFiles = readdirSync(asyncChunkDir).filter((f) => f.endsWith('.js'));
    expect(
      chunkFiles.length,
      `expected JS chunks under ${asyncChunkDir}; @bull-board/ui's dist layout may have changed`
    ).toBeGreaterThan(0);

    const foundVersions = new Set<string>();
    for (const file of chunkFiles) {
      const content = readFileSync(join(asyncChunkDir, file), 'utf8');
      const match = content.match(/versionString="(\d+\.\d+\.\d+)"/);
      if (match) foundVersions.add(match[1]);
    }

    expect(
      foundVersions.size,
      'expected to find an embedded highlight.js versionString in one of the vendored chunks — ' +
        'if @bull-board/ui changed how it bundles/minifies highlight.js, this check needs updating ' +
        'rather than being allowed to pass vacuously'
    ).toBeGreaterThan(0);

    for (const version of foundVersions) {
      expect(
        isVulnerableHighlightJsVersion(version),
        `highlight.js ${version} vendored inside @bull-board/ui is in the CVE-2020-26237 vulnerable ` +
          'range. Patch it via a pnpm patch (patch-package / `pnpm patch`) targeting @bull-board/ui, ' +
          'or bump @bull-board/ui to a release that vendors a fixed build.'
      ).toBe(false);
    }
  });

  it("matches @bull-board/ui's own declared highlight.js version", () => {
    const uiPackageJsonPath = require.resolve('@bull-board/ui/package.json');
    const uiPackageJson = JSON.parse(readFileSync(uiPackageJsonPath, 'utf8')) as {
      devDependencies?: Record<string, string>;
    };
    const declared = uiPackageJson.devDependencies?.['highlight.js'];
    expect(
      declared,
      "@bull-board/ui's package.json should declare the highlight.js version it was built with"
    ).toBeTruthy();

    // declared is a semver range like "^11.12.0" — strip the range operator.
    const declaredVersion = (declared ?? '').replace(/^[^\d]*/, '');
    expect(isVulnerableHighlightJsVersion(declaredVersion)).toBe(false);
  });
});
