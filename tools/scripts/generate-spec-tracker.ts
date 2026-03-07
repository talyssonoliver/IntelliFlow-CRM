/**
 * Generate spec-tracker.json from live filesystem data
 *
 * Cross-references spec files, attestations, plans, CSV status, and metric JSONs
 * to determine which tasks are truly completed.
 *
 * Usage: npx tsx tools/scripts/generate-spec-tracker.ts
 *
 * Also called by the sync pipeline (orchestrator.ts) to keep spec-tracker.json
 * current whenever metrics are synced.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import {
  findRepoRoot,
  writeJsonFile,
  findTaskFile,
} from '../../apps/project-tracker/lib/data-sync/file-io';
import { parseDependencies } from '../../apps/project-tracker/lib/data-sync/csv-mapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CsvRow {
  taskId: string;
  title: string;
  sprint: number;
  status: string;
  percent: number;
  dependencies: string[];
}

interface TaskArtifacts {
  specs: string[];
  plans: string[];
  attestDirs: string[];
  sprint: number;
}

interface AttestationResult {
  verdict: string;
  variant: 'attestation' | 'context_ack' | 'validation' | 'none';
}

interface CheckboxCount {
  checked: number;
  unchecked: number;
  ratio: number;
}

interface TaskEntry {
  task_id: string;
  title: string;
  sprint: number;
  spec_path: string | null;
  has_spec: boolean;
  has_plan: boolean;
  has_attestation: boolean;
  csv_status: string;
  metric_status: string;
  acceptance_criteria_count: number;
  dependencies: string[];
  real_status: string;
}

interface Issue {
  task_id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  recommendation: string;
}

interface SpecTrackerOutput {
  generated_at: string;
  description: string;
  summary: {
    total_specs_analyzed: number;
    completed: number;
    partially_done: number;
    spec_only: number;
    uncertain: number;
  };
  status_legend: Record<string, string>;
  issues: Issue[];
  tasks: TaskEntry[];
}

interface GenerateOptions {
  repoRoot?: string;
  writeOutput?: boolean;
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseCsv(csvPath: string): Map<string, CsvRow> {
  const content = readFileSync(csvPath, 'utf-8');
  const { data } = Papa.parse(content, { header: true, skipEmptyLines: true });
  const map = new Map<string, CsvRow>();

  for (const raw of data as Record<string, string>[]) {
    const taskId = (raw['Task ID'] || '').trim();
    if (!taskId) continue;

    // Strip "PHASE-NNN:" prefix from description
    const rawTitle = (raw['Description'] || '').trim();
    const title = rawTitle.replace(/^PHASE-\d+:\s*/, '');

    const sprintStr = (raw['Target Sprint'] || '0').trim();
    const sprint = parseInt(sprintStr, 10) || 0;

    const status = (raw['Status'] || 'Backlog').trim();

    const percentStr = (raw['Percent Complete'] || '0').replace('%', '').trim();
    const percent = parseInt(percentStr, 10) || 0;

    const depsStr = raw['Dependencies'] || raw['CleanDependencies'] || '';
    const dependencies = parseDependencies(depsStr);

    map.set(taskId, { taskId, title, sprint, status, percent, dependencies });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Filesystem Scanning
// ---------------------------------------------------------------------------

export function scanSpecifyDirectory(specifyDir: string): Map<string, TaskArtifacts> {
  const result = new Map<string, TaskArtifacts>();
  const sprintsDir = join(specifyDir, 'sprints');

  if (!existsSync(sprintsDir)) return result;

  const sprintDirs = readdirSync(sprintsDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && /^sprint-\d+$/.test(d.name)
  );

  for (const sprintDir of sprintDirs) {
    const sprintNum = parseInt(sprintDir.name.replace('sprint-', ''), 10);
    const sprintPath = join(sprintsDir, sprintDir.name);

    // Scan specifications
    const specsDir = join(sprintPath, 'specifications');
    if (existsSync(specsDir)) {
      const specFiles = readdirSync(specsDir).filter((f) => f.endsWith('-spec.md'));
      for (const specFile of specFiles) {
        const taskId = specFile.replace(/-spec\.md$/, '');
        if (!result.has(taskId)) {
          result.set(taskId, { specs: [], plans: [], attestDirs: [], sprint: sprintNum });
        }
        const entry = result.get(taskId)!;
        entry.specs.push(join(specsDir, specFile));
      }
    }

    // Scan planning
    const planDir = join(sprintPath, 'planning');
    if (existsSync(planDir)) {
      const planFiles = readdirSync(planDir).filter((f) => f.endsWith('-plan.md'));
      for (const planFile of planFiles) {
        const taskId = planFile.replace(/-plan\.md$/, '');
        if (!result.has(taskId)) {
          result.set(taskId, { specs: [], plans: [], attestDirs: [], sprint: sprintNum });
        }
        result.get(taskId)!.plans.push(join(planDir, planFile));
      }
    }

    // Scan attestations
    const attestDir = join(sprintPath, 'attestations');
    if (existsSync(attestDir)) {
      const taskDirs = readdirSync(attestDir, { withFileTypes: true }).filter((d) =>
        d.isDirectory()
      );
      for (const taskDir of taskDirs) {
        const taskId = taskDir.name;
        if (!result.has(taskId)) {
          result.set(taskId, { specs: [], plans: [], attestDirs: [], sprint: sprintNum });
        }
        result.get(taskId)!.attestDirs.push(join(attestDir, taskDir.name));
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Attestation Reading
// ---------------------------------------------------------------------------

export function readAttestationVerdict(attestDirs: string[], taskId: string): AttestationResult {
  for (const dir of attestDirs) {
    // Variant D: attestation.json (newer format)
    const attestPath = join(dir, 'attestation.json');
    if (existsSync(attestPath)) {
      try {
        const data = JSON.parse(readFileSync(attestPath, 'utf-8'));
        return { verdict: data.verdict || 'UNKNOWN', variant: 'attestation' };
      } catch {
        /* skip malformed */
      }
    }

    // Also try {TASK_ID}-attestation.json
    const prefixedAttestPath = join(dir, `${taskId}-attestation.json`);
    if (existsSync(prefixedAttestPath)) {
      try {
        const data = JSON.parse(readFileSync(prefixedAttestPath, 'utf-8'));
        return { verdict: data.verdict || 'UNKNOWN', variant: 'attestation' };
      } catch {
        /* skip malformed */
      }
    }

    // Variant B/C: context_ack.json
    const ctxAckPath = join(dir, `${taskId}-context_ack.json`);
    if (existsSync(ctxAckPath)) {
      try {
        const data = JSON.parse(readFileSync(ctxAckPath, 'utf-8'));
        return { verdict: data.verdict || 'UNKNOWN', variant: 'context_ack' };
      } catch {
        /* skip malformed */
      }
    }

    // Also try context_ack.json without prefix
    const bareCtxAck = join(dir, 'context_ack.json');
    if (existsSync(bareCtxAck)) {
      try {
        const data = JSON.parse(readFileSync(bareCtxAck, 'utf-8'));
        return { verdict: data.verdict || 'UNKNOWN', variant: 'context_ack' };
      } catch {
        /* skip malformed */
      }
    }

    // Variant A: validation.json
    const valPath = join(dir, `${taskId}-validation.json`);
    if (existsSync(valPath)) {
      try {
        const data = JSON.parse(readFileSync(valPath, 'utf-8'));
        // validation.json uses passed/failed booleans
        const passed = data.passed !== undefined ? !data.failed : false;
        return { verdict: passed ? 'PASS' : 'INCOMPLETE', variant: 'validation' };
      } catch {
        /* skip malformed */
      }
    }

    const bareValPath = join(dir, 'validation.json');
    if (existsSync(bareValPath)) {
      try {
        const data = JSON.parse(readFileSync(bareValPath, 'utf-8'));
        const passed = data.passed !== undefined ? !data.failed : false;
        return { verdict: passed ? 'PASS' : 'INCOMPLETE', variant: 'validation' };
      } catch {
        /* skip malformed */
      }
    }
  }

  return { verdict: 'NONE', variant: 'none' };
}

// ---------------------------------------------------------------------------
// Plan Checkbox Counting
// ---------------------------------------------------------------------------

export function countPlanCheckboxes(planPath: string): CheckboxCount {
  if (!existsSync(planPath)) return { checked: 0, unchecked: 0, ratio: 0 };

  const content = readFileSync(planPath, 'utf-8');
  const checked = (content.match(/- \[x\]/gi) || []).length;
  const unchecked = (content.match(/- \[ \]/g) || []).length;
  const total = checked + unchecked;

  return {
    checked,
    unchecked,
    ratio: total > 0 ? checked / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Acceptance Criteria Counting
// ---------------------------------------------------------------------------

function countAcceptanceCriteria(specPath: string): number {
  if (!existsSync(specPath)) return 0;

  const content = readFileSync(specPath, 'utf-8');

  // Find the Acceptance Criteria section
  const acMatch = content.match(/##\s*Acceptance\s*Criteria\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (!acMatch) return 0;

  const acSection = acMatch[1];
  // Count checkbox items (both checked and unchecked)
  const items = acSection.match(/- \[[ x]\]/gi) || [];
  return items.length;
}

// ---------------------------------------------------------------------------
// Metric JSON Lookup
// ---------------------------------------------------------------------------

function lookupMetricStatus(taskId: string, metricsDir: string): string {
  const taskFile = findTaskFile(taskId, metricsDir);
  if (!taskFile) return 'NOT_FOUND';

  try {
    const data = JSON.parse(readFileSync(taskFile, 'utf-8'));
    return data.status || 'NOT_FOUND';
  } catch {
    return 'NOT_FOUND';
  }
}

// ---------------------------------------------------------------------------
// Status Determination
// ---------------------------------------------------------------------------

export function determineRealStatus(signals: {
  csvStatus: string;
  csvPercent: number;
  attestVerdict: string;
  attestVariant: string;
  metricStatus: string;
  planRatio: number;
  hasSpec: boolean;
  hasPlan: boolean;
  hasAttestation: boolean;
}): string {
  const csvCompleted = signals.csvStatus === 'Completed' || signals.csvStatus === 'Done';
  const attestComplete = signals.attestVerdict === 'COMPLETE' || signals.attestVerdict === 'PASS';
  const metricDone = signals.metricStatus === 'DONE' || signals.metricStatus === 'Completed';

  // COMPLETED: CSV=Completed AND (attestation=COMPLETE/PASS OR metric=DONE)
  if (csvCompleted && (attestComplete || metricDone)) {
    return 'COMPLETED';
  }

  // UNCERTAIN: CSV=Completed but no attestation and no metric evidence
  if (csvCompleted && !attestComplete && !metricDone) {
    return 'UNCERTAIN';
  }

  // UNCERTAIN: attestation=COMPLETE but CSV disagrees
  if (attestComplete && !csvCompleted) {
    return 'UNCERTAIN';
  }

  // PARTIALLY_DONE: has attestation with non-COMPLETE verdict
  if (signals.hasAttestation && !attestComplete && signals.attestVerdict !== 'NONE') {
    return 'PARTIALLY_DONE';
  }

  // PARTIALLY_DONE: plan checkboxes partially checked
  if (signals.hasPlan && signals.planRatio > 0 && signals.planRatio < 1) {
    return 'PARTIALLY_DONE';
  }

  // SPEC_ONLY: has spec only, no plan/attestation, CSV=Backlog
  if (signals.hasSpec && !signals.hasAttestation) {
    const csvBacklog =
      signals.csvStatus === 'Backlog' ||
      signals.csvStatus === 'Planned' ||
      signals.csvStatus === 'Not Started';
    if (csvBacklog) {
      return 'SPEC_ONLY';
    }
  }

  // If none of the above, fall through based on CSV
  if (csvCompleted) return 'UNCERTAIN';
  if (signals.csvStatus === 'In Progress' || signals.csvStatus === 'Validating')
    return 'PARTIALLY_DONE';

  return 'SPEC_ONLY';
}

// ---------------------------------------------------------------------------
// Issue Detection
// ---------------------------------------------------------------------------

export function detectIssues(tasks: TaskEntry[], csvMap: Map<string, CsvRow>): Issue[] {
  const issues: Issue[] = [];

  for (const task of tasks) {
    const csv = csvMap.get(task.task_id);
    const csvCompleted = task.csv_status === 'Completed' || task.csv_status === 'Done';
    const metricDone = task.metric_status === 'DONE' || task.metric_status === 'Completed';

    // PHANTOM_COMPLETION: CSV=Completed, no attestation, metric != DONE
    if (csvCompleted && !task.has_attestation && !metricDone) {
      issues.push({
        task_id: task.task_id,
        severity: 'HIGH',
        issue: `CSV says Completed but NO attestation file exists and metric status is ${task.metric_status}. Task may not be truly implemented.`,
        recommendation:
          'Verify actual codebase for implementation. Run /exec or /matop-execute to generate proper attestation.',
      });
    }

    // INCOMPLETE_ATTESTATION: CSV=Completed, attestation != COMPLETE/PASS
    if (csvCompleted && task.has_attestation && task.real_status !== 'COMPLETED') {
      issues.push({
        task_id: task.task_id,
        severity: 'HIGH',
        issue: `CSV says Completed but attestation verdict does not confirm completion. Real status: ${task.real_status}.`,
        recommendation: 'Investigate attestation evidence. Re-run validation if needed.',
      });
    }

    // CSV_MISMATCH: attestation=COMPLETE but CSV percent < 100
    if (task.has_attestation && task.real_status === 'COMPLETED' && csv && csv.percent < 100) {
      // Only flag if CSV is not already at 100%
      issues.push({
        task_id: task.task_id,
        severity: 'MEDIUM',
        issue: `Attestation confirms completion but CSV shows only ${csv.percent}% complete. Likely a CSV update lag.`,
        recommendation: 'Update CSV to 100% to match attestation and metric evidence.',
      });
    }

    // PLANNING_ONLY_ATTESTATION: context_ack from spec-session only, CSV=Backlog
    if (task.has_attestation && !csvCompleted) {
      const csvBacklog = task.csv_status === 'Backlog' || task.csv_status === 'Planned';
      if (csvBacklog && task.real_status !== 'COMPLETED') {
        issues.push({
          task_id: task.task_id,
          severity: 'MEDIUM',
          issue: `Has attestation directory but CSV status is ${task.csv_status}. Attestation may be from planning phase only.`,
          recommendation: `Run /exec ${task.task_id} when ready for implementation.`,
        });
      }
    }

    // CROSS_SPRINT_SPEC: spec in different sprint than CSV Target Sprint
    if (csv && task.has_spec && task.sprint !== csv.sprint && csv.sprint > 0) {
      issues.push({
        task_id: task.task_id,
        severity: 'LOW',
        issue: `Spec found in sprint-${task.sprint} but CSV Target Sprint is ${csv.sprint}. Cross-sprint spec placement.`,
        recommendation: 'Verify this is intentional (e.g., spec drafted early, executed later).',
      });
    }

    // ORPHANED_SPEC: spec exists but task not in CSV
    if (task.has_spec && !csv) {
      issues.push({
        task_id: task.task_id,
        severity: 'LOW',
        issue: 'Spec exists in .specify/ but task ID not found in Sprint_plan.csv.',
        recommendation: 'Verify if task was renamed, merged, or removed from the CSV.',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export function generateSpecTracker(opts?: GenerateOptions): SpecTrackerOutput {
  const repoRoot =
    opts?.repoRoot || findRepoRoot(dirname(fileURLToPath(import.meta.url))) || process.cwd();
  const writeOutput = opts?.writeOutput ?? true;

  // 1. Parse CSV
  const csvPath = join(
    repoRoot,
    'apps',
    'project-tracker',
    'docs',
    'metrics',
    '_global',
    'Sprint_plan.csv'
  );
  if (!existsSync(csvPath)) {
    throw new Error(`Sprint_plan.csv not found at ${csvPath}`);
  }
  const csvMap = parseCsv(csvPath);

  // 2. Scan .specify/sprints/
  const specifyDir = join(repoRoot, '.specify');
  const artifactMap = scanSpecifyDirectory(specifyDir);

  // 3. Metrics dir
  const metricsDir = join(repoRoot, 'apps', 'project-tracker', 'docs', 'metrics');

  // 4. Cross-reference: build task entries
  // Collect all task IDs that have at least one artifact OR are in CSV
  const allTaskIds = new Set<string>();
  for (const taskId of artifactMap.keys()) {
    allTaskIds.add(taskId);
  }
  // Also add CSV tasks that might not have artifacts but are tracked
  // (We only include CSV tasks if they have corresponding spec artifacts)

  const taskEntries: TaskEntry[] = [];

  for (const taskId of allTaskIds) {
    const artifacts = artifactMap.get(taskId)!;
    const csv = csvMap.get(taskId);

    const hasSpec = artifacts.specs.length > 0;
    const hasPlan = artifacts.plans.length > 0;
    const hasAttestation = artifacts.attestDirs.length > 0;

    // Skip tasks with no spec (attestation-only dirs with no real artifacts)
    // unless they have plans or attestations worth tracking
    if (!hasSpec && !hasPlan && !hasAttestation) continue;

    // Get attestation verdict
    const attestResult = readAttestationVerdict(artifacts.attestDirs, taskId);

    // Count plan checkboxes (use first plan found)
    const planCheckboxes = hasPlan
      ? countPlanCheckboxes(artifacts.plans[0])
      : { checked: 0, unchecked: 0, ratio: 0 };

    // Count acceptance criteria (use first spec found)
    const acCount = hasSpec ? countAcceptanceCriteria(artifacts.specs[0]) : 0;

    // Look up metric status
    const metricStatus = lookupMetricStatus(taskId, metricsDir);

    // Determine sprint (prefer CSV, fallback to filesystem)
    const sprint = csv?.sprint ?? artifacts.sprint;

    // Determine status
    const realStatus = determineRealStatus({
      csvStatus: csv?.status || 'Backlog',
      csvPercent: csv?.percent || 0,
      attestVerdict: attestResult.verdict,
      attestVariant: attestResult.variant,
      metricStatus,
      planRatio: planCheckboxes.ratio,
      hasSpec,
      hasPlan,
      hasAttestation: hasAttestation && attestResult.variant !== 'none',
    });

    // Build spec_path relative to repo root
    const specPath = hasSpec
      ? artifacts.specs[0]
          .replace(repoRoot + '\\', '')
          .replace(repoRoot + '/', '')
          .replace(/\\/g, '/')
      : null;

    taskEntries.push({
      task_id: taskId,
      title: csv?.title || taskId,
      sprint,
      spec_path: specPath,
      has_spec: hasSpec,
      has_plan: hasPlan,
      has_attestation: hasAttestation && attestResult.variant !== 'none',
      csv_status: csv?.status || 'NOT_IN_CSV',
      metric_status: metricStatus,
      acceptance_criteria_count: acCount,
      dependencies: csv?.dependencies || [],
      real_status: realStatus,
    });
  }

  // Sort by task_id for stable output
  taskEntries.sort((a, b) => {
    // Sort by prefix, then by number
    const aMatch = a.task_id.match(/^(.+?)-(\d+)(-[A-Z]+)?$/);
    const bMatch = b.task_id.match(/^(.+?)-(\d+)(-[A-Z]+)?$/);
    if (aMatch && bMatch) {
      if (aMatch[1] !== bMatch[1]) return aMatch[1].localeCompare(bMatch[1]);
      return parseInt(aMatch[2], 10) - parseInt(bMatch[2], 10);
    }
    return a.task_id.localeCompare(b.task_id);
  });

  // 5. Detect issues
  const issues = detectIssues(taskEntries, csvMap);

  // 6. Build summary
  const summary = {
    total_specs_analyzed: taskEntries.length,
    completed: taskEntries.filter((t) => t.real_status === 'COMPLETED').length,
    partially_done: taskEntries.filter((t) => t.real_status === 'PARTIALLY_DONE').length,
    spec_only: taskEntries.filter((t) => t.real_status === 'SPEC_ONLY').length,
    uncertain: taskEntries.filter((t) => t.real_status === 'UNCERTAIN').length,
  };

  const output: SpecTrackerOutput = {
    generated_at: new Date().toISOString(),
    description:
      'Consolidated spec tracker — cross-references spec files, attestations, plans, metric JSONs, and CSV status to determine real completion status of all specified tasks.',
    summary,
    status_legend: {
      COMPLETED:
        'All evidence confirms task is done: attestation present, CSV=Completed, plan checkboxes done',
      PARTIALLY_DONE:
        'Some evidence of completion but gaps identified (missing attestation, failing tests, unwired code)',
      SPEC_ONLY:
        'Spec exists but no execution evidence (no attestation, no plan completion, CSV=Backlog)',
      UNCERTAIN: 'Conflicting signals between evidence sources',
    },
    issues,
    tasks: taskEntries,
  };

  // 7. Write output
  if (writeOutput) {
    const outputPath = join(repoRoot, 'artifacts', 'reports', 'spec-tracker.json');
    writeJsonFile(outputPath, output);
    console.log(`spec-tracker.json generated: ${summary.total_specs_analyzed} tasks analyzed`);
    console.log(
      `  COMPLETED: ${summary.completed}, PARTIALLY_DONE: ${summary.partially_done}, ` +
        `SPEC_ONLY: ${summary.spec_only}, UNCERTAIN: ${summary.uncertain}`
    );
    console.log(`  Issues detected: ${issues.length}`);
  }

  return output;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] &&
  (process.argv[1] === __filename ||
    process.argv[1].replace(/\\/g, '/') === __filename.replace(/\\/g, '/'));

if (isMainModule) {
  try {
    generateSpecTracker();
  } catch (err) {
    console.error(
      'Failed to generate spec-tracker.json:',
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
}
