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
/** The web app judged file by file (see webDomain). */
const WEB_DIR = 'apps/web';
const WEB_CODE = /\.(tsx|ts|jsx|js|mjs|cjs|mts|cts)$/;
const CODE_EXTENSIONS = ['', '.mjs', '.js', '.ts', '.tsx', '.jsx', '.cjs', '.mts', '.cts'];
/** A module specifier: import/export from, import(), require(), vi/jest mocks. */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\b(?:vi|jest)\.(?:do)?mock\s*\(\s*)(["'`])([^"'`\n]+)\1/g;
/** An import() or require() whose argument is not one plain string literal. */
const COMPUTED_LOAD = /\b(?:import|require)\s*\(\s*(?!["'`][^"'`$\n]*["'`]\s*[,)])/;
/** Marks a dependency that cannot be followed. */
const UNKNOWN = '\0unknown';

/**
 * Web files that reach every page without being imported: Next.js config,
 * the proxy/middleware, instrumentation, global CSS and Tailwind/PostCSS
 * config, and ambient type declarations.
 */
const WEB_WIDE =
  /^apps\/web\/(next\.config\.[^/]+|(src\/)?instrumentation[^/]*|src\/(proxy|middleware)\.[^/]+|src\/app\/globals\.css|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|next-env\.d\.ts)$|^apps\/web\/.*\.d\.ts$/;
/** App Router files that wrap every route below their folder without an import. */
const ROUTE_WRAPPER =
  /^(apps\/web\/src\/app\/(?:.*\/)?)(?:layout|template|loading|error|not-found|default|global-error)\.(?:tsx|ts|jsx|js)$/;

/** The top-level directory of a root file, or '' for a file at the repo top. */
function rootBucket(file) {
  const i = file.indexOf('/');
  return i === -1 ? '' : file.slice(0, i);
}

/** `base` resolved to a file in the tree (extensions, then index files), or null. */
function resolveBase(base, tree) {
  for (const ext of CODE_EXTENSIONS) if (tree.has(base + ext)) return base + ext;
  for (const ext of CODE_EXTENSIONS.slice(1)) {
    if (tree.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  }
  return null;
}

/** A relative specifier from `from`, as a repo path (unresolved). */
function joinRelative(from, spec) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * What one file depends on inside its domain, resolved against the tree.
 * UNKNOWN is in the set when the text cannot be read, a specifier that should
 * resolve does not, or a load takes a computed or template path.
 * @param {string} file
 * @param {{code: Set<string>, tree: Set<string>, read: (f: string) => string | null,
 *          target: (from: string, spec: string) => string | null | false, mentions: boolean}} d
 *   target: the unresolved repo path a specifier points to, null when it leaves
 *   the domain (a package), false when it should resolve but cannot be placed.
 * @returns {Set<string>}
 */
export function fileDependencies(file, d) {
  const text = d.read(file);
  if (text === null) return new Set([UNKNOWN]);
  const out = new Set();
  for (const m of text.matchAll(SPECIFIER)) {
    const spec = m[2];
    if (m[1] === '`' && spec.includes('${')) {
      out.add(UNKNOWN);
      continue;
    }
    const base = d.target(file, spec);
    if (base === null) continue;
    out.add((base !== false && resolveBase(base, d.tree)) || UNKNOWN);
  }
  if (COMPUTED_LOAD.test(text)) out.add(UNKNOWN);
  if (d.mentions)
    for (const other of d.code) if (other !== file && text.includes(other)) out.add(other);
  return out;
}

/** Root code: relative imports, plus repo paths mentioned in the text. */
function rootDomain(tree, read) {
  return {
    name: 'root',
    tree,
    read,
    code: new Set([...tree].filter((f) => ROOT_CODE.test(f))),
    mentions: true,
    target: (from, spec) => (spec.startsWith('.') ? joinRelative(from, spec) : null),
    graph: null,
  };
}

/**
 * The web app: relative imports and the tsconfig `paths` aliases that point
 * inside it. An alias pointing at another package leaves the domain (the
 * package rule judges it). Null, so the package rule applies, when the app's
 * tsconfig cannot be read.
 */
function webDomain(tree, read) {
  let paths;
  try {
    paths = JSON.parse(read(`${WEB_DIR}/tsconfig.json`) ?? '').compilerOptions?.paths ?? {};
  } catch {
    return null;
  }
  const aliases = [];
  for (const [key, targets] of Object.entries(paths)) {
    if (!key.endsWith('/*') || !Array.isArray(targets) || targets.length !== 1) continue;
    const to = joinRelative(`${WEB_DIR}/tsconfig.json`, String(targets[0]).replace(/\*$/, ''));
    if (to === WEB_DIR || to.startsWith(`${WEB_DIR}/`)) aliases.push([key.slice(0, -1), to]);
  }
  return {
    name: 'web',
    tree,
    read,
    code: new Set([...tree].filter((f) => f.startsWith(`${WEB_DIR}/`) && WEB_CODE.test(f))),
    mentions: false,
    target: (from, spec) => {
      if (spec.startsWith('.')) return joinRelative(from, spec);
      const alias = aliases.find(([prefix]) => spec.startsWith(prefix));
      if (alias) return `${alias[1]}/${spec.slice(alias[0].length)}`.replace(/\/+/g, '/');
      return null;
    },
    graph: null,
  };
}

/** The import graph of every code file in a domain, built once per carry check. */
function domainGraph(d) {
  if (d.graph) return d.graph;
  const fwd = new Map();
  const rev = new Map();
  for (const file of d.code) {
    const deps = fileDependencies(file, d);
    fwd.set(file, deps);
    for (const dep of deps) {
      if (!rev.has(dep)) rev.set(dep, new Set());
      rev.get(dep).add(file);
    }
  }
  d.graph = { fwd, rev, importers: new Map(), unknownVia: new Map() };
  return d.graph;
}

/**
 * The first file reachable from `file` (itself included) that has a load which
 * cannot be followed, or null when every load from it resolves.
 */
function unknownVia(file, g) {
  if (g.unknownVia.has(file)) return g.unknownVia.get(file);
  const seen = new Set([file]);
  const queue = [file];
  let hit = null;
  while (queue.length && !hit) {
    const at = queue.shift();
    for (const dep of g.fwd.get(at) ?? []) {
      if (dep === UNKNOWN) {
        hit = at;
        break;
      }
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
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
 * Why main's file `m` and the PR's file `p` (same domain) may interact, or
 * null. They interact when one file imports both (each imports itself), or
 * when any file importing either of them reaches a load that cannot be
 * followed: that load may reach the other. Not covered: a file that imports
 * neither and reaches both only through computed loads.
 */
function graphConflict(m, p, d) {
  const g = domainGraph(d);
  const im = importersOf(m, g);
  const ip = importersOf(p, g);
  for (const x of im) {
    if (ip.has(x)) return x === m || x === p ? `${x} imports the other` : `${x} imports both`;
  }
  for (const x of [...im, ...ip]) {
    const via = unknownVia(x, g);
    if (via) return `${via} has an import that cannot be followed`;
  }
  return null;
}

/**
 * Why a main-side repo-root file blocks the carry, or null when it does not.
 * Root code blocks when it and a PR root code file may interact; any other
 * root file blocks when the PR changes a file in its top-level directory, and
 * so does root code beside a PR root file that is not code.
 */
function rootBlock(file, prRoot, d) {
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
    const why = graphConflict(file, p, d);
    if (why) return `${why} (with ${p}, which the PR changes)`;
  }
  return null;
}

/**
 * Why a main-side web file blocks the carry, or null, when the PR's only link
 * to the web app is its own web files. App-wide files, route wrappers over the
 * other file's folder, and files the graph cannot trace (non-code files no code
 * imports) block; code files block when they may interact (graphConflict).
 */
function webBlock(file, prWeb, d) {
  const g = domainGraph(d);
  const untraced = (f) => !WEB_CODE.test(f) && !g.rev.has(f);
  for (const p of prWeb) {
    for (const f of [file, p]) {
      if (WEB_WIDE.test(f)) return `${f} reaches every page (with ${p}, which the PR changes)`;
      if (untraced(f)) return `cannot trace what loads ${f} (with ${p}, which the PR changes)`;
    }
    for (const [a, b] of [
      [file, p],
      [p, file],
    ]) {
      const wrap = ROUTE_WRAPPER.exec(a);
      if (wrap && b.startsWith(wrap[1])) return `${a} wraps ${b}'s route`;
    }
    const why = graphConflict(file, p, d);
    if (why) return `${why} (with ${p}, which the PR changes)`;
  }
  return null;
}

/** The files a carry check reads: root code and web code. */
export function filesToRead(paths) {
  return paths.filter(
    (p) =>
      ROOT_CODE.test(p) ||
      (p.startsWith(`${WEB_DIR}/`) && (WEB_CODE.test(p) || p === `${WEB_DIR}/tsconfig.json`))
  );
}

/**
 * Main-side files that block carrying the attestation, each with its reason.
 *
 * Without `root`, every repo-root file is one bucket (a root change on main
 * blocks any PR that touches the root) and the web app is one package. With
 * `root` (every file in the tree and a reader for their text at the head being
 * attested), root code and the web app are judged by their import graphs: a
 * main-side web file is judged file by file when the PR reaches the web app
 * only through its own web files (a PR change to a package the app depends on,
 * or that depends on it, still blocks the whole app).
 * @param {{prFiles: string[], mainFiles: string[], graph: ReturnType<typeof workspaceGraph>,
 *          root?: {files: string[], read: (file: string) => string | null}}} input
 * @returns {Array<{file: string, why: string}>}
 */
export function carryBlockers({ prFiles, mainFiles, graph, root }) {
  const pr = prFiles.map((f) => f.replace(/\\/g, '/'));
  const scope = affectedPackages(pr, graph);
  const prRoot = pr.filter((f) => packageOf(f, graph.dirs) === ROOT);
  const tree = root && new Set(root.files.map((f) => f.replace(/\\/g, '/')));
  const rootCtx = root && rootDomain(tree, root.read);
  const webName = graph.dirs.get(WEB_DIR);
  const prWeb = pr.filter((f) => webName && packageOf(f, graph.dirs) === webName);
  const webOnlyByItsFiles =
    prWeb.length > 0 &&
    !affectedPackages(
      pr.filter((f) => !prWeb.includes(f)),
      graph
    ).has(webName);
  const webCtx = root && webOnlyByItsFiles ? webDomain(tree, root.read) : null;
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
    if (pkg === webName && webCtx) {
      const why = webBlock(file, prWeb, webCtx);
      if (why) blockers.push({ file, why });
      continue;
    }
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
