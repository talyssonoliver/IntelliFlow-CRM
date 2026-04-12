/**
 * Validation Cache Generator
 *
 * Runs all unique VALIDATE: commands from Sprint_plan.csv ONCE and caches
 * results to artifacts/coverage/validation-cache.json.
 *
 * The sprint audit tool reads from this cache instead of re-executing
 * commands per sprint/task — eliminating duplicate pnpm test/build/lint runs.
 *
 * Usage:
 *   npx tsx tools/scripts/run-validation-cache.ts            # Run all commands
 *   npx tsx tools/scripts/run-validation-cache.ts --check    # Check freshness only
 *   npx tsx tools/scripts/run-validation-cache.ts --ttl 24   # Set TTL in hours (default: 12)
 *
 * @module tools/scripts/run-validation-cache
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'child_process';
import { parse as parseCsv } from 'csv-parse/sync';
import { parseValidationCommands, executeCommand } from './lib/sprint-audit/validation-runner';

// =============================================================================
// Types
// =============================================================================

interface CachedCommandResult {
  exit_code: number;
  passed: boolean;
  duration_ms: number;
  stdout_hash: string;
  completed_at: string;
  error?: string;
}

interface ValidationCache {
  generated_at: string;
  repo_root: string;
  git_sha: string;
  git_branch: string;
  ttl_hours: number;
  commands: Record<string, CachedCommandResult>;
}

// =============================================================================
// Constants
// =============================================================================

const REPO_ROOT = path.resolve(process.cwd());
const CACHE_PATH = path.join(REPO_ROOT, 'artifacts', 'coverage', 'validation-cache.json');
const LOGS_DIR = path.join(REPO_ROOT, 'artifacts', 'coverage', 'validation-logs');
const CSV_PATH = path.join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

const DEFAULT_TTL_HOURS = 12;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes per command

// =============================================================================
// CSV Loading
// =============================================================================

function loadUniqueCommands(): Map<string, number> {
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const tasks: Record<string, string>[] = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const commandCounts = new Map<string, number>();

  for (const task of tasks) {
    const vm = task['Validation Method'] || '';
    const commands = parseValidationCommands(vm);
    for (const cmd of commands) {
      commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1);
    }
  }

  return commandCounts;
}

// =============================================================================
// Cache Management
// =============================================================================

function loadCache(): ValidationCache | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function isCacheFresh(cache: ValidationCache, ttlHours: number): boolean {
  const generatedAt = new Date(cache.generated_at).getTime();
  const now = Date.now();
  const ageHours = (now - generatedAt) / (1000 * 60 * 60);
  return ageHours < ttlHours;
}

function getCacheAge(cache: ValidationCache): string {
  const generatedAt = new Date(cache.generated_at).getTime();
  const ageMs = Date.now() - generatedAt;
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  const minutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function getGitInfo(): { sha: string; branch: string } {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT })
      .toString()
      .trim();
    return { sha, branch };
  } catch {
    return { sha: 'unknown', branch: 'unknown' };
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const ttlIndex = args.indexOf('--ttl');
  const ttlHours = ttlIndex >= 0 ? Number.parseInt(args[ttlIndex + 1], 10) : DEFAULT_TTL_HOURS;

  console.log(`\n${'='.repeat(60)}`);
  console.log('Validation Cache Generator');
  console.log(`${'='.repeat(60)}\n`);

  // Load unique commands from CSV
  const commandCounts = loadUniqueCommands();
  const commands = Array.from(commandCounts.keys()).sort(
    (a, b) => (commandCounts.get(b) || 0) - (commandCounts.get(a) || 0)
  );

  console.log(`Found ${commands.length} unique executable commands:`);
  for (const cmd of commands) {
    console.log(`  "${cmd}" → ${commandCounts.get(cmd)} task(s)`);
  }
  console.log('');

  // Check existing cache
  const existingCache = loadCache();
  if (existingCache) {
    const age = getCacheAge(existingCache);
    const fresh = isCacheFresh(existingCache, ttlHours);
    const cachedCommands = Object.keys(existingCache.commands).length;
    const passedCount = Object.values(existingCache.commands).filter((c) => c.passed).length;

    console.log(`Existing cache: ${age} old (TTL: ${ttlHours}h)`);
    console.log(`  Git: ${existingCache.git_sha} (${existingCache.git_branch})`);
    console.log(`  Commands: ${cachedCommands} cached, ${passedCount} passed`);
    console.log(`  Status: ${fresh ? 'FRESH' : 'STALE'}\n`);

    if (checkOnly) {
      // Show per-command status
      for (const cmd of commands) {
        const cached = existingCache.commands[cmd];
        if (cached) {
          const icon = cached.passed ? '✓' : '✗';
          console.log(`  ${icon} "${cmd}" — exit ${cached.exit_code} (${cached.duration_ms}ms)`);
        } else {
          console.log(`  ? "${cmd}" — not cached`);
        }
      }
      console.log('');
      process.exit(fresh ? 0 : 1);
    }

    if (fresh) {
      console.log('Cache is fresh — skipping re-run. Use --ttl 0 to force refresh.\n');
      process.exit(0);
    }
  } else if (checkOnly) {
    console.log('No cache found.\n');
    process.exit(1);
  }

  // Run all commands
  console.log('Running validation commands...\n');
  await fs.promises.mkdir(LOGS_DIR, { recursive: true });

  const git = getGitInfo();
  const results: Record<string, CachedCommandResult> = {};
  const startTime = Date.now();

  for (const cmd of commands) {
    console.log(`  [${Object.keys(results).length + 1}/${commands.length}] ${cmd}`);

    const result = await executeCommand(cmd, '_cache', REPO_ROOT, LOGS_DIR, DEFAULT_TIMEOUT_MS);

    results[cmd] = {
      exit_code: result.exitCode,
      passed: result.passed,
      duration_ms: result.durationMs,
      stdout_hash: result.stdoutHash,
      completed_at: new Date().toISOString(),
      ...(result.error ? { error: result.error } : {}),
    };

    const icon = result.passed ? '✓' : '✗';
    console.log(`    ${icon} exit ${result.exitCode} (${(result.durationMs / 1000).toFixed(1)}s)`);
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Write cache
  const cache: ValidationCache = {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    git_sha: git.sha,
    git_branch: git.branch,
    ttl_hours: ttlHours,
    commands: results,
  };

  await fs.promises.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.promises.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

  // Summary
  const passed = Object.values(results).filter((r) => r.passed).length;
  const failed = Object.values(results).filter((r) => !r.passed).length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Cache written: ${CACHE_PATH}`);
  console.log(`Git: ${git.sha} (${git.branch})`);
  console.log(`Commands: ${commands.length} total, ${passed} passed, ${failed} failed`);
  console.log(`Duration: ${totalDuration}s`);
  console.log(`TTL: ${ttlHours}h`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('Validation cache failed:', err);
  process.exit(1);
});
