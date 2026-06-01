#!/usr/bin/env node
/**
 * Static N+1 query scanner (ADR-053 / IFC-314, Phase 3).
 *
 * AST-based (TypeScript compiler API) detector for high-confidence N+1 shapes
 * in SERVER-SIDE source: a Prisma/repository DB call lexically inside a loop
 * (for / for-of / for-in / while / do) or an array-callback (map / forEach /
 * flatMap / reduce). Frontend tRPC mutation fan-outs are intentionally NOT
 * flagged (they are not direct DB calls).
 *
 * Usage:
 *   node tools/scripts/nplus1-scan.mjs              # scan; exit 1 on NEW violations
 *   node tools/scripts/nplus1-scan.mjs --json       # print findings as JSON
 *   node tools/scripts/nplus1-scan.mjs --update-baseline  # rewrite the baseline
 *
 * Baseline: tools/scripts/nplus1-baseline.json (signature -> occurrence count;
 * line-independent so refactors elsewhere don't churn it). CI fails when any
 * signature's occurrence count exceeds the baseline (a NEW violation) — existing
 * ones are grandfathered until the remediation batches remove them.
 *
 * @module tools/scripts/nplus1-scan
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const BASELINE_PATH = path.join(REPO_ROOT, 'tools/scripts/nplus1-baseline.json');

const ROOTS = [
  'apps/api/src',
  'apps/web/src',
  'apps/ai-worker/src',
  'apps/workers',
  'packages/adapters/src',
  'packages/application/src',
  'packages/domain/src',
];

const EXCLUDE_DIR = ['node_modules', 'dist', 'generated', '.next', '__tests__', 'coverage', '.turbo'];
const EXCLUDE_FILE = /(\.test\.|\.spec\.|\.bench\.|\.d\.ts$|\.mock\.|seed|migration)/i;

const PRISMA_ACTIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'create', 'createMany', 'update', 'updateMany',
  'upsert', 'delete', 'deleteMany',
  '$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$transaction',
]);
// Common repository/port method names that wrap a single DB round-trip.
const REPO_METHODS = new Set([
  'findById', 'findByIds', 'findOne', 'findAll', 'findMany', 'findByTenantId',
  'save', 'create', 'update', 'delete', 'remove', 'count', 'countByVariant',
  'getLeadData', 'findByExperimentId', 'scoreLead', 'completeTask',
]);
const ARRAY_CB = new Set(['map', 'forEach', 'flatMap', 'reduce']);

/** Is this CallExpression a Prisma/repository DB call? */
function isDbIshCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const action = callee.name.text;
  const receiver = callee.expression.getText().replace(/\s+/g, '');
  const onPrisma = /(^|\.)(prisma|prismaWithTenant|tx)(\b|\.|$)/i.test(receiver);
  const onRepo = /repo(sitory)?$/i.test(receiver);
  if (PRISMA_ACTIONS.has(action) && onPrisma) return { action, receiver };
  if (onRepo && (PRISMA_ACTIONS.has(action) || REPO_METHODS.has(action))) return { action, receiver };
  return false;
}

/** Climb ancestors to the nearest enclosing iteration construct. */
function enclosingIteration(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isForStatement(cur)) return 'await-in-for';
    if (ts.isForOfStatement(cur)) return 'await-in-for-of';
    if (ts.isForInStatement(cur)) return 'await-in-for-in';
    if (ts.isWhileStatement(cur) || ts.isDoStatement(cur)) return 'await-in-while';
    if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
      const m = cur.expression.name.text;
      if (ARRAY_CB.has(m)) return `prisma-in-${m}`;
    }
    cur = cur.parent;
  }
  return null;
}

function severityFor(pattern) {
  return pattern.startsWith('await-in-') ? 'High' : 'Medium';
}

function* walk(node) {
  yield node;
  for (const child of node.getChildren()) yield* walk(child);
}

function scanFile(absPath, relPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const seen = new Set();
  for (const node of walk(sf)) {
    const db = isDbIshCall(node);
    if (!db) continue;
    const pattern = enclosingIteration(node);
    if (!pattern) continue;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const calleeText = node.expression.getText(sf).replace(/\s+/g, '');
    const key = `${line}:${calleeText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      file: relPath.replace(/\\/g, '/'),
      line: line + 1,
      pattern,
      severity: severityFor(pattern),
      call: `${db.receiver}.${db.action}`,
      signature: `${relPath.replace(/\\/g, '/')}::${pattern}::${db.receiver}.${db.action}`,
    });
  }
  return findings;
}

function collectFiles(root) {
  const abs = path.join(REPO_ROOT, root);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const rel of fs.readdirSync(abs, { recursive: true })) {
    const relStr = String(rel);
    if (EXCLUDE_DIR.some((d) => relStr.split(/[\\/]/).includes(d))) continue;
    if (!/\.(ts|tsx)$/.test(relStr)) continue;
    if (EXCLUDE_FILE.test(relStr)) continue;
    out.push({ abs: path.join(abs, relStr), rel: path.join(root, relStr) });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const findings = [];
  for (const root of ROOTS) {
    for (const f of collectFiles(root)) findings.push(...scanFile(f.abs, f.rel));
  }
  findings.sort((a, b) => a.signature.localeCompare(b.signature) || a.line - b.line);

  // Current occurrence counts per signature.
  const current = {};
  for (const f of findings) current[f.signature] = (current[f.signature] ?? 0) + 1;

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
    return;
  }

  if (args.includes('--update-baseline')) {
    const baseline = {
      description:
        'Grandfathered N+1 scanner signatures (ADR-053 / IFC-314). Owner: Backend Dev (STOA-Domain). ' +
        'These map to NPLUS1_AUDIT.md findings and shrink as remediation batches land. CI fails on any NEW signature.',
      total: findings.length,
      signatures: current,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    process.stdout.write(`[nplus1-scan] Baseline updated: ${findings.length} signatures across ${Object.keys(current).length} unique sites.\n`);
    return;
  }

  const baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).signatures ?? {}
    : {};

  const violations = [];
  for (const [sig, count] of Object.entries(current)) {
    const allowed = baseline[sig] ?? 0;
    if (count > allowed) violations.push({ sig, count, allowed });
  }

  process.stdout.write(
    `[nplus1-scan] ${findings.length} N+1 finding(s) across ${Object.keys(current).length} site(s); ` +
      `${Object.keys(baseline).length} baselined.\n`
  );
  if (violations.length > 0) {
    process.stderr.write(`\n[nplus1-scan] ${violations.length} NEW high-confidence N+1 violation(s) (not in baseline):\n`);
    for (const v of violations) {
      const f = findings.find((x) => x.signature === v.sig);
      process.stderr.write(`  - ${f.file}:${f.line}  [${f.pattern}]  ${f.call}\n`);
    }
    process.stderr.write(
      `\nFix by batching the per-element query (see docs/operations/nplus1-audit/NPLUS1_AUDIT.md),\n` +
        `or, only with a documented owner + justification, run: node tools/scripts/nplus1-scan.mjs --update-baseline\n`
    );
    process.exit(1);
  }
  process.stdout.write('[nplus1-scan] No new N+1 violations. OK\n');
}

main();
