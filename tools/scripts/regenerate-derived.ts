/**
 * regenerate-derived.ts
 *
 * Content-hash-cached orchestrator for derived metric files.
 *
 * Sources tracked:
 *   - apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
 *   - .specify/sprints/**\/_summary.json (glob)
 *
 * Cache stored at: .cache/regenerate-derived-state.json (gitignored)
 *
 * For each derivative target [splits, task-registry, dep-graph]:
 *   - If source-hash signature changed → run generator
 *   - Else → log "cache hit (sources unchanged)" and skip
 *
 * Generators:
 *   - splits:        tsx tools/scripts/split-sprint-plan.ts
 *   - task-registry: node tools/scripts/build-task-registry.mjs
 *   - dep-graph:     node tools/scripts/build-dependency-graph.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const CACHE_DIR = join(REPO_ROOT, '.cache');
const CACHE_FILE = join(CACHE_DIR, 'regenerate-derived-state.json');

const SPRINT_PLAN_CSV = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256File(filePath: string): string {
  if (!existsSync(filePath)) return 'missing';
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function readCache(): Record<string, string> {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCache(state: Record<string, string>): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Build a composite hash signature from Sprint_plan.csv +
 * all .specify/sprints/**\/_summary.json files.
 */
async function buildSourceSignature(): Promise<{
  csvHash: string;
  summariesHash: string;
  combined: string;
}> {
  const csvHash = sha256File(SPRINT_PLAN_CSV);

  const summaryPattern = join(REPO_ROOT, '.specify/sprints/**/_summary.json');

  // Use glob to find all _summary.json files
  const summaryFiles: string[] = [];
  try {
    // Node 22+ has native glob; fall back to manual walk for older versions
    const iterator = glob(summaryPattern.replace(/\\/g, '/'));
    for await (const file of iterator) {
      summaryFiles.push(file);
    }
  } catch {
    // glob might not be available as a named import on Node 18; ignore
  }

  summaryFiles.sort();
  const summaryHasher = createHash('sha256');
  for (const f of summaryFiles) {
    summaryHasher.update(sha256File(f));
    summaryHasher.update(f); // include path so renamed files invalidate
  }
  const summariesHash = summaryHasher.digest('hex');

  const combined = createHash('sha256')
    .update(csvHash)
    .update(summariesHash)
    .digest('hex');

  return { csvHash, summariesHash, combined };
}

function run(cmd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
}

// ── Targets ───────────────────────────────────────────────────────────────────

interface Target {
  name: string;
  /** Cache key written/read from the state file */
  cacheKey: string;
  /** Function returning the hash to compare against */
  getCurrentHash: (sig: { csvHash: string; summariesHash: string; combined: string }) => string;
  generate: () => void;
}

const TARGETS: Target[] = [
  {
    name: 'splits',
    cacheKey: 'splits_source_hash',
    getCurrentHash: (sig) => sig.csvHash,
    generate: () => run('npx tsx tools/scripts/split-sprint-plan.ts'),
  },
  {
    name: 'task-registry',
    cacheKey: 'task_registry_source_hash',
    getCurrentHash: (sig) => sig.combined,
    generate: () => run('node tools/scripts/build-task-registry.mjs'),
  },
  {
    name: 'dep-graph',
    cacheKey: 'dep_graph_source_hash',
    getCurrentHash: (sig) => sig.csvHash,
    generate: () => run('node tools/scripts/build-dependency-graph.mjs'),
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('regenerate-derived: computing source hashes...');

  if (!existsSync(SPRINT_PLAN_CSV)) {
    console.error(`regenerate-derived: ERROR — Sprint_plan.csv not found at ${SPRINT_PLAN_CSV}`);
    process.exit(1);
  }

  const sig = await buildSourceSignature();
  console.log(`  csv hash:       ${sig.csvHash.slice(0, 12)}...`);
  console.log(`  summaries hash: ${sig.summariesHash.slice(0, 12)}...`);
  console.log(`  combined:       ${sig.combined.slice(0, 12)}...`);

  const cache = readCache();
  const newCache: Record<string, string> = { ...cache };
  let anyRan = false;

  for (const target of TARGETS) {
    const currentHash = target.getCurrentHash(sig);
    const cachedHash = cache[target.cacheKey];

    if (cachedHash === currentHash) {
      console.log(`regenerate-derived: ${target.name} cache hit (sources unchanged) — skipping`);
    } else {
      console.log(`regenerate-derived: ${target.name} sources changed — regenerating...`);
      target.generate();
      newCache[target.cacheKey] = currentHash;
      anyRan = true;
      console.log(`regenerate-derived: ${target.name} done`);
    }
  }

  writeCache(newCache);

  if (!anyRan) {
    console.log('regenerate-derived: all targets up to date — nothing regenerated');
  } else {
    console.log('regenerate-derived: complete');
  }
}

main().catch((err) => {
  console.error('regenerate-derived: fatal error:', err);
  process.exit(1);
});
