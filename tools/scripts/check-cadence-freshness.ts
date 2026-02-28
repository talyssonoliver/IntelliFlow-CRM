/**
 * Cadence Freshness Checker
 *
 * Checks continuous tasks for stale artifacts based on their cadence thresholds.
 * Follows the pattern of detect-phantom-completions.ts.
 *
 * Exit code: always 0 (informational only, not a gate).
 * Output: artifacts/reports/cadence-freshness-report.json
 */

import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(
  __dirname,
  '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);
const OUTPUT_PATH = join(
  __dirname,
  '../../artifacts/reports/cadence-freshness-report.json'
);

// ============================================================================
// TYPES
// ============================================================================

interface ArtifactFreshness {
  path: string;
  last_modified: string | null;
  age_days: number | null;
  threshold_days: number;
  status: 'fresh' | 'stale' | 'missing';
}

interface TaskFreshness {
  task_id: string;
  description: string;
  cadence: string;
  threshold_days: number;
  status: 'fresh' | 'stale' | 'missing';
  artifacts: ArtifactFreshness[];
}

interface FreshnessReport {
  audit_metadata: {
    generated_at: string;
    audit_type: string;
    continuous_tasks_checked: number;
  };
  summary: {
    total: number;
    fresh: number;
    stale: number;
    missing: number;
    freshness_score: string;
  };
  tasks: TaskFreshness[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse cadence string like "weekly:7d" into threshold days.
 */
function parseCadenceThreshold(cadence: string): number {
  const match = cadence.match(/:(\d+)d$/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

/**
 * Parse artifact paths from the "Artifacts To Track" column.
 * Only extracts ARTIFACT: prefixed paths — EVIDENCE: paths are one-time
 * attestation files that should NOT be checked for freshness.
 */
function parseArtifacts(artifactStr: string): string[] {
  if (!artifactStr) return [];

  return artifactStr
    .split(';')
    .flatMap((part) => {
      const match = part.match(/^ARTIFACT:(.+)/);
      if (match) return [match[1].trim()];
      return [];
    })
    .filter((p) => p && !p.includes('*'));
}

/**
 * Check artifact freshness against threshold.
 */
function checkArtifactFreshness(
  artifactPath: string,
  thresholdDays: number
): ArtifactFreshness {
  const fullPath = join(process.cwd(), artifactPath);

  try {
    const stats = statSync(fullPath);
    const now = new Date();
    const mtime = stats.mtime;
    const ageDays = Math.floor(
      (now.getTime() - mtime.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      path: artifactPath,
      last_modified: mtime.toISOString(),
      age_days: ageDays,
      threshold_days: thresholdDays,
      status: ageDays <= thresholdDays ? 'fresh' : 'stale',
    };
  } catch {
    return {
      path: artifactPath,
      last_modified: null,
      age_days: null,
      threshold_days: thresholdDays,
      status: 'missing',
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('=== Cadence Freshness Check ===\n');

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const tasks = parse(csvContent, {
    columns: true,
    bom: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  // Filter to continuous tasks with cadence values that are completed
  const continuousTasks = tasks.filter(
    (t) =>
      t['Cadence'] &&
      t['Cadence'].trim() !== '' &&
      t['Status']?.toLowerCase() === 'completed'
  );

  console.log(`Total tasks: ${tasks.length}`);
  console.log(`Continuous tasks with cadence: ${continuousTasks.length}\n`);

  const taskResults: TaskFreshness[] = [];

  for (const task of continuousTasks) {
    const taskId = task['Task ID'] || '';
    const description = task['Description'] || '';
    const cadence = task['Cadence'] || '';
    const thresholdDays = parseCadenceThreshold(cadence);
    const artifactPaths = parseArtifacts(task['Artifacts To Track'] || '');

    const artifactResults = artifactPaths.map((p) =>
      checkArtifactFreshness(p, thresholdDays)
    );

    // Task is stale if ANY artifact is stale or missing
    let taskStatus: 'fresh' | 'stale' | 'missing' = 'fresh';
    if (artifactResults.some((a) => a.status === 'missing')) {
      taskStatus = 'missing';
    } else if (artifactResults.some((a) => a.status === 'stale')) {
      taskStatus = 'stale';
    }

    console.log(
      `[${taskId}] ${cadence} → ${taskStatus} (${artifactResults.length} artifacts)`
    );

    taskResults.push({
      task_id: taskId,
      description: description.substring(0, 80),
      cadence,
      threshold_days: thresholdDays,
      status: taskStatus,
      artifacts: artifactResults,
    });
  }

  // Summarize
  const total = taskResults.length;
  const fresh = taskResults.filter((t) => t.status === 'fresh').length;
  const stale = taskResults.filter((t) => t.status === 'stale').length;
  const missing = taskResults.filter((t) => t.status === 'missing').length;
  const freshnessPct = total > 0 ? Math.round((fresh / total) * 100) : 100;

  const report: FreshnessReport = {
    audit_metadata: {
      generated_at: new Date().toISOString(),
      audit_type: 'CADENCE_FRESHNESS_CHECK',
      continuous_tasks_checked: total,
    },
    summary: {
      total,
      fresh,
      stale,
      missing,
      freshness_score: `${freshnessPct}%`,
    },
    tasks: taskResults,
  };

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Fresh: ${fresh}/${total}`);
  console.log(`Stale: ${stale}/${total}`);
  console.log(`Missing: ${missing}/${total}`);
  console.log(`Freshness score: ${freshnessPct}%`);
  console.log(`\nReport written to: ${OUTPUT_PATH}`);
}

main();
