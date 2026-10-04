#!/usr/bin/env node
/**
 * Verify, inside a built image, that every internal workspace package the API
 * imports at runtime is present and built.
 *
 * Why: the API image once shipped without `@intelliflow/partner-sdk`'s build
 * output (#742 / #743). The build step for it was missing from a hand-kept list
 * in Dockerfile.api, and nothing noticed until the container failed to boot in
 * CI. This check runs in the runner stage, so it sees the image exactly as it
 * will run.
 *
 * How: collect every `@intelliflow/*` specifier (package AND subpath, e.g.
 * `@intelliflow/validators/required-url`) imported by the entry directory's .js
 * files, resolve each through the importing package's node_modules (the pnpm
 * workspace symlinks), and require that every runtime file its export entry
 * declares exists — the root entry (main / module / exports['.']) for a bare
 * import, the matching `exports` key or pattern for a subpath. Then repeat for
 * the resolved files' own imports, transitively. Nothing is executed.
 *
 * Usage:  node verify-workspace-runtime.mjs <app-dir> <dist-dir>
 *   e.g.  node verify-workspace-runtime.mjs apps/api apps/api/dist
 * Exit:   0 all resolved · 1 something missing · 2 usage error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// import x from '@intelliflow/a' · import '@intelliflow/a/register' (side effect,
// also minified `import"…"`) · import('@intelliflow/a/sub') · require(...) ·
// export … from. Captures the subpath too: a subpath import resolves through its
// own export entry, which can be missing while the root entry exists.
const SPECIFIER =
  /\b(?:from|import|require)\s*(?:\(\s*)?["'](@intelliflow\/[a-z0-9._-]+)(?:\/([^"']+))?["']/g;

/** Every @intelliflow specifier imported by a source, as {name, subpath} ('' = root). */
// Block comments are removed first: they can sit inside a real import
// (`import(/* webpackIgnore: true */ '@intelliflow/x')`) or hold a commented-out
// one that must not fail the build.
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

export function importedWorkspaceSpecifiers(source) {
  const out = new Map();
  for (const m of source.replace(BLOCK_COMMENT, ' ').matchAll(SPECIFIER)) {
    const spec = { name: m[1], subpath: m[2] ?? '' };
    out.set(`${spec.name}|${spec.subpath}`, spec);
  }
  return [...out.values()];
}

/** Every @intelliflow package name imported by a source (subpaths folded). */
export function importedWorkspacePackages(source) {
  return new Set(importedWorkspaceSpecifiers(source).map((s) => s.name));
}

const isTypesOnly = (f) => /\.d\.[cm]?ts$/.test(f);

// Export conditions Node can select at runtime in this image. Others (types,
// browser, development, react-native, source, …) are never loaded by `node`, so
// a target behind them need not ship and must not fail the build.
const RUNTIME_CONDITIONS = new Set([
  'import',
  'require',
  'node',
  'node-addons',
  'module',
  'default',
]);

function collectTargets(node, star, out) {
  if (typeof node === 'string') out.add(star === undefined ? node : node.replaceAll('*', star));
  else if (Array.isArray(node)) for (const n of node) collectTargets(n, star, out);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (RUNTIME_CONDITIONS.has(k)) collectTargets(v, star, out);
    }
  }
}

/** All entry targets a package.json declares for its root export. */
export function declaredEntries(pkg) {
  const out = new Set();
  if (pkg.exports !== undefined) {
    const root =
      typeof pkg.exports === 'string' || Array.isArray(pkg.exports) || !('.' in pkg.exports)
        ? pkg.exports
        : pkg.exports['.'];
    collectTargets(root, undefined, out);
  }
  if (pkg.main) out.add(pkg.main);
  if (pkg.module) out.add(pkg.module);
  // Type declarations are not loaded at runtime.
  return [...out].filter((f) => !isTypesOnly(f));
}

/**
 * Runtime targets the `exports` map declares for `./<subpath>`, including
 * `./*`-style patterns (longest pattern wins, as in Node's resolver).
 * `null` = no exports map (Node then resolves the subpath as a file);
 * `[]`   = the subpath is not exported at all.
 */
export function subpathTargets(pkg, subpath) {
  const exp = pkg.exports;
  if (exp === undefined || exp === null) return null;
  const conditionsOnly =
    typeof exp === 'string' ||
    Array.isArray(exp) ||
    !Object.keys(exp).some((k) => k.startsWith('.'));
  if (conditionsOnly) return [];
  const key = `./${subpath}`;
  const out = new Set();
  if (key in exp) {
    collectTargets(exp[key], undefined, out);
  } else {
    const patterns = Object.keys(exp)
      .filter((k) => k.includes('*'))
      .sort((a, b) => b.length - a.length);
    for (const k of patterns) {
      const [pre, post] = k.split('*');
      if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) {
        collectTargets(exp[k], key.slice(pre.length, key.length - post.length), out);
        break;
      }
    }
  }
  return [...out].filter((f) => !isTypesOnly(f));
}

/** Without an exports map Node resolves `pkg/sub` as a file: try what it would. */
function legacySubpathTarget(pkgDir, subpath) {
  const candidates = [
    subpath,
    `${subpath}.js`,
    `${subpath}.cjs`,
    `${subpath}.mjs`,
    `${subpath}/index.js`,
  ];
  return (
    candidates.find((c) => {
      const p = path.join(pkgDir, c);
      return fs.existsSync(p) && fs.statSync(p).isFile();
    }) ?? null
  );
}

function listJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') out.push(...listJsFiles(p));
    } else if (/\.(c|m)?[jt]s$/.test(e.name) && !/\.d\.(c|m)?ts$/.test(e.name)) {
      // .ts too: the API runs under tsx, and some runtime entries (the
      // Prisma-generated client) are TypeScript, so their imports must be
      // followed. Type declarations never load at runtime.
      out.push(p);
    }
  }
  return out;
}

function specifiersOfFiles(files) {
  const out = new Map();
  for (const f of files) {
    for (const s of importedWorkspaceSpecifiers(fs.readFileSync(f, 'utf8'))) {
      out.set(`${s.name}|${s.subpath}`, s);
    }
  }
  return [...out.values()];
}

/** Runtime entry files for one specifier, or a problem string. */
function entriesFor(pkg, pkgDir, subpath, label, importer) {
  if (!subpath) {
    const entries = declaredEntries(pkg);
    return entries.length > 0
      ? { entries }
      : { problem: `${label}: package.json declares no runtime entry (main/module/exports)` };
  }
  const declared = subpathTargets(pkg, subpath);
  if (declared === null) {
    const found = legacySubpathTarget(pkgDir, subpath);
    return found
      ? { entries: [found] }
      : { problem: `${label}: no file for this subpath — was it built?` };
  }
  return declared.length > 0
    ? { entries: declared }
    : {
        problem: `${label}: subpath is not in the package's exports map (imported by ${importer})`,
      };
}

/**
 * @returns {{checked: string[], problems: string[]}} checked = specifiers that
 * resolved to existing build output (`@scope/pkg` or `@scope/pkg/subpath`).
 */
export function verify(appDir, distDir) {
  const problems = [];
  const checked = [];
  const seen = new Set(); // `${pkgDir}|${subpath}`
  const scannedDirs = new Set();
  // queue of [specifier, directory whose node_modules resolves it, importer label]
  const queue = specifiersOfFiles(listJsFiles(distDir)).map((s) => [s, appDir, distDir]);

  while (queue.length > 0) {
    const [{ name, subpath }, fromDir, importer] = queue.shift();
    const label = subpath ? `${name}/${subpath}` : name;
    let pkgDir;
    try {
      pkgDir = fs.realpathSync(path.join(fromDir, 'node_modules', name));
    } catch {
      problems.push(`${label}: not resolvable from ${fromDir} (imported by ${importer})`);
      continue;
    }
    if (seen.has(`${pkgDir}|${subpath}`)) continue;
    seen.add(`${pkgDir}|${subpath}`);

    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      problems.push(`${label}: ${pkgDir} has no package.json`);
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const { entries, problem } = entriesFor(pkg, pkgDir, subpath, label, importer);
    if (problem) {
      problems.push(problem);
      continue;
    }
    const missing = entries.filter((e) => !fs.existsSync(path.join(pkgDir, e)));
    if (missing.length > 0) {
      problems.push(`${label}: entry file(s) missing — was it built? ${missing.join(', ')}`);
      continue;
    }
    checked.push(label);

    // Follow the resolved files' own @intelliflow imports (each directory once).
    const dirs = [...new Set(entries.map((e) => path.dirname(path.join(pkgDir, e))))].filter(
      (d) => !scannedDirs.has(d)
    );
    for (const d of dirs) scannedDirs.add(d);
    for (const s of specifiersOfFiles(dirs.flatMap(listJsFiles))) {
      queue.push([s, pkgDir, label]);
    }
  }
  return { checked: checked.sort(), problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [appDir, distDir] = process.argv.slice(2);
  if (!appDir || !distDir) {
    console.error('usage: verify-workspace-runtime.mjs <app-dir> <dist-dir>');
    process.exit(2);
  }
  if (listJsFiles(distDir).length === 0) {
    console.error(`verify-workspace-runtime: no .js files under ${distDir} — nothing was built`);
    process.exit(1);
  }
  const { checked, problems } = verify(appDir, distDir);
  for (const n of checked) console.log(`  ok  ${n}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`  MISSING  ${p}`);
    console.error(
      `verify-workspace-runtime: ${problems.length} workspace import(s) unusable at runtime`
    );
    process.exit(1);
  }
  console.log(
    `verify-workspace-runtime: all ${checked.length} workspace import(s) resolve and are built`
  );
}
