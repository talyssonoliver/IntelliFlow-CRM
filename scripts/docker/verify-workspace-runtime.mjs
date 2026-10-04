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
 * How: collect every `@intelliflow/*` specifier imported by the entry directory's
 * .js files, resolve each through the importing package's node_modules (the pnpm
 * workspace symlinks), and require that its package.json and every entry file it
 * declares (main / module / exports['.']) exist. Then repeat for each resolved
 * package's own entry files, transitively. Nothing is executed or imported.
 *
 * Usage:  node verify-workspace-runtime.mjs <app-dir> <dist-dir>
 *   e.g.  node verify-workspace-runtime.mjs apps/api apps/api/dist
 * Exit:   0 all resolved · 1 something missing · 2 usage error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// import x from '@intelliflow/a' · import('@intelliflow/a') · require('@intelliflow/a') · export … from
const SPECIFIER =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](@intelliflow\/[a-z0-9._-]+)(?:\/[^"']*)?["']/g;

/** Every @intelliflow package name imported by the given files. */
export function importedWorkspacePackages(source) {
  const names = new Set();
  for (const m of source.matchAll(SPECIFIER)) names.add(m[1]);
  return names;
}

/** All entry targets a package.json declares for its root export. */
export function declaredEntries(pkg) {
  const out = new Set();
  const visit = (node) => {
    if (typeof node === 'string') out.add(node);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) if (k !== 'types') visit(v);
    }
  };
  if (pkg.exports !== undefined) {
    const root =
      typeof pkg.exports === 'string' || Array.isArray(pkg.exports) || !('.' in pkg.exports)
        ? pkg.exports
        : pkg.exports['.'];
    visit(root);
  }
  if (pkg.main) out.add(pkg.main);
  if (pkg.module) out.add(pkg.module);
  // Type declarations are not loaded at runtime.
  return [...out].filter((f) => !/\.d\.[cm]?ts$/.test(f));
}

function listJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') out.push(...listJsFiles(p));
    } else if (/\.(c|m)?js$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function importsOfFiles(files) {
  const names = new Set();
  for (const f of files) {
    for (const n of importedWorkspacePackages(fs.readFileSync(f, 'utf8'))) names.add(n);
  }
  return names;
}

/**
 * @returns {{checked: string[], problems: string[]}}
 */
export function verify(appDir, distDir) {
  const problems = [];
  const checked = [];
  const seen = new Set();
  // queue of [packageName, directory whose node_modules resolves it, importer label]
  const queue = [...importsOfFiles(listJsFiles(distDir))].map((n) => [n, appDir, distDir]);

  while (queue.length > 0) {
    const [name, fromDir, importer] = queue.shift();
    const linkDir = path.join(fromDir, 'node_modules', name);
    let pkgDir;
    try {
      pkgDir = fs.realpathSync(linkDir);
    } catch {
      problems.push(`${name}: not resolvable from ${fromDir} (imported by ${importer})`);
      continue;
    }
    if (seen.has(pkgDir)) continue;
    seen.add(pkgDir);

    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      problems.push(`${name}: ${pkgDir} has no package.json`);
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const entries = declaredEntries(pkg);
    if (entries.length === 0) {
      problems.push(`${name}: package.json declares no runtime entry (main/module/exports)`);
      continue;
    }
    const missing = entries.filter((e) => !fs.existsSync(path.join(pkgDir, e)));
    if (missing.length > 0) {
      problems.push(`${name}: entry file(s) missing — was it built? ${missing.join(', ')}`);
      continue;
    }
    checked.push(name);

    // Follow the package's own @intelliflow imports from its entry files' directories.
    const entryDirs = [...new Set(entries.map((e) => path.dirname(path.join(pkgDir, e))))];
    for (const n of importsOfFiles(entryDirs.flatMap(listJsFiles))) {
      queue.push([n, pkgDir, name]);
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
      `verify-workspace-runtime: ${problems.length} workspace package(s) unusable at runtime`
    );
    process.exit(1);
  }
  console.log(
    `verify-workspace-runtime: all ${checked.length} workspace package(s) resolve and are built`
  );
}
