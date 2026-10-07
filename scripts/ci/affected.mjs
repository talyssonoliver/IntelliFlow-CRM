#!/usr/bin/env node
/**
 * PR change detection for CI: decides how much of the pipeline a pull request
 * has to run.
 *
 *   mode=full      run everything (non-PR events, root config, lockfile,
 *                  turbo.json, tsconfig base, .github/, or any path we do not
 *                  recognise)
 *   mode=affected  run lint / typecheck / build / unit tests for the changed
 *                  workspace packages plus every package that depends on them
 *   mode=none      docs-only: the required jobs report but do no work
 *
 * FAIL-SAFE CONTRACT: every consumer treats a missing or empty output as
 * "full". If this script crashes, or its job fails, CI runs the whole suite
 * instead of skipping it. Never invert that default.
 *
 * Main is unaffected: push to main, merge_group, schedule and dispatch always
 * resolve to full.
 *
 * Usage (CI):  node scripts/ci/affected.mjs --event <name> --base <ref> --head <ref>
 * Writes key=value lines to $GITHUB_OUTPUT (or stdout when unset).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FULL_SHARDS = 20;

// Same set the push trigger in ci.yml already treats as not needing CI.
const DOC_PATTERNS = [
  /\.md$/i,
  /^docs\//,
  /^artifacts\//,
  /^\.specify\//,
  /^apps\/project-tracker\/docs\/metrics\//,
];

// Paths that can change the behaviour of every package at once.
const FULL_PATTERNS = [
  /^\.github\//,
  /^[^/]+$/, // any root-level file: package.json, pnpm-lock.yaml, turbo.json, tsconfig*.json, vitest.config.ts, .nvmrc ...
  /^packages\/typescript-config\//,
  /^eslint-rules\//,
  /^tools\/eslint\//,
  /^tools\/lint\//,
];

// Suites that never run in the PR unit shards.
const NO_UNIT_PATTERNS = [/^tests\/e2e\//, /^tests\/property\//];
const INTEGRATION_DIR = 'tests/integration/';
// Root-level tests outside any workspace package; always part of an affected run.
const ROOT_TESTS_DIR = 'tests/';
const SCRIPT_PATTERNS = [/^scripts\//, /^tools\/scripts\//];
const SCRIPT_TEST_DIRS = ['scripts/', 'tools/scripts/'];

const TEST_FILE = /\.(test|spec)\.tsx?$/;
const NOT_UNIT_TEST_DIRS = [/^tests\/integration\//, /^tests\/property\//, /^tests\/e2e\//];

const byText = (a, b) => a.localeCompare(b);

/**
 * What one changed path means for the run: `full` (with a reason), `skip`,
 * `integration`, `scripts`, `rootTests`, or `package` (with its name).
 */
function classifyPath(f, packagesDeepestFirst) {
  if (DOC_PATTERNS.some((p) => p.test(f))) return { kind: 'skip' };
  if (FULL_PATTERNS.some((p) => p.test(f)))
    return { kind: 'full', reason: `full-run path changed: ${f}` };
  if (f.startsWith(INTEGRATION_DIR)) return { kind: 'integration' };
  if (NO_UNIT_PATTERNS.some((p) => p.test(f))) return { kind: 'skip' };
  const pkg = packagesDeepestFirst.find((p) => f.startsWith(p.dir + '/'));
  if (pkg) return { kind: 'package', name: pkg.name };
  if (SCRIPT_PATTERNS.some((p) => p.test(f))) return { kind: 'scripts' };
  if (f.startsWith(ROOT_TESTS_DIR)) return { kind: 'rootTests' };
  return { kind: 'full', reason: `unclassified path changed: ${f}` };
}

/** The changed packages plus everything that depends on them, transitively. */
function withDependents(packages, changedNames) {
  const dependents = new Map(packages.map((p) => [p.name, []]));
  for (const p of packages) for (const d of p.deps) dependents.get(d)?.push(p.name);
  const affected = new Set(changedNames);
  const queue = [...changedNames];
  while (queue.length) {
    for (const next of dependents.get(queue.pop()) ?? []) {
      if (!affected.has(next)) {
        affected.add(next);
        queue.push(next);
      }
    }
  }
  return affected;
}

/**
 * Sizes the matrix by the share of unit-test files selected, so a web-only
 * change gets ~9 shards and a one-package change gets 1 or 2.
 */
function shardCount(testFiles, testPaths) {
  const unitTests = testFiles.filter(
    (t) => TEST_FILE.test(t) && !NOT_UNIT_TEST_DIRS.some((p) => p.test(t))
  );
  const selected = unitTests.filter((t) => testPaths.some((d) => t.startsWith(d))).length;
  if (selected === 0) return { selected, shardTotal: 0 };
  const share = Math.ceil((FULL_SHARDS * selected) / Math.max(1, unitTests.length));
  return { selected, shardTotal: Math.min(FULL_SHARDS, Math.max(1, share)) };
}

/**
 * @param {string[]} changed  repo-relative paths, forward slashes
 * @param {{name: string, dir: string, deps: string[]}[]} packages  workspace packages (dir without trailing slash)
 * @param {string[]} testFiles  every tracked test file, used to size the shard matrix
 */
export function classify(changed, packages, testFiles) {
  const full = (reason) => ({
    mode: 'full',
    reason,
    packages: [],
    testPaths: [],
    unit: true,
    integration: true,
    web: true,
    shardTotal: FULL_SHARDS,
  });

  const files = changed.map((f) => f.trim()).filter(Boolean);
  if (files.length === 0) return full('empty diff (could not determine changes)');

  const deepestFirst = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  const directlyChanged = new Set();
  const seen = new Set();
  for (const f of files) {
    const c = classifyPath(f, deepestFirst);
    if (c.kind === 'full') return full(c.reason);
    if (c.kind === 'package') directlyChanged.add(c.name);
    seen.add(c.kind);
  }

  const affected = withDependents(packages, directlyChanged);
  const scripts = seen.has('scripts');
  const code = affected.size > 0 || scripts || seen.has('rootTests');
  if (!code && !seen.has('integration')) {
    return {
      mode: 'none',
      reason: 'no path a PR job tests changed (docs, e2e or property only)',
      packages: [],
      testPaths: [],
      unit: false,
      integration: false,
      web: false,
      shardTotal: 0,
    };
  }

  const pkgDirs = packages.filter((p) => affected.has(p.name)).map((p) => p.dir + '/');
  const testPaths = code
    ? [...pkgDirs, ROOT_TESTS_DIR, ...(scripts ? SCRIPT_TEST_DIRS : [])].sort(byText)
    : [];
  const { selected, shardTotal } = shardCount(testFiles, testPaths);

  return {
    mode: 'affected',
    reason: `${directlyChanged.size} changed package(s), ${affected.size} affected; ${selected} unit test file(s)`,
    packages: [...affected].sort(byText),
    testPaths,
    unit: shardTotal > 0,
    // The integration suite is one job and imports across every layer, so any
    // code change runs all of it.
    integration: true,
    web: affected.has('@intelliflow/web'),
    shardTotal,
  };
}

/** Workspace directories one `packages:` glob names (`dir` or `parent/*`). */
function expandWorkspaceGlob(root, glob) {
  if (!glob.endsWith('/*')) return [glob];
  const parent = glob.slice(0, -2);
  const abs = path.join(root, parent);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${parent}/${e.name}`);
}

function readPackage(root, dir) {
  const pj = path.join(root, dir, 'package.json');
  if (!fs.existsSync(pj)) return null;
  const json = JSON.parse(fs.readFileSync(pj, 'utf8'));
  if (!json.name) return null;
  const deps = Object.keys({
    ...json.dependencies,
    ...json.devDependencies,
    ...json.peerDependencies,
    ...json.optionalDependencies,
  });
  return { name: json.name, dir, deps };
}

export function readWorkspacePackages(root) {
  const yaml = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  // `packages:` list items only, e.g. `  - 'apps/*'`; comments are dropped.
  const globs = yaml
    .split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim().replaceAll("'", '').replaceAll('"', ''))
    .filter(Boolean);
  const pkgs = globs
    .flatMap((g) => expandWorkspaceGlob(root, g))
    .map((dir) => readPackage(root, dir))
    .filter(Boolean);
  const names = new Set(pkgs.map((p) => p.name));
  for (const p of pkgs) p.deps = p.deps.filter((d) => names.has(d));
  return pkgs;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

/**
 * The scope for one CI event. `diff(base, head)` returns the changed paths and
 * may throw; a failed diff is an empty diff, which classifies as full.
 */
export function resolveScope(args, packages, testFiles, diff, log = console) {
  if (args.event !== 'pull_request') {
    const result = classify([], packages, testFiles);
    result.reason = `event ${args.event || '(none)'} always runs the full suite`;
    return result;
  }
  let changed = [];
  try {
    changed = diff(args.base, args.head).filter(Boolean);
  } catch (e) {
    log.error(
      `::warning::git diff ${args.base} ${args.head} failed; running the full suite. ${e.message}`
    );
  }
  log.log(`Changed files (${changed.length}):\n${changed.join('\n')}`);
  return classify(changed, packages, testFiles);
}

/** `key=value` lines for $GITHUB_OUTPUT. */
export function outputLines(result) {
  const shards = Array.from({ length: result.shardTotal }, (_, i) => i + 1);
  const turboFilter = result.packages.map((p) => '--filter=' + p).join(' ');
  return [
    `mode=${result.mode}`,
    `reason=${result.reason}`,
    `unit=${result.unit}`,
    `integration=${result.integration}`,
    `web=${result.web}`,
    `code=${result.mode !== 'none'}`,
    `shard_total=${result.shardTotal}`,
    `shards=${JSON.stringify(shards)}`,
    `turbo_filter=${turboFilter}`,
    `test_paths=${result.testPaths.join(' ')}`,
  ];
}

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function stepSummary(result) {
  const affected = result.packages.length
    ? `Affected packages: ${result.packages.join(', ')}\n\n`
    : '';
  return `### CI scope: \`${result.mode}\`\n\n${result.reason}\n\n${affected}Unit shards: ${result.shardTotal}\n`;
}

function main() {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const result = resolveScope(
    parseArgs(process.argv.slice(2)),
    readWorkspacePackages(root),
    git(root, ['ls-files']).split('\n'),
    (base, head) => git(root, ['diff', '--name-only', base, head]).split('\n')
  );
  const lines = outputLines(result);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
