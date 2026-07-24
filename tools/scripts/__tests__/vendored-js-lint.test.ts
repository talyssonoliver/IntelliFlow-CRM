/**
 * Tests for tools/scripts/security/vendored-js-lint.mjs
 *
 * The gate blocks tracked HTML files that carry an oversized inline (non-src)
 * <script> block — the IFC-033 vendored-JS-in-HTML pattern that CodeQL
 * default-setup analyses as noise. It exits 1 on any non-allowlisted violation.
 *
 * Pure helpers are imported and tested directly; a single end-to-end case runs
 * the CLI as a child process against a temp git repo.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_THRESHOLD_BYTES,
  ALLOWLIST,
  globToRegExp,
  normalizePath,
  isAllowlisted,
  findMaxInlineScript,
  lintContent,
  lintEntries,
} from '../security/vendored-js-lint.mjs';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GATE = path.join(ROOT, 'tools', 'scripts', 'security', 'vendored-js-lint.mjs');

const inlineScript = (bytes: number) => `<script>${'a'.repeat(bytes)}</script>`;

describe('globToRegExp', () => {
  it('matches an exact path', () => {
    expect(globToRegExp('a/b/c.html').test('a/b/c.html')).toBe(true);
    expect(globToRegExp('a/b/c.html').test('a/b/d.html')).toBe(false);
  });

  it('* does not cross a path separator', () => {
    expect(globToRegExp('a/*.html').test('a/b.html')).toBe(true);
    expect(globToRegExp('a/*.html').test('a/b/c.html')).toBe(false);
  });

  it('** crosses path separators and matches zero segments', () => {
    const re = globToRegExp('artifacts/**/*.html');
    expect(re.test('artifacts/lighthouse/x.html')).toBe(true);
    expect(re.test('artifacts/a/b/c/x.html')).toBe(true);
    expect(re.test('artifacts/x.html')).toBe(true);
    expect(re.test('other/x.html')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    expect(globToRegExp('a.b/c+d.html').test('a.b/c+d.html')).toBe(true);
    expect(globToRegExp('a.b/c+d.html').test('aXb/cXd.html')).toBe(false);
  });
});

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('a\\b\\c.html')).toBe('a/b/c.html');
  });
});

describe('findMaxInlineScript', () => {
  it('measures the largest inline block in bytes', () => {
    const html = `<html>${inlineScript(100)}${inlineScript(5000)}</html>`;
    const { maxBytes, blockCount } = findMaxInlineScript(html);
    expect(maxBytes).toBe(5000);
    expect(blockCount).toBe(2);
  });

  it('ignores external <script src> blocks', () => {
    const html = `<script src="/vendor.js"></script><script src="x.js">ignored body</script>`;
    const { maxBytes, blockCount } = findMaxInlineScript(html);
    expect(maxBytes).toBe(0);
    expect(blockCount).toBe(0);
  });

  it('handles attributes on the inline tag (type, nonce)', () => {
    const html = `<script type="text/javascript" nonce="abc">${'x'.repeat(3000)}</script>`;
    const { maxBytes, blockCount } = findMaxInlineScript(html);
    expect(maxBytes).toBe(3000);
    expect(blockCount).toBe(1);
  });

  it('measures UTF-8 byte length, not character count', () => {
    // '★' is 3 UTF-8 bytes.
    const html = `<script>${'★'.repeat(10)}</script>`;
    expect(findMaxInlineScript(html).maxBytes).toBe(30);
  });

  it('returns zero for HTML with no scripts', () => {
    expect(findMaxInlineScript('<html><body>hi</body></html>')).toEqual({
      maxBytes: 0,
      blockCount: 0,
    });
  });
});

describe('isAllowlisted', () => {
  it('matches the seeded artifact globs', () => {
    expect(isAllowlisted('artifacts/lighthouse/PG-057/x.html')).toBe(true);
    expect(isAllowlisted('artifacts/test-results/playwright-report.html')).toBe(true);
    expect(isAllowlisted('.lighthouseci/lhr-123.html')).toBe(true);
    expect(isAllowlisted('apps/project-tracker/public/feature-matrix.html')).toBe(true);
  });

  it('does not match an unlisted path (e.g. a new docs/evidence report)', () => {
    expect(isAllowlisted('docs/evidence/IFC-999/load-test-report.html')).toBe(false);
    expect(isAllowlisted('apps/web/public/some-vendor-dashboard.html')).toBe(false);
  });

  it('normalises Windows-style paths before matching', () => {
    expect(isAllowlisted('artifacts\\lighthouse\\PG-057\\x.html')).toBe(true);
  });

  it('every seeded allowlist entry carries a non-empty reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.pattern.length).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('lintContent', () => {
  it('flags an oversized inline script in a non-allowlisted file', () => {
    const v = lintContent('docs/evidence/report.html', inlineScript(DEFAULT_THRESHOLD_BYTES + 1));
    expect(v).not.toBeNull();
    expect(v?.file).toBe('docs/evidence/report.html');
    expect(v?.maxBytes).toBe(DEFAULT_THRESHOLD_BYTES + 1);
  });

  it('passes a file whose largest inline script is at the threshold', () => {
    expect(lintContent('docs/x.html', inlineScript(DEFAULT_THRESHOLD_BYTES))).toBeNull();
  });

  it('passes an oversized inline script when the file is allowlisted', () => {
    expect(lintContent('artifacts/lighthouse/x.html', inlineScript(500_000))).toBeNull();
  });

  it('respects a custom threshold', () => {
    expect(lintContent('docs/x.html', inlineScript(2000), { threshold: 1000 })).not.toBeNull();
    expect(lintContent('docs/x.html', inlineScript(2000), { threshold: 4000 })).toBeNull();
  });

  it('respects a custom allowlist', () => {
    const allowlist = [{ pattern: 'docs/**/*.html', reason: 'test' }];
    expect(lintContent('docs/x.html', inlineScript(20_000), { allowlist })).toBeNull();
    expect(lintContent('other/x.html', inlineScript(20_000), { allowlist })).not.toBeNull();
  });
});

describe('lintEntries', () => {
  it('collects violations across many entries', () => {
    const entries = [
      { file: 'ok/small.html', content: inlineScript(100) },
      { file: 'bad/big1.html', content: inlineScript(50_000) },
      { file: 'artifacts/lighthouse/allowed.html', content: inlineScript(200_000) },
      { file: 'bad/big2.html', content: inlineScript(9000) },
    ];
    const violations = lintEntries(entries);
    expect(violations.map((v) => v.file).sort()).toEqual(['bad/big1.html', 'bad/big2.html']);
  });
});

describe('CLI end-to-end', () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  // Scrub every GIT_* variable from the child env. When these tests run under a
  // git hook (e.g. the husky pre-push that invokes pre-ship), git exports
  // GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE pointing at the REAL repo. Without
  // this, `git init` in the temp dir would re-init the real repo (flipping
  // core.bare!) and `git ls-files` inside the gate would list the real repo's
  // tracked files instead of the temp fixture's. Stripping GIT_* makes each
  // child operate solely on the temp repo it is given via cwd.
  const cleanEnv = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env };
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    return e;
  };

  function makeRepo(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vjs-lint-'));
    tmpDirs.push(dir);
    const git = (args: string[]) =>
      spawnSync('git', args, {
        cwd: dir,
        env: cleanEnv(),
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'test']);
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'seed']);
    return dir;
  }

  const runGate = (cwd: string) =>
    spawnSync('node', [GATE], {
      cwd,
      env: cleanEnv(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });

  it('exits 0 on a clean tree', () => {
    const dir = makeRepo({ 'page.html': `<html>${inlineScript(200)}</html>` });
    const r = runGate(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no oversized non-allowlisted inline scripts');
  });

  it('exits 1 and names the file on a violation', () => {
    const dir = makeRepo({
      'docs/evidence/load-test-report.html': `<html>${inlineScript(200_000)}</html>`,
    });
    const r = runGate(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/evidence/load-test-report.html');
  });

  it('exits 0 when the only oversized file is allowlisted', () => {
    const dir = makeRepo({
      'artifacts/lighthouse/report.html': `<html>${inlineScript(200_000)}</html>`,
    });
    const r = runGate(dir);
    expect(r.status).toBe(0);
  });

  it('does not flag external <script src> bundles', () => {
    const dir = makeRepo({
      'page.html': `<script src="/big-vendor-bundle.js"></script>`,
    });
    const r = runGate(dir);
    expect(r.status).toBe(0);
  });
});
