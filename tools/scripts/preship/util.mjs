#!/usr/bin/env node
/**
 * util.mjs — shared helpers for the preship guard scripts.
 *
 * These guards harden the pre-commit / pre-ship gate against the CI failure
 * categories that reached `main` in the last few days (see
 * docs/runbooks/preship-guards.md). They are intentionally dependency-light:
 * only Node built-ins plus `js-yaml` (already a repo devDependency, used by the
 * migration-role guard to parse workflow YAML).
 *
 * Everything here is pure / side-effect-free except the `git` shell-outs, which
 * are read-only (`git diff --cached`, `git rev-parse`).
 */

import { readdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Absolute path to the repository root (this file lives in tools/scripts/preship). */
export const repoRoot = resolve(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Terminal colours (no chalk dependency)
// ---------------------------------------------------------------------------

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color = {
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  cyan: wrap('36'),
  gray: wrap('90'),
  bold: wrap('1'),
};

// ---------------------------------------------------------------------------
// Main-module detection (so each guard can be `import`ed by index.mjs AND run
// directly as `node tools/scripts/preship/check-foo.mjs`).
// ---------------------------------------------------------------------------

/** True when `moduleUrl` (import.meta.url) is the entrypoint Node was invoked with. */
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return moduleUrl === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Repo-relative path with forward slashes, for stable cross-platform output. */
export function toPosixRel(absPath) {
  return relative(repoRoot, absPath).split(sep).join('/');
}

// ---------------------------------------------------------------------------
// Filesystem walking
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '__tests__',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.git',
]);

/**
 * Recursively collect files under `dirs` matching `exts`, skipping excluded
 * directories. Returns absolute paths. Missing directories are silently
 * skipped (a workspace may not exist in every checkout).
 *
 * @param {string[]} dirs absolute directory paths
 * @param {object} [opts]
 * @param {string[]} [opts.exts] file extensions WITH the dot, e.g. ['.ts','.tsx']
 * @param {Set<string>} [opts.excludeDirs]
 */
export function walkFiles(dirs, opts = {}) {
  const exts = opts.exts ?? ['.ts', '.tsx'];
  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  const out = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist / not readable
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
      }
    }
  };

  for (const dir of dirs) walk(dir);
  return out;
}

/** True if any path segment of `absPath` is in `excludeDirs`. */
export function isExcludedPath(absPath, excludeDirs = DEFAULT_EXCLUDE_DIRS) {
  const segments = toPosixRel(absPath).split('/');
  return segments.some((s) => excludeDirs.has(s));
}

// ---------------------------------------------------------------------------
// Git helpers (read-only)
// ---------------------------------------------------------------------------

/**
 * Staged files (Added/Copied/Modified/Renamed) as absolute paths.
 * Returns [] if git is unavailable or there is no staged content.
 */
export function getStagedFiles() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((rel) => resolve(repoRoot, rel));
}

/**
 * For a single file, return the set of NEW-side line numbers that this staged
 * diff adds. Lets a guard flag only freshly-introduced code rather than
 * pre-existing lines in a file the developer merely touched — the same
 * incremental discipline the existing pre-commit secret/lint-silencer guards
 * use. Returns null when the whole file is new/unknown (treat every line as
 * added).
 */
export function getStagedAddedLines(absPath) {
  const rel = toPosixRel(absPath);
  const r = spawnSync('git', ['diff', '--cached', '--unified=0', '--', rel], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) return null;

  const added = new Set();
  let newLine = 0;
  for (const line of r.stdout.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number.parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      added.add(newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      // deletion — does not advance the new-side counter
    } else if (line.startsWith(' ')) {
      newLine += 1;
    }
  }
  return added;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

// Build the regex from a non-literal ESC (char 27) so the source carries no
// control character — avoids the no-control-regex lint without a silencer.
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Strip ANSI escape codes (so we can string-match captured child output). */
export function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

/** 1-based line number of character offset `index` within `text`. */
export function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Standard guard result shape consumed by index.mjs.
 * @typedef {object} GuardResult
 * @property {string} name      short guard id, e.g. 'migration-role-bootstrap'
 * @property {'pass'|'fail'|'skip'} status
 * @property {string} summary   one-line headline
 * @property {string[]} [findings] human-readable detail lines (printed on fail)
 */

export { __dirname };
