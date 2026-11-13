/**
 * Which vitest projects a package-local config change can affect.
 *
 * A change to a vitest config, a test setup file, a `__mocks__` stub, a
 * tsconfig or a package.json is invisible to `vitest related` (no test imports
 * it), so pre-ship used to run the whole 10k+ suite for it: 20 of the 38 full
 * local runs in the week to 2026-11-13, at a 35.6-minute median against 16.7
 * for a related run. When the file sits inside one vitest project's directory,
 * it can only reach:
 *
 *   - that project;
 *   - any other project whose config names the file (the repo's root config
 *     loads apps/api/src/test/setup.ts for its `root` project, so that one
 *     reaches `api` and the root config's inline projects);
 *   - for a package.json, the projects of every workspace package that depends
 *     on it, transitively (its exports or entry points may change what they load).
 *
 * Those projects run in full; everything else stays at the related scope. A
 * file outside every project directory (root config, the lockfile, a root
 * tsconfig) and the Prisma schema stay global: they still mean the full suite.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Inside a project directory: the config-like files a project's tests see. */
const LOCAL_CONFIG =
  /^(?:vitest\.config\.[^/]+|vite\.config\.[^/]+|vitest\.setup\.[^/]+|(?:.*\/)?setup\.(?:ts|tsx|js|jsx|mjs)|(?:.*\/)?__mocks__\/.+|tsconfig[^/]*\.json|package\.json)$/;

/**
 * @typedef {{name: string, dir: string, config: string, text: string}} Project
 * @typedef {{projects: Project[], rootConfig: string, rootText: string, rootInline: string[],
 *            packages: Map<string, {name: string, deps: string[]}>}} ProjectMap
 *   packages: project dir -> its package name and workspace dependency names
 */

/** The project whose directory holds `file` (deepest), or null. */
export function projectOf(file, map) {
  let best = null;
  for (const p of map.projects) {
    if (file.startsWith(`${p.dir}/`) && (!best || p.dir.length > best.dir.length)) best = p;
  }
  return best;
}

/** Project names of every workspace package that depends on `dir`, transitively. */
function dependentProjects(dir, map) {
  const nameToDir = new Map([...map.packages].map(([d, pkg]) => [pkg.name, d]));
  const start = map.packages.get(dir)?.name;
  if (!start) return [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const at = queue.pop();
    for (const pkg of map.packages.values()) {
      if (pkg.deps.includes(at) && !seen.has(pkg.name)) {
        seen.add(pkg.name);
        queue.push(pkg.name);
      }
    }
  }
  seen.delete(start);
  return [...seen]
    .map((name) => map.projects.find((p) => p.dir === nameToDir.get(name))?.name)
    .filter(Boolean);
}

/** Array keys whose plain string entries name files without loading them. */
const INERT_LIST_KEYS = new Set(['exclude', 'projects']);

/** A line that is one quoted string and an optional comma, nothing else. */
function isPlainStringEntry(line) {
  const t = line.trim().replace(/,$/, '');
  const q = t[0];
  return (q === "'" || q === '"' || q === '`') && t.length > 1 && t.indexOf(q, 1) === t.length - 1;
}

/**
 * A config text without the plain string entries of its `exclude: [...]` and
 * `projects: [...]` arrays (one entry per line): a coverage exclusion or the
 * root config's project list names a file but loads nothing from it. Every
 * other mention (setupFiles, aliases, imports, same-line arrays) is kept, so
 * the scope errs wide.
 */
export function withoutInertLists(text) {
  const stack = [];
  const out = [];
  for (const line of text.split('\n')) {
    const open = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\[\s*(\/\/.*)?$/.exec(line);
    if (open) {
      stack.push(open[1]);
      out.push(line);
      continue;
    }
    const inert = stack.length > 0 && INERT_LIST_KEYS.has(stack.at(-1));
    if (inert && isPlainStringEntry(line)) continue;
    if (/^\s*\]/.test(line) && stack.length > 0) stack.pop();
    out.push(line);
  }
  return out.join('\n');
}

/**
 * The vitest projects a changed file can affect, or null when it is not local
 * to a project and so can affect any test.
 * @param {string} file repo-relative, forward slashes
 * @param {ProjectMap} map
 * @returns {string[] | null}
 */
export function localImpact(file, map) {
  if (/\.prisma$/.test(file)) return null;
  const own = projectOf(file, map);
  if (!own) return null;
  const rel = file.slice(own.dir.length + 1);
  if (!LOCAL_CONFIG.test(rel)) return null;
  const names = new Set([own.name]);
  const tail = `${own.dir.split('/').pop()}/${rel}`.replace(/\.[^./]+$/, '');
  for (const p of map.projects) {
    if (p !== own && withoutInertLists(p.text).includes(tail)) names.add(p.name);
  }
  const root = withoutInertLists(map.rootText);
  if (root.includes(file) || root.includes(tail)) {
    for (const n of map.rootInline) names.add(n);
  }
  if (rel === 'package.json') for (const n of dependentProjects(own.dir, map)) names.add(n);
  return [...names].sort();
}

/**
 * The project map of a checkout, read from the root vitest config's `projects`
 * list. Null when it cannot be read, so the caller keeps the global rule.
 * @param {string} cwd
 * @param {(p: string) => string} [read]
 * @returns {ProjectMap | null}
 */
export function loadProjectMap(cwd, read = (p) => fs.readFileSync(path.join(cwd, p), 'utf8')) {
  const rootConfig = 'vitest.config.ts';
  let rootText;
  try {
    rootText = read(rootConfig);
  } catch {
    return null;
  }
  const projects = [];
  for (const m of rootText.matchAll(/['"]([^'"]+)\/vitest\.config\.[cm]?[jt]s['"]/g)) {
    const config = m[0].slice(1, -1);
    if (projects.some((p) => p.config === config)) continue;
    let text;
    try {
      text = read(config);
    } catch {
      return null;
    }
    const name = /\bname:\s*['"]([^'"]+)['"]/.exec(text)?.[1];
    if (!name) return null;
    projects.push({ name, dir: m[1], config, text });
  }
  if (projects.length === 0) return null;
  const rootInline = [...rootText.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const packages = new Map();
  for (const p of projects) {
    try {
      const pkg = JSON.parse(read(`${p.dir}/package.json`));
      const deps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      });
      packages.set(p.dir, { name: pkg.name, deps });
    } catch {
      // A project without a package.json (tests/architecture) has no dependents.
    }
  }
  return { projects, rootConfig, rootText, rootInline, packages };
}

/** Every vitest project name in the map: the listed configs and the root's inline ones. */
export function projectNames(map) {
  return [...new Set([...map.projects.map((p) => p.name), ...map.rootInline])].sort();
}

/**
 * The vitest argument lists the unit-tests step runs for a scope (integration
 * excluded throughout; it has its own step). A related scope with `projects`
 * runs those projects in full, then the related tests in every other project.
 * Vitest ORs repeated --project flags, so the other projects are named one by
 * one rather than negated.
 * @param {{scope: string, files: string[], projects?: string[]}} scope
 * @param {string[]} allProjects
 * @returns {string[][]}
 */
export function unitTestRuns(scope, allProjects) {
  if (scope.scope === 'none') return [];
  if (scope.scope !== 'related') return [['run', '--project=!integration']];
  const full = (scope.projects ?? []).filter((p) => p !== 'integration');
  if (full.length === 0) {
    return [['related', '--run', '--passWithNoTests', '--project=!integration', ...scope.files]];
  }
  const runs = [['run', ...full.map((p) => `--project=${p}`)]];
  const others = allProjects.filter((p) => p !== 'integration' && !full.includes(p));
  if (scope.files.length > 0 && others.length > 0) {
    runs.push([
      'related',
      '--run',
      '--passWithNoTests',
      ...others.map((p) => `--project=${p}`),
      ...scope.files,
    ]);
  }
  return runs;
}

/** A JSON array of project names from an env var; empty when absent or malformed. */
export function parseProjectList(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}
