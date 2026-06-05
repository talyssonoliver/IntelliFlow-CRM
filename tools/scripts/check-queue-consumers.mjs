#!/usr/bin/env node
/**
 * check-queue-consumers.mjs
 *
 * CI guard: greps deployed-app source files (apps/api, apps/ai-worker) for
 * BullMQ Queue constructor calls whose first string argument is a literal
 * queue name, then asserts every produced queue name appears in
 * infra/queue-consumer-manifest.json with a non-empty consumer.
 *
 * Detection strategy:
 *   Look for `new Queue('name', ...)` / `new Queue("name", ...)` and
 *   explicit `const queueName = 'name'` / `QUEUE_NAMES.KEY: 'name'`
 *   patterns in non-test TypeScript source files.
 *   Only matches known queue-name prefixes: `ai-`, `intelliflow-`.
 *
 * Exit 0  — all produced queues have a mapped consumer.
 * Exit 1  — one or more produced queues are unmapped (backlog risk).
 *
 * Usage:
 *   node tools/scripts/check-queue-consumers.mjs
 *   pnpm check:queue-consumers
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const SCANNED_DIRS = [
  join(repoRoot, 'apps', 'api', 'src'),
  join(repoRoot, 'apps', 'ai-worker', 'src'),
];

const MANIFEST_PATH = join(repoRoot, 'infra', 'queue-consumer-manifest.json');

// Only match string literals that look like BullMQ queue names.
// Queue names in this codebase always start with `ai-` or `intelliflow-`.
const QUEUE_NAME_REGEX = /^(?:ai-|intelliflow[-:])[a-z0-9-:]+$/;

// Queue names that are intentionally un-consumed in this codebase,
// or strings that the regex over-matches (not actually BullMQ queue names).
// Add entries here to suppress false positives, but document why.
const KNOWN_EXEMPT = new Set([
  // Passive inspection queue — no consumer by design (H8 DLQ)
  'ai-dlq',
  // These strings match the queue-name regex but are NOT BullMQ queue names:
  // 'ai-agent-audit' and 'ai-agent-write' are guardrail/agent capability names
  // used in apps/ai-worker/src/utils/audit-log.ts.
  'ai-agent-audit',
  'ai-agent-write',
  // 'ai-worker' is the service name string (e.g. pino logger name: 'ai-worker')
  'ai-worker',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory and yield .ts file paths, skipping test dirs.
 */
function* walkTs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'test', 'tests', 'dist', 'node_modules'].includes(entry.name)) continue;
      yield* walkTs(full);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.bench.ts')
    ) {
      yield full;
    }
  }
}

/**
 * Extract literal BullMQ queue name strings from a single .ts source file.
 *
 * Matches patterns:
 *   new Queue('intelliflow-text-extraction', ...)
 *   new Queue("ai-scoring", ...)
 *   const queueName = 'intelliflow-ocr-processing'
 *   AI_ENRICHMENT: 'ai-enrichment'   (object-literal value)
 *
 * Only captures strings matching QUEUE_NAME_REGEX.
 */
function extractQueueNames(src) {
  const names = new Set();

  // new Queue('name', ...) or Queue('name', ...)
  const queueCtorPattern = /(?:new\s+Queue|(?<!\w)Queue)\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = queueCtorPattern.exec(src)) !== null) {
    if (QUEUE_NAME_REGEX.test(m[1])) names.add(m[1]);
  }

  // Constant assignment: const X_QUEUE = 'name' or X_QUEUE_NAME = 'name'
  const constPattern = /(?:QUEUE|queue)(?:_NAME)?\s*=\s*['"]([^'"]+)['"]/g;
  while ((m = constPattern.exec(src)) !== null) {
    if (QUEUE_NAME_REGEX.test(m[1])) names.add(m[1]);
  }

  // Object-literal queue name values (QUEUE_NAMES object in types.ts):
  //   AI_ENRICHMENT: 'ai-enrichment',
  const objValuePattern = /:\s*['"]([^'"]+)['"],?\s*$/gm;
  while ((m = objValuePattern.exec(src)) !== null) {
    if (QUEUE_NAME_REGEX.test(m[1])) names.add(m[1]);
  }

  // Explicit queue name string in externalQueueNames / dashboardOnlyQueueNames arrays:
  //   'intelliflow-text-extraction',
  const arrayLiteralPattern = /^\s*['"]([^'"]+)['"]\s*,?\s*$/gm;
  while ((m = arrayLiteralPattern.exec(src)) !== null) {
    if (QUEUE_NAME_REGEX.test(m[1])) names.add(m[1]);
  }

  return names;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch (err) {
  console.error(`[check-queue-consumers] Cannot read manifest at ${MANIFEST_PATH}: ${err.message}`);
  process.exit(1);
}

const manifestQueues = manifest.queues ?? {};

// Collect all queue name literals from scanned source files
const producedQueues = new Map(); // queueName -> [file, ...]

for (const dir of SCANNED_DIRS) {
  for (const filePath of walkTs(dir)) {
    const src = readFileSync(filePath, 'utf8');
    const names = extractQueueNames(src);
    for (const name of names) {
      if (!producedQueues.has(name)) producedQueues.set(name, []);
      producedQueues.get(name).push(filePath.replace(repoRoot + '/', '').replace(/\\/g, '/'));
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

let failures = 0;
const unmapped = [];
const mapped = [];

for (const [queueName, files] of [...producedQueues.entries()].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  if (KNOWN_EXEMPT.has(queueName)) continue;

  const entry = manifestQueues[queueName];
  if (!entry || !entry.consumer || entry.consumer.trim() === '') {
    unmapped.push({ queueName, files });
    failures++;
  } else {
    mapped.push({ queueName, consumer: entry.consumer });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (mapped.length > 0) {
  console.log('\n[check-queue-consumers] MAPPED queues (all good):');
  for (const { queueName, consumer } of mapped) {
    console.log(`  v  ${queueName.padEnd(40)} ->  ${consumer}`);
  }
}

if (unmapped.length > 0) {
  console.error('\n[check-queue-consumers] UNMAPPED queues (no consumer in manifest):');
  for (const { queueName, files } of unmapped) {
    console.error(`  x  ${queueName}`);
    for (const f of [...new Set(files)].slice(0, 3)) {
      console.error(`       found in: ${f}`);
    }
  }
  console.error(
    `\n[check-queue-consumers] FAIL — ${failures} produced queue(s) have no consumer entry ` +
      `in infra/queue-consumer-manifest.json`
  );
  console.error(
    '[check-queue-consumers] Add missing entries to infra/queue-consumer-manifest.json ' +
      'or add the queue to KNOWN_EXEMPT in this script.'
  );
  process.exit(1);
}

console.log(
  `\n[check-queue-consumers] PASS — all ${mapped.length} detected queue names are mapped ` +
    `in infra/queue-consumer-manifest.json`
);
process.exit(0);
