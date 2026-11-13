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
 *   - a repo-root file (outside every package) that may interact with a root
 *     file the PR changes. Root code under scripts/ or tools/ is judged on its
 *     import graph (relative imports, re-exports, requires, dynamic imports,
 *     vi/jest mocks, and a literal mention of a script's repo path, since
 *     pre-ship spawns scripts by path): it blocks when some file imports both
 *     it and the PR's file, transitively (each file imports itself), or when a
 *     file importing either of them reaches a load that cannot be followed (an
 *     unreadable file, an unresolved relative path, a computed path). Any other
 *     root file (workflows, hooks, config, data) blocks when the PR changes a
 *     file in the same top-level directory. Not covered: a file that imports
 *     neither and reaches both only through computed loads. (Before 2026-11-13
 *     all root files were one bucket, so any scripts/ change on main voided
 *     every open PR that touched scripts/.)
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
/** A module specifier: import/export from, import(), require(), vi/jest mocks. */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\b(?:vi|jest)\.(?:do)?mock\s*\(\s*)(["'`])([^"'`\n]+)\1/g;
/** An import() or require() whose argument is not one plain string literal. */
const COMPUTED_LOAD = /\b(?:import|require)\s*\(\s*(?!["'`][^"'`$\n]*["'`]\s*[,)])/;
/** Marks a dependency that cannot be followed. */
const UNKNOWN = '\0unknown';

/** The top-level directory of a root file, or '' for a file at the repo top. */
function rootBucket(file) {
  const i = file.indexOf('/');
  return i === -1 ? '' : file.slice(0, i);
}

/** Resolve a relative specifier from `from` against the tree's files, or null. */
function resolveSpecifier(from, spec, tree) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  const base = parts.join('/');
  for (const ext of CODE_EXTENSIONS) if (tree.has(base + ext)) return base + ext;
  for (const ext of CODE_EXTENSIONS.slice(1)) {
    if (tree.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  }
  return null;
}

/**
 * What a root code file depends on: relative imports, re-exports, requires,
 * dynamic imports and test mocks, resolved against the tree, plus any other root
 * code file whose repo path appears in its text (pre-ship spawns scripts by
 * path). UNKNOWN is in the set when the text cannot be read, a relative
 * specifier does not resolve, or a load takes a computed path.
 * @param {string} file
 * @param {Set<string>} code every root code file in the tree
 * @param {Set<string>} tree every file in the tree
 * @param {(file: string) => string | null} read
 * @returns {Set<string>}
 */
export function rootDependencies(file, code, tree, read) {
  const text = read(file);
  if (text === null) return new Set([UNKNOWN]);
  const out = new Set();
  for (const m of text.matchAll(SPECIFIER)) {
    const spec = m[2];
    if (m[1] === '`' && spec.includes('${')) {
      out.add(UNKNOWN);
      continue;
    }
    if (!spec.startsWith('.')) continue; // a package: the package rule's job
    out.add(resolveSpecifier(file, spec, tree) ?? UNKNOWN);
  }
  if (COMPUTED_LOAD.test(text)) out.add(UNKNOWN);
  for (const other of code) if (other !== file && text.includes(other)) out.add(other);
  return out;
}

/** The import graph of every root code file, built once per carry check. */
function rootGraph(root) {
  if (root.graph) return root.graph;
  const fwd = new Map();
  const rev = new Map();
  for (const file of root.code) {
    const deps = rootDependencies(file, root.code, root.tree, root.read);
    fwd.set(file, deps);
    for (const d of deps) {
      if (!rev.has(d)) rev.set(d, new Set());
      rev.get(d).add(file);
    }
  }
  root.graph = { fwd, rev, importers: new Map() };
  return root.graph;
}

/**
 * The first file reachable from `file` (itself included) that has a load which
 * cannot be followed, or null when every load from it resolves.
 */
function unknownVia(file, g) {
  g.unknownVia ??= new Map();
  if (g.unknownVia.has(file)) return g.unknownVia.get(file);
  const seen = new Set([file]);
  const queue = [file];
  let hit = null;
  while (queue.length && !hit) {
    const at = queue.shift();
    for (const d of g.fwd.get(at) ?? []) {
      if (d === UNKNOWN) {
        hit = at;
        break;
      }
      if (!seen.has(d)) {
        seen.add(d);
        queue.push(d);
      }
    }
  }
  g.unknownVia.set(file, hit);
  return hit;
}

/** Every file that imports `file`, transitively, `file` included. */
function importersOf(file, g) {
  if (g.importers.has(file)) return g.importers.get(file);
  const seen = new Set([file]);
  const queue = [file];
  while (queue.length) {
    for (const p of g.rev.get(queue.pop()) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  g.importers.set(file, seen);
  return seen;
}

/**
 * Why main's root code file `m` and the PR's root code file `p` may interact,
 * or null. They interact when one file imports both (each imports itself), or
 * when any file importing either of them has a load that cannot be followed:
 * that load may reach the other. Not covered: a file that imports neither and
 * reaches both only through computed loads.
 */
function rootConflict(m, p, root) {
  const g = rootGraph(root);
  const im = importersOf(m, g);
  const ip = importersOf(p, g);
  for (const x of im)
    if (ip.has(x)) return x === m || x === p ? `${x} imports the other` : `${x} imports both`;
  for (const x of [...im, ...ip]) {
    const via = unknownVia(x, g);
    if (via) return `${via} has an import that cannot be followed`;
  }
  return null;
}

/**
 * Why a main-side repo-root file blocks the carry, or null when it does not.
 * Root code blocks when it and a PR root code file may interact (rootConflict);
 * any other root file blocks when the PR changes a file in its top-level
 * directory, and so does root code beside a PR root file that is not code.
 */
function rootBlock(file, prRoot, root) {
  if (!ROOT_CODE.test(file)) {
    return prRoot.some((p) => rootBucket(p) === rootBucket(file))
      ? `repo-root file in ${rootBucket(file) || 'the repo top'}/, which the PR also changes`
      : null;
  }
  for (const p of prRoot) {
    if (!ROOT_CODE.test(p)) {
      if (rootBucket(p) === rootBucket(file)) return `in ${rootBucket(file)}/, beside ${p}`;
      continue;
    }
    const why = rootConflict(file, p, root);
    if (why) return `${why} (with ${p}, which the PR changes)`;
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
  const rootTree = root && new Set(root.files.map((f) => f.replace(/\\/g, '/')));
  const rootCtx = root && {
    tree: rootTree,
    code: new Set([...rootTree].filter((f) => ROOT_CODE.test(f))),
    read: root.read,
    graph: null,
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
