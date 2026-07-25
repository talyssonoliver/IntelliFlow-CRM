#!/usr/bin/env node
/**
 * vendored-js-lint — block oversized inline <script> blocks in tracked HTML.
 *
 * WHY THIS EXISTS (IFC-033 / harness Gap #2)
 * ------------------------------------------
 * IFC-033 committed a k6 load-test dashboard (`load-test-report.html`) that
 * embedded ~168 KB of *vendored* JavaScript inline. GitHub's CodeQL
 * "default-setup" (the repo-level, UI-toggled scanner) does NOT honour
 * `.github/codeql/codeql-config.yml`, so it analysed that vendored bundle and
 * raised a wall of noise alerts on third-party code we neither wrote nor ship
 * to users. The manual fix was to regenerate the report as a *script-free*
 * static HTML page.
 *
 * The repo now runs the config-respecting *advanced* CodeQL setup
 * (`.github/workflows/security.yml` -> `codeql-analysis`, `config-file:
 * ./.github/codeql/codeql-config.yml`) and default-setup is `not-configured`.
 * But default-setup is a GitHub *setting* — any repo/org admin can re-enable it
 * from the UI at any time, silently reintroducing the gap. Nothing in the repo
 * tree prevents the *pattern* (a huge vendored inline bundle) from landing.
 *
 * THIS GATE is the durable, in-repo guard: it fails the pre-ship gate the
 * moment a tracked HTML file carries an inline (non-`src`) <script> block
 * larger than the threshold, unless that file is explicitly allowlisted with a
 * rationale. It is independent of whichever CodeQL setup GitHub happens to run,
 * so it closes the gap at the source: the commit.
 *
 * Remediation for a flagged file (author's choice):
 *   1. Regenerate the report/page as script-free static HTML (the IFC-033 fix).
 *   2. Externalise the JS to a `.js` file referenced with <script src="...">
 *      (which the CodeQL config's path/globs then govern normally).
 *   3. If the file is a legitimate, reviewed tool-generated report, add it to
 *      ALLOWLIST below with a one-line reason (security-review gate).
 *
 * Usage:
 *   node tools/scripts/security/vendored-js-lint.mjs [--threshold=<bytes>] [--json]
 *   # exits 0 when clean, 1 when any non-allowlisted violation is found.
 *
 * The module also exports its pure helpers for unit testing.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default size ceiling for a single inline <script> block, in bytes.
 * Hand-authored inline scripts in this repo (theme toggles, mockup
 * interactivity, Supabase email-template snippets) are all < 2 KB. Vendored
 * bundles (Lighthouse/Playwright viewers, k6 dashboards) are 100 KB+. 8 KB
 * sits comfortably between the two, giving real inline scripts generous
 * head-room while catching every vendored bundle.
 */
export const DEFAULT_THRESHOLD_BYTES = 8 * 1024;

/**
 * Allowlist of tracked HTML files (or globs) permitted to carry large inline
 * <script> blocks. Each entry is a reviewed exception — adding one is a
 * security-review decision, not a formality.
 *
 * Globs support `*` (within a path segment) and `**` (across segments).
 *
 * NOTE: most `artifacts/**` reports are ALSO excluded from CodeQL analysis by
 * `.github/codeql/codeql-config.yml` (`artifacts/**`), so they never reach
 * CodeQL regardless. They are allowlisted here anyway so the gate is honest
 * about what is tracked, and so a `.lighthouseci/**` report (which the config
 * does NOT ignore) is covered by an explicit, documented decision rather than
 * slipping through.
 */
export const ALLOWLIST = [
  {
    pattern: 'apps/project-tracker/public/feature-matrix.html',
    reason:
      'Intentional single-file dashboard asset served by project-tracker; the ' +
      'inline script is first-party (our own feature-matrix logic), not vendored.',
  },
  {
    pattern: 'artifacts/lighthouse/**/*.html',
    reason:
      'Lighthouse HTML reports embed the vendored Lighthouse report-viewer bundle; CodeQL already ignores artifacts/**.',
  },
  {
    pattern: 'artifacts/benchmarks/**/*.html',
    reason:
      'Benchmark/Lighthouse HTML reports embed vendored viewer bundles; CodeQL already ignores artifacts/**.',
  },
  {
    pattern: 'artifacts/test-results/*.html',
    reason:
      'Playwright/test HTML reports embed the vendored report-viewer bundle; CodeQL already ignores artifacts/**.',
  },
  {
    pattern: 'artifacts/reports/*.html',
    reason:
      'Generated coverage/report HTML embeds vendored viewer scripts; CodeQL already ignores artifacts/**.',
  },
  {
    pattern: '.lighthouseci/**/*.html',
    reason: 'Lighthouse CI run reports embed the vendored Lighthouse report-viewer bundle.',
  },
];

/**
 * Convert a glob (supporting `*` and `**`) to an anchored RegExp.
 * `**` matches across path separators; `*` matches within a single segment.
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — match any run of characters, including `/`.
        re += '.*';
        i++;
        // Consume an immediately-following `/` so `a/**/b` matches `a/b`.
        if (glob[i + 1] === '/') i++;
      } else {
        // `*` — match anything except `/`.
        re += '[^/]*';
      }
    } else if ('\\^$+?.()|[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

/** Normalise a filesystem path to forward-slash form for glob/allowlist matching. */
export function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

/** True when `filePath` matches any allowlist entry. */
export function isAllowlisted(filePath, allowlist = ALLOWLIST) {
  const norm = normalizePath(filePath);
  return allowlist.some((entry) => globToRegExp(entry.pattern).test(norm));
}

/**
 * Find the largest inline <script> block in an HTML string.
 * A block is "inline" when its opening tag has no `src=` attribute.
 * Returns { maxBytes, blockCount } (byte length measured as UTF-8).
 */
export function findMaxInlineScript(html) {
  // Match a full <script ...>...</script>. `[^>]*` in the open tag is fine:
  // script open tags don't legally contain `>` in attribute values here.
  //
  // The end tag must match the way the HTML parser actually terminates a
  // script element: `</script` followed by a tag-name terminator (whitespace or
  // `/`) plus any junk up to `>`, OR a bare `</script>`. A naive `</script\s*>`
  // misses browser-honoured forms like `</script foo>` or `</script\t\n bar>`,
  // which would let an oversized bundle evade this lint (the CodeQL
  // js/bad-tag-filter class). The optional `([\s/][^>]*)?` group requires a real
  // terminator before any trailing junk, so `</scriptfoo>` does NOT count as a
  // close. This is written WITHOUT a lookahead: CodeQL's js/bad-tag-filter model
  // mis-analyses `(?=[\s/>])` and false-positives on it even though it matches
  // every form (verified), so the equivalent consuming form keeps the scanner
  // and the parser in agreement.
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script([\s/][^>]*)?>/gi;
  let m;
  let maxBytes = 0;
  let blockCount = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    // Skip external scripts (governed by <script src>): not an inline bundle.
    // Match `src=` only as a real attribute name (preceded by start-of-string or
    // whitespace). A bare `\bsrc` also matches inside `data-src=`, which would let
    // a huge inline body on `<script data-src="…">…</script>` be misread as an
    // external script and silently skipped — defeating the gate.
    if (/(^|\s)src\s*=/i.test(attrs)) continue;
    const body = m[2];
    const bytes = Buffer.byteLength(body, 'utf8');
    blockCount++;
    if (bytes > maxBytes) maxBytes = bytes;
  }
  return { maxBytes, blockCount };
}

/**
 * Lint a single file's content.
 * Returns a violation object when the largest inline script exceeds `threshold`
 * and the file is not allowlisted, otherwise null.
 */
export function lintContent(
  filePath,
  content,
  { threshold = DEFAULT_THRESHOLD_BYTES, allowlist = ALLOWLIST } = {}
) {
  const { maxBytes, blockCount } = findMaxInlineScript(content);
  if (maxBytes <= threshold) return null;
  if (isAllowlisted(filePath, allowlist)) return null;
  return { file: normalizePath(filePath), maxBytes, blockCount, threshold };
}

/**
 * Lint an array of { file, content } entries. Pure — no filesystem access.
 * Returns the list of violations.
 */
export function lintEntries(entries, opts = {}) {
  const violations = [];
  for (const { file, content } of entries) {
    const v = lintContent(file, content, opts);
    if (v) violations.push(v);
  }
  return violations;
}

/** List tracked *.html files via git (repo-relative, forward-slash paths). */
export function listTrackedHtml(cwd = process.cwd()) {
  const r = spawnSync('git', ['ls-files', '*.html'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`git ls-files failed: ${r.stderr || r.status}`);
  }
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const thresholdArg = argv.find((a) => a.startsWith('--threshold='));
  const threshold = thresholdArg
    ? Number(thresholdArg.split('=')[1])
    : process.env.VENDORED_JS_LINT_THRESHOLD
      ? Number(process.env.VENDORED_JS_LINT_THRESHOLD)
      : DEFAULT_THRESHOLD_BYTES;
  const asJson = argv.includes('--json');

  const files = listTrackedHtml(cwd);
  const entries = files.map((file) => ({
    file,
    content: fs.readFileSync(path.join(cwd, file), 'utf8'),
  }));
  const violations = lintEntries(entries, { threshold });

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ threshold, scanned: files.length, violations }, null, 2) + '\n'
    );
  } else {
    console.log(
      `vendored-js-lint: scanned ${files.length} tracked HTML file(s), threshold ${fmtBytes(threshold)} per inline <script>.`
    );
    if (violations.length === 0) {
      console.log('  ✓ no oversized non-allowlisted inline scripts found.');
    } else {
      console.error(
        `\n  ✗ ${violations.length} file(s) carry an oversized vendored inline <script>:\n`
      );
      for (const v of violations) {
        console.error(`    ${v.file}`);
        console.error(
          `      largest inline <script>: ${fmtBytes(v.maxBytes)} (limit ${fmtBytes(v.threshold)}), ${v.blockCount} inline block(s)`
        );
      }
      console.error('\n  Fix one of these ways:');
      console.error('    1. Regenerate the file as script-free static HTML (the IFC-033 fix).');
      console.error('    2. Externalise the JS to a .js file referenced via <script src="...">.');
      console.error('    3. If it is a reviewed tool-generated report, add it to ALLOWLIST in');
      console.error('       tools/scripts/security/vendored-js-lint.mjs with a one-line reason.');
      console.error('\n  Rationale: GitHub CodeQL default-setup ignores codeql-config.yml and');
      console.error(
        '  raises noise on vendored inline bundles (see docs/security/codeql-configuration.md).'
      );
    }
  }

  return violations.length === 0 ? 0 : 1;
}

// CLI entrypoint guard — only run when invoked directly, not when imported.
const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main());
}
