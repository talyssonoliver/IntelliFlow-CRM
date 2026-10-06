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
 *   - a repo-root file (outside every package) when the PR also touches one.
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
 * Main-side files that block carrying the attestation, each with its reason.
 * @param {{prFiles: string[], mainFiles: string[], graph: ReturnType<typeof workspaceGraph>}} input
 * @returns {Array<{file: string, why: string}>}
 */
export function carryBlockers({ prFiles, mainFiles, graph }) {
  const scope = affectedPackages(prFiles, graph);
  const blockers = [];
  for (const raw of mainFiles) {
    const file = raw.replace(/\\/g, '/');
    if (GLOBAL_IMPACT_PATTERNS.some((re) => re.test(file))) {
      blockers.push({ file, why: 'global-impact file' });
      continue;
    }
    if (INERT.some((re) => re.test(file))) continue;
    const pkg = packageOf(file, graph.dirs);
    if (scope.has(pkg)) {
      blockers.push({
        file,
        why:
          pkg === ROOT
            ? 'repo-root file, and the PR touches the root too'
            : `in ${pkg}, within the PR's affected scope`,
      });
    }
  }
  return blockers;
}
