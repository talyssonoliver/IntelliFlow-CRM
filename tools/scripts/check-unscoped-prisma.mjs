#!/usr/bin/env node
/**
 * check-unscoped-prisma
 *
 * Lists every use of the unscoped Prisma client (`ctx.prisma`) in API routers and procedure
 * files, and fails when one appears that the allowlist does not explain.
 *
 * `ctx.prismaWithTenant` adds the request's tenant to every query on a tenant-owned model
 * (apps/api/src/security/tenant-filter.ts). `ctx.prisma` does not: a query through it is
 * only as tenant-safe as its own `where`. So every use is either
 *
 *  - a shared service built from the root client (audit logger, MFA, sessions, RBAC,
 *    notifications), which pass the tenant explicitly on each call; or
 *  - listed in tools/scripts/unscoped-prisma-allowlist.json under its file, with the
 *    maximum number of uses and the reason (public endpoints with no session, cross-tenant
 *    membership and partner operations, routes without a tenant-scoped client).
 *
 * A file whose uses exceed its maximum, or that is not listed, fails the check. Lower a
 * maximum when uses go away; the check reports entries that allow more than they need.
 *
 * Usage: node tools/scripts/check-unscoped-prisma.mjs [--list]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCAN_ROOT = 'apps/api/src';
export const ALLOWLIST_PATH = 'tools/scripts/unscoped-prisma-allowlist.json';

/** Router and procedure files; tests are excluded. */
export function isScannedFile(rel) {
  const p = rel.replaceAll('\\', '/');
  if (/(^|\/)(__tests__|test)\//.test(p) || /\.(test|spec)\.ts$/.test(p)) return false;
  return /\.(router|procedures)\.ts$/.test(p);
}

/** Shared services constructed from the root client; they take the tenant per call. */
export const SERVICE_FACTORY =
  /(?:getAuditLogger|getMfaService|getSessionService|createNotification|createOutboxPortalPushEnqueuer)\(\s*ctx\.prisma\b(?!WithTenant)|new\s+RBACService\(\s*ctx\.prisma\b(?!WithTenant)/g;

const UNSCOPED = /\bctx\.prisma\b(?!WithTenant)/g;

/** Source with comments blanked out (same length, so line numbers stay right). */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}

/** `{ line, kind }` for each unscoped use in `src`; kind is 'service' or 'direct'. */
export function findUses(src) {
  const code = stripComments(src);
  const factoryAt = new Set();
  for (const m of code.matchAll(SERVICE_FACTORY)) {
    factoryAt.add(m.index + m[0].indexOf('ctx.prisma'));
  }
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  return [...code.matchAll(UNSCOPED)].map((m) => ({
    line: lineOf(m.index),
    kind: factoryAt.has(m.index) ? 'service' : 'direct',
  }));
}

/** Compares direct uses per file with the allowlist. */
export function evaluate(usesByFile, allowlist) {
  const failures = [];
  const slack = [];
  for (const [file, uses] of Object.entries(usesByFile)) {
    const direct = uses.filter((u) => u.kind === 'direct').length;
    if (direct === 0) continue;
    const entry = allowlist[file];
    if (!entry) failures.push({ file, direct, max: 0 });
    else if (direct > entry.max) failures.push({ file, direct, max: entry.max });
    else if (direct < entry.max) slack.push({ file, direct, max: entry.max });
  }
  for (const [file, entry] of Object.entries(allowlist)) {
    if (!usesByFile[file]?.some((u) => u.kind === 'direct')) {
      slack.push({ file, direct: 0, max: entry.max });
    }
  }
  return { failures, slack };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, out);
    } else out.push(full);
  }
  return out;
}

export function scan(root = repoRoot) {
  const usesByFile = {};
  for (const full of walk(path.join(root, SCAN_ROOT))) {
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (!isScannedFile(rel)) continue;
    const uses = findUses(fs.readFileSync(full, 'utf8'));
    if (uses.length) usesByFile[rel] = uses;
  }
  return usesByFile;
}

export function run(argv, { root = repoRoot, log = console.log, error = console.error } = {}) {
  const allowlist = JSON.parse(fs.readFileSync(path.join(root, ALLOWLIST_PATH), 'utf8')).files;
  const usesByFile = scan(root);
  const { failures, slack } = evaluate(usesByFile, allowlist);

  if (argv.includes('--list')) {
    for (const [file, uses] of Object.entries(usesByFile).sort(([a], [b]) => a.localeCompare(b))) {
      const direct = uses.filter((u) => u.kind === 'direct');
      const service = uses.length - direct.length;
      log(`${file}: ${direct.length} direct, ${service} service`);
      for (const u of direct) log(`  ${file}:${u.line}`);
      if (allowlist[file]) log(`  reason: ${allowlist[file].reason}`);
    }
  }
  for (const s of slack) {
    log(`unscoped-prisma: ${s.file} allows ${s.max} direct uses but has ${s.direct}; lower it.`);
  }
  if (failures.length === 0) {
    log('unscoped-prisma: every unscoped ctx.prisma use in routers is accounted for');
    return 0;
  }
  error('unscoped-prisma: unscoped ctx.prisma uses that the allowlist does not cover:');
  for (const f of failures) error(`  ${f.file}: ${f.direct} direct uses (allowed ${f.max})`);
  error(
    '  Use ctx.prismaWithTenant, or add the file to ' +
      `${ALLOWLIST_PATH} with the reason the query cannot be tenant-scoped.`
  );
  return 1;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('tools/scripts/check-unscoped-prisma.mjs')) {
  process.exitCode = run(process.argv);
}
