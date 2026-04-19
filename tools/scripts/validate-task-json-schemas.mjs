#!/usr/bin/env node
/**
 * Task JSON `$schema` path validator.
 *
 * Walks every task-status JSON under `apps/project-tracker/docs/metrics/` and
 * verifies the `$schema` field (if present) resolves to an actual file on
 * disk. Catches the template typo where sprint-N task files reference
 * `../../schemas/...` (resolves to a non-existent `docs/schemas/`) instead of
 * `../schemas/...` (resolves to `docs/metrics/schemas/`).
 *
 * Usage:
 *   node tools/scripts/validate-task-json-schemas.mjs            # report
 *   node tools/scripts/validate-task-json-schemas.mjs --fix      # rewrite
 *   node tools/scripts/validate-task-json-schemas.mjs --quiet    # errors only
 *
 * Exit codes:
 *   0 — all schema paths resolve (or fixed successfully if --fix)
 *   1 — one or more schema paths do not resolve and --fix was not passed
 *   2 — usage or I/O error
 *
 * CI usage: run without --fix to block merges that introduce the typo.
 * Sweep-fix: run with --fix once to repair existing files.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const METRICS_ROOT = join(REPO_ROOT, 'apps/project-tracker/docs/metrics');

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const QUIET = args.includes('--quiet');

function info(msg) {
  if (!QUIET) process.stdout.write(`${msg}\n`);
}
function warn(msg) {
  process.stderr.write(`${msg}\n`);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (s.isFile() && entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function findCorrectRelativePath(fromFile, schemaBasename) {
  const fromDir = dirname(fromFile);
  // Canonical schema location.
  const candidate = join(METRICS_ROOT, 'schemas', schemaBasename);
  if (!existsSync(candidate)) return null;
  let rel = relative(fromDir, candidate).replaceAll('\\', '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function main() {
  if (!existsSync(METRICS_ROOT)) {
    warn(`[schema-validator] Metrics root not found: ${METRICS_ROOT}`);
    process.exit(2);
  }

  const files = walk(METRICS_ROOT);
  let checked = 0;
  let broken = 0;
  let fixed = 0;
  const brokenList = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch (err) {
      warn(`[schema-validator] cannot read ${file}: ${err.message}`);
      continue;
    }

    let json;
    try {
      json = JSON.parse(content);
    } catch {
      continue; // not valid JSON; skip silently
    }

    if (typeof json !== 'object' || json === null) continue;
    const schemaRef = json.$schema;
    if (typeof schemaRef !== 'string') continue;

    // URL-scheme refs (http://, https://) are JSON Schema meta-schema
    // pointers used inside the schema definition files themselves. They
    // are not local filesystem paths — skip.
    if (/^https?:\/\//i.test(schemaRef)) continue;

    checked++;
    const fromDir = dirname(file);
    const resolved = resolve(fromDir, schemaRef);

    if (existsSync(resolved)) continue;

    broken++;
    const basename = schemaRef.split('/').pop() ?? '';
    const correct = findCorrectRelativePath(file, basename);
    brokenList.push({ file, schemaRef, resolved, correct });

    if (!FIX) continue;

    if (!correct) {
      warn(
        `[schema-validator] FAIL: ${relative(REPO_ROOT, file)} — schema "${schemaRef}" not found and no canonical match for "${basename}"`
      );
      continue;
    }

    // Rewrite the $schema value in place.
    const updated = content.replace(
      new RegExp(`"\\$schema"\\s*:\\s*"${schemaRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `"$schema": "${correct}"`
    );
    if (updated === content) {
      warn(`[schema-validator] FAIL: could not rewrite ${relative(REPO_ROOT, file)}`);
      continue;
    }
    writeFileSync(file, updated, 'utf8');
    fixed++;
    info(`[schema-validator] fixed ${relative(REPO_ROOT, file)}: ${schemaRef} → ${correct}`);
  }

  info(`[schema-validator] checked ${checked} files — ${broken} broken${FIX ? `, ${fixed} fixed` : ''}`);

  if (broken > 0 && !FIX) {
    warn('');
    warn(`[schema-validator] ${broken} file(s) have $schema paths that do not resolve:`);
    for (const b of brokenList.slice(0, 10)) {
      warn(`  - ${relative(REPO_ROOT, b.file)}`);
      warn(`      current:   ${b.schemaRef}`);
      warn(`      resolves:  ${b.resolved} (missing)`);
      if (b.correct) warn(`      suggested: ${b.correct}`);
    }
    if (brokenList.length > 10) warn(`  ... and ${brokenList.length - 10} more`);
    warn('');
    warn(`Re-run with --fix to sweep-fix all files.`);
    process.exit(1);
  }

  if (broken > 0 && FIX && fixed < broken) {
    process.exit(1);
  }

  process.exit(0);
}

main();
