#!/usr/bin/env node
/**
 * check-migration-role-bootstrap.mjs  (CI failure category D)
 *
 * Catches the "Migration ETL Pipeline red — role \"X\" does not exist" class of
 * failure: a Prisma migration GRANTs to / ALTERs a Postgres role that the CI
 * `migration.yml` bootstrap never creates, so `prisma migrate deploy` aborts
 * with P3018 `role "postgres" does not exist`.
 *
 * What it does
 *   1. Parses .github/workflows/migration.yml and extracts every role created
 *      by a Bootstrap step (`CREATE ROLE` / `CREATE USER`), plus the always-
 *      present roles: the postgres-service `POSTGRES_USER`, and Postgres
 *      built-in pseudo-roles (public, current_user, ...).
 *   2. Walks packages/db/prisma/migrations/ ** /migration.sql and extracts every
 *      role REFERENCED via:
 *         GRANT ... TO <role[, role...]>
 *         REVOKE ... FROM <role[, role...]>
 *         ALTER DEFAULT PRIVILEGES FOR ROLE <role>
 *         ALTER ROLE <role>
 *         REASSIGN/DROP OWNED BY <role>
 *   3. Fails if any referenced role is not in the bootstrap set, naming the
 *      migration file, the role, and the line.
 *
 * This alone would have caught commit 487d249c: the baseline migration
 * `20260317000000_baseline/migration.sql` references `postgres`, which that
 * commit's migration.yml bootstrap did not create (only anon / authenticated /
 * service_role). Commit 6e71576a later added the `postgres` role, so against
 * current HEAD this guard PASSES — re-introduce the gap and it goes red again.
 *
 * Usage
 *   node tools/scripts/preship/check-migration-role-bootstrap.mjs
 *   node tools/scripts/preship/check-migration-role-bootstrap.mjs --staged-only
 *   node tools/scripts/preship/check-migration-role-bootstrap.mjs --workflow <path>
 *   node tools/scripts/preship/check-migration-role-bootstrap.mjs --json
 *
 * Exit codes (when run directly): 0 pass/skip, 1 fail, 2 usage/parse error.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { repoRoot, walkFiles, getStagedFiles, toPosixRel, lineAt, color, isMain } from './util.mjs';

const WORKFLOW_REL = '.github/workflows/migration.yml';
const MIGRATIONS_DIR = join(repoRoot, 'packages', 'db', 'prisma', 'migrations');

// Postgres pseudo-roles / keywords that are always resolvable as a GRANT
// target and never need bootstrapping.
const BUILTIN_ROLES = new Set(['public', 'current_user', 'session_user', 'current_role']);

// SQL keywords that can syntactically land in a TO/FROM capture but are not
// role names (defensive — split + filter).
const NON_ROLE_TOKENS = new Set(['group', 'role', 'user', 'with', 'grant', 'option', 'admin']);

const normalizeRole = (raw) =>
  raw
    .trim()
    .replace(/^["'`]|["'`]$/g, '') // strip surrounding quotes
    .toLowerCase();

const isIdentifier = (tok) => /^[a-z_][a-z0-9_$]*$/i.test(tok);

/** Strip SQL `--` line comments and block comments so we never match inside them. */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) // keep newlines for line numbers
    .replace(/--[^\n]*/g, '');
}

/**
 * Parse migration.yml and return { roles:Set, source:string }.
 * Throws on unreadable/unparseable workflow (caller turns it into exit 2).
 */
export function extractBootstrapRoles(workflowPath) {
  const text = readFileSync(workflowPath, 'utf8');
  const roles = new Set(BUILTIN_ROLES);

  let doc;
  try {
    doc = yaml.load(text);
  } catch (err) {
    throw new Error(`could not parse ${WORKFLOW_REL}: ${err.message}`, { cause: err });
  }

  const createRe =
    /\bCREATE\s+(?:ROLE|USER)\s+(?:IF\s+NOT\s+EXISTS\s+)?(["'`]?)([a-z_][a-z0-9_$]*)\1/gi;
  const collectCreates = (script) => {
    let m;
    createRe.lastIndex = 0;
    while ((m = createRe.exec(script)) !== null) roles.add(normalizeRole(m[2]));
  };

  const jobs = (doc && doc.jobs) || {};
  for (const job of Object.values(jobs)) {
    if (!job || typeof job !== 'object') continue;

    // The postgres service user always exists (it owns the test DB).
    const services = job.services || {};
    for (const svc of Object.values(services)) {
      const user = svc && svc.env && svc.env.POSTGRES_USER;
      if (typeof user === 'string' && user.trim()) roles.add(normalizeRole(user));
    }

    // Bootstrap steps: name mentions "bootstrap", OR the run body creates roles.
    for (const step of job.steps || []) {
      if (!step || typeof step.run !== 'string') continue;
      const isBootstrap =
        (typeof step.name === 'string' && /bootstrap/i.test(step.name)) ||
        /\bCREATE\s+(?:ROLE|USER)\b/i.test(step.run);
      if (isBootstrap) collectCreates(step.run);
    }
  }

  // Fallback: if YAML structure shifted and we found nothing, scan raw text so
  // we never silently treat an all-roles-missing situation as "all good".
  if (roles.size === BUILTIN_ROLES.size) collectCreates(text);

  return { roles, source: WORKFLOW_REL };
}

/**
 * Extract { role, line } references from one migration.sql body.
 */
export function extractReferencedRoles(sqlRaw) {
  // stripSqlComments preserves newlines positionally (block comments keep \n,
  // line comments only remove pre-newline chars), so match offsets into `sql`
  // map to the SAME 1-based line number in the original file.
  const sql = stripSqlComments(sqlRaw);
  const refs = [];
  const add = (role, index) => {
    const r = normalizeRole(role);
    if (!r || !isIdentifier(r) || NON_ROLE_TOKENS.has(r)) return;
    refs.push({ role: r, line: lineAt(sql, index) });
  };
  const addList = (list, index) => {
    for (const part of list.split(',')) {
      const tok = part.trim();
      if (tok) add(tok, index);
    }
  };

  let m;

  // GRANT ... TO <role-list>;   (capture is single-statement: [^;]+)
  const grantRe = /\bGRANT\b[^;]{0,500}\bTO\b[ \t]+([^;\n]{1,200});/gis;
  while ((m = grantRe.exec(sql)) !== null) addList(m[1], m.index);

  // REVOKE ... FROM <role-list>;
  const revokeRe = /\bREVOKE\b[^;]{0,500}\bFROM\b[ \t]+([^;\n]{1,200});/gis;
  while ((m = revokeRe.exec(sql)) !== null) addList(m[1], m.index);

  // ALTER DEFAULT PRIVILEGES FOR ROLE <role[, role]>
  const forRoleRe =
    /\bFOR[ \t]+ROLE[ \t]+([a-z_"'`][a-z0-9_$"'`, \t]{0,100}?)(?:[ \t]+IN\b|[ \t]+GRANT\b|[ \t]+REVOKE\b|\n|;)/gi;
  while ((m = forRoleRe.exec(sql)) !== null) addList(m[1], m.index);

  // ALTER ROLE <role>   (not "ALTER DEFAULT PRIVILEGES FOR ROLE", handled above)
  const alterRoleRe = /\bALTER\s+ROLE\s+(?!ALL\b)(["'`]?[a-z_][a-z0-9_$]*["'`]?)/gi;
  while ((m = alterRoleRe.exec(sql)) !== null) add(m[1], m.index);

  // REASSIGN / DROP OWNED BY <role>  (sequence "OWNED BY tbl.col" is skipped:
  // a dotted token is a column reference, not a role).
  const ownedRe = /\bOWNED\s+BY\s+(["'`]?[a-z_][a-z0-9_$.]*["'`]?)/gi;
  while ((m = ownedRe.exec(sql)) !== null) {
    const tok = normalizeRole(m[1]);
    if (tok.includes('.')) continue; // column ownership, not a role
    add(m[1], m.index);
  }

  return refs;
}

/**
 * @param {{ stagedOnly?: boolean, workflowPath?: string }} [opts]
 * @returns {Promise<import('./util.mjs').GuardResult>}
 */
export async function run(opts = {}) {
  const name = 'migration-role-bootstrap';
  const workflowPath = opts.workflowPath ?? join(repoRoot, WORKFLOW_REL);

  // Staged-only fast path: nothing to do unless the workflow or a migration is
  // part of this commit.
  let migrationFiles = walkFiles([MIGRATIONS_DIR], { exts: ['migration.sql'] });
  if (opts.stagedOnly) {
    const staged = new Set(getStagedFiles().map(toPosixRel));
    const workflowStaged = staged.has(WORKFLOW_REL);
    const stagedMigrations = migrationFiles.filter((f) => staged.has(toPosixRel(f)));
    if (!workflowStaged && stagedMigrations.length === 0) {
      return {
        name,
        status: 'skip',
        summary: 'no migration.yml / migration.sql changes staged',
        findings: [],
      };
    }
    // If only migrations changed, still validate them against the FULL bootstrap
    // set (a new migration can reference an un-bootstrapped role). If the
    // workflow changed, re-validate every migration against the new set.
    migrationFiles = workflowStaged ? migrationFiles : stagedMigrations;
  }

  let bootstrap;
  try {
    bootstrap = extractBootstrapRoles(workflowPath);
  } catch (err) {
    return {
      name,
      status: 'fail',
      summary: err.message,
      findings: [String(err.message)],
    };
  }

  const findings = [];
  for (const file of migrationFiles.sort()) {
    let body;
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const refs = extractReferencedRoles(body).sort((a, b) => a.line - b.line);
    const seen = new Set();
    for (const { role, line } of refs) {
      if (bootstrap.roles.has(role)) continue;
      const key = `${role}@${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(
        `${toPosixRel(file)}:${line} references role "${role}" not created by the ${bootstrap.source} bootstrap`
      );
    }
  }

  if (findings.length > 0) {
    const bootstrapList = [...bootstrap.roles].sort().join(', ');
    return {
      name,
      status: 'fail',
      summary: `${findings.length} migration role reference(s) missing from CI bootstrap`,
      findings: [
        ...findings,
        '',
        `Bootstrap creates: ${bootstrapList}`,
        `Fix: add the missing role(s) to the "Bootstrap Supabase schemas + roles"`,
        `step in ${bootstrap.source} (CREATE ROLE <name> NOLOGIN inside the DO $$ block),`,
        `or remove the GRANT/ALTER from the migration if the role is not needed.`,
      ],
    };
  }

  return {
    name,
    status: 'pass',
    summary: `${migrationFiles.length} migration(s) reference only bootstrapped roles`,
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const stagedOnly = args.includes('--staged-only');
  const json = args.includes('--json');
  const wfIdx = args.indexOf('--workflow');
  const workflowPath = wfIdx !== -1 ? args[wfIdx + 1] : undefined;

  if (wfIdx !== -1 && !workflowPath) {
    console.error('--workflow requires a path');
    process.exit(2);
  }

  const result = await run({ stagedOnly, workflowPath });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.status === 'pass') {
    console.log(`${color.green('PASS')}  [${result.name}] ${result.summary}`);
  } else if (result.status === 'skip') {
    console.log(`${color.gray('SKIP')}  [${result.name}] ${result.summary}`);
  } else {
    console.error(`${color.red('FAIL')}  [${result.name}] ${result.summary}`);
    for (const f of result.findings) console.error(f ? `      ${f}` : '');
  }

  process.exit(result.status === 'fail' ? 1 : 0);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`[migration-role-bootstrap] unexpected error: ${err.stack || err}`);
    process.exit(2);
  });
}
