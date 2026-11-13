/**
 * May an attestation be carried to a rebased head? Only if main brought in
 * nothing, since the attested base, that could change how this PR's code behaves.
 *
 * A clean rebase leaves the PR's own diff byte-identical (the patch-id check in
 * preship-attest.mjs), but a clean rebase is not proof of compatibility: main
 * may have changed something the PR's code depends on. So, besides the same
 * diff, the carry requires that none of main's intervening changes touch the
 * PR's affected scope:
 *
 *   - a global-impact file (lockfile, any package.json, tsconfig, vitest/vite
 *     config, test setup, __mocks__, Prisma schema): it can change any test;
 *   - a file in a workspace package the PR touches;
 *   - a file in a package those depend on, directly or transitively (main
 *     changed a library the PR's code imports);
 *   - a file in a package that depends on them (the PR's change reaches it,
 *     and main changed it too);
 *   - a repo-root file (outside every package) that the PR's root files are
 *     connected to: root code under scripts/ or tools/ blocks when it depends
 *     on a PR root file or a PR root file depends on it, transitively, through
 *     relative imports, re-exports, requires, dynamic imports or a literal
 *     mention of its repo path (pre-ship spawns scripts by path); any other
 *     root file (workflows, hooks, config, data) blocks when the PR changes a
 *     file in the same top-level directory. A file whose text cannot be read
 *     blocks. (Before 2026-11-13 all root files were one bucket, so any
 *     scripts/ change on main voided every open PR that touched scripts/.)
 *
 * Docs, artifacts and other non-source files on main's side are ignored. If
 * anything blocks, verify refuses and the PR needs a pre-ship run (related
 * scope) on the rebased head. Package granularity is coarser than a per-file
 * import graph, so it errs towards refusing, never towards carrying.
 */

import { GLOBAL_IMPACT_PATTERNS } from './preship-test-scope.mjs';

/** Root bucket for files outside every workspace package. */
export const ROOT = '<root>';

/** Main-side changes that cannot affect a test (docs, reports, metrics). */
const INERT = [
  /\.md$/,
  /^docs\//,
  /^artifacts\//,
  /^\.specify\//,
  /^apps\/project-tracker\/docs\//,
];

/**
 * Workspace packages from their package.json texts.
 * @param {Array<{path: string, json: string}>} manifests repo-relative package.json paths
 * @returns {{dirs: Map<string, string>, deps: Map<string, Set<string>>}} dir -> name, name -> workspace deps
 */
export function workspaceGraph(manifests) {
  const dirs = new Map();
  const parsed = [];
  for (const { path, json } of manifests) {
    const dir = path.replace(/\\/g, '/').replace(/\/?package\.json$/, '');
    if (!dir) continue; // the root manifest is not a workspace package
    let pkg;
    try {
      pkg = JSON.parse(json);
    } catch {
      continue;
    }
    if (typeof pkg.name !== 'string') continue;
    dirs.set(dir, pkg.name);
    parsed.push(pkg);
  }
  const names = new Set(dirs.values());
  const deps = new Map();
  for (const pkg of parsed) {
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    deps.set(pkg.name, new Set(Object.keys(all).filter((d) => names.has(d))));
  }
  return { dirs, deps };
}

/** The workspace package a file belongs to (deepest match), or ROOT. */
export function packageOf(file, dirs) {
  const f = file.replace(/\\/g, '/');
  let best = null;
  for (const [dir, name] of dirs) {
    if ((f === dir || f.startsWith(`${dir}/`)) && (!best || dir.length > best.dir.length)) {
      best = { dir, name };
    }
  }
  return best ? best.name : ROOT;
}

/** Packages reachable from `start` through `edges` (start included). */
function reach(start, edges) {
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    for (const next of edges.get(queue.pop()) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * The PR's affected scope: its packages, what they depend on, and what depends
 * on them (each transitively).
 */
export function affectedPackages(prFiles, graph) {
  const touched = new Set(prFiles.map((f) => packageOf(f, graph.dirs)));
  const dependents = new Map();
  for (const [name, ds] of graph.deps) {
    for (const d of ds) {
      if (!dependents.has(d)) dependents.set(d, new Set());
      dependents.get(d).add(name);
    }
  }
  return new Set([...reach(touched, graph.deps), ...reach(touched, dependents)]);
}

/**
 * Repo-root code whose dependencies are read from its source. Everything else at
 * the root (workflows, hooks, config, data) is judged by directory instead.
 */
const ROOT_CODE = /^(scripts|tools)\/.+\.(mjs|cjs|js|ts|mts|cts)$/;
const CODE_EXTENSIONS = ['', '.mjs', '.js', '.ts', '.cjs', '.mts', '.cts'];
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'`])(\.{1,2}\/[^"'`\n]+)\1/g;

/** The top-level directory of a root file, or '' for a file at the repo top. */
function rootBucket(file) {
  const i = file.indexOf('/');
  return i === -1 ? '' : file.slice(0, i);
}

/** Resolve a relative specifier from `from` against the known root code files. */
function resolveSpecifier(from, spec, known) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  for (const ext of CODE_EXTENSIONS) if (known.has(base + ext)) return base + ext;
  for (const ext of CODE_EXTENSIONS.slice(1)) {
    if (known.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  }
  return null;
}

/**
 * The root code files `file` depends on: relative imports, re-exports, dynamic
 * imports and requires, plus any other root code file whose repo path appears
 * in its text (pre-ship spawns scripts by path). Null when the text is unknown.
 * @param {string} file
 * @param {Set<string>} known every root code file in the tree
 * @param {(file: string) => string | null} read
 * @returns {Set<string> | null}
 */
export function rootDependencies(file, known, read) {
  const text = read(file);
  if (text === null) return null;
  const out = new Set();
  for (const m of text.matchAll(SPECIFIER)) {
    const hit = resolveSpecifier(file, m[2], known);
    if (hit) out.add(hit);
  }
  for (const other of known) if (other !== file && text.includes(other)) out.add(other);
  return out;
}

/**
 * Root code files reachable from `start` (start included), or null when a file
 * on the way cannot be read: an unknown edge must refuse, not carry.
 */
function rootClosure(start, known, read, memo) {
  if (memo.has(start)) return memo.get(start);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const deps = rootDependencies(queue.pop(), known, read);
    if (deps === null) {
      memo.set(start, null);
      return null;
    }
    for (const d of deps) {
      if (!seen.has(d)) {
        seen.add(d);
        queue.push(d);
      }
    }
  }
  memo.set(start, seen);
  return seen;
}

/**
 * Why a main-side repo-root file blocks the carry, or null when it does not.
 * Root code blocks when it and a PR root file depend on each other in either
 * direction; any other root file blocks when the PR touches its directory.
 */
function rootBlock(file, prRoot, root) {
  const shared = prRoot.find((p) => rootBucket(p) === rootBucket(file));
  if (!ROOT_CODE.test(file)) {
    return shared
      ? `repo-root file in ${rootBucket(file) || 'the repo top'}/, which the PR also changes`
      : null;
  }
  const memo = root.memo;
  const mainReach = rootClosure(file, root.known, root.read, memo);
  if (mainReach === null) return `cannot read ${file}'s dependencies`;
  for (const p of prRoot) {
    if (!ROOT_CODE.test(p)) {
      if (rootBucket(p) === rootBucket(file)) return `in ${rootBucket(file)}/, beside ${p}`;
      continue;
    }
    if (mainReach.has(p)) return `depends on ${p}, which the PR changes`;
    const prReach = rootClosure(p, root.known, root.read, memo);
    if (prReach === null) return `cannot read ${p}'s dependencies`;
    if (prReach.has(file)) return `${p}, which the PR changes, depends on it`;
  }
  return null;
}

/**
 * Main-side files that block carrying the attestation, each with its reason.
 *
 * Without `root`, every repo-root file is one bucket: a root change on main
 * blocks any PR that touches the root. With `root` (the tree's root code files
 * and a reader for their text at the head being attested), root files are
 * judged by their real dependencies instead.
 * @param {{prFiles: string[], mainFiles: string[], graph: ReturnType<typeof workspaceGraph>,
 *          root?: {files: string[], read: (file: string) => string | null}}} input
 * @returns {Array<{file: string, why: string}>}
 */
export function carryBlockers({ prFiles, mainFiles, graph, root }) {
  const scope = affectedPackages(prFiles, graph);
  const prRoot = prFiles
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => packageOf(f, graph.dirs) === ROOT);
  const rootCtx = root && {
    known: new Set(root.files.map((f) => f.replace(/\\/g, '/')).filter((f) => ROOT_CODE.test(f))),
    read: root.read,
    memo: new Map(),
  };
  const blockers = [];
  for (const raw of mainFiles) {
    const file = raw.replace(/\\/g, '/');
    if (GLOBAL_IMPACT_PATTERNS.some((re) => re.test(file))) {
      blockers.push({ file, why: 'global-impact file' });
      continue;
    }
    if (INERT.some((re) => re.test(file))) continue;
    const pkg = packageOf(file, graph.dirs);
    if (!scope.has(pkg)) continue;
    if (pkg !== ROOT) {
      blockers.push({ file, why: `in ${pkg}, within the PR's affected scope` });
      continue;
    }
    if (!rootCtx) {
      blockers.push({ file, why: 'repo-root file, and the PR touches the root too' });
      continue;
    }
    const why = rootBlock(file, prRoot, rootCtx);
    if (why) blockers.push({ file, why });
  }
  return blockers;
}
