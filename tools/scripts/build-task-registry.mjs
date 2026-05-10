/**
 * build-task-registry.mjs
 *
 * Re-derives apps/project-tracker/docs/metrics/_global/task-registry.json
 * from Sprint_plan.csv (status, sprint counts, owners) plus
 * .specify/sprints/**\/_summary.json (additional metrics).
 *
 * Matches the schema in tools/scripts/lib/schemas/task-registry.schema.ts.
 * Idempotent — safe to re-run.
 */

import {
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const METRICS_GLOBAL = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global'
);
const SPRINT_PLAN_CSV = join(METRICS_GLOBAL, 'Sprint_plan.csv');
const OUTPUT_PATH = join(METRICS_GLOBAL, 'task-registry.json');

// ── CSV Parsing ───────────────────────────────────────────────────────────────

/** Minimal CSV row parser — handles quoted fields with embedded commas */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function parseCSV(filePath) {
  const lines = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    lines.push(line);
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines
    .slice(1)
    .filter(l => l.trim().length > 0)
    .map(line => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').trim(); });
      return row;
    });
  return { headers, rows };
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(csvStatus) {
  const s = (csvStatus || '').trim();
  if (s === 'Done' || s === 'Completed') return 'DONE';
  if (s === 'In Progress') return 'IN_PROGRESS';
  if (s === 'Validating') return 'VALIDATING';
  if (s === 'Blocked') return 'BLOCKED';
  if (s === 'Planned') return 'PLANNED';
  if (s === 'Backlog') return 'BACKLOG';
  if (s === 'Failed') return 'FAILED';
  if (s === 'Needs Human') return 'NEEDS_HUMAN';
  if (s === 'In Review') return 'IN_REVIEW';
  return 'PLANNED';
}

function parseDeps(depsStr) {
  return (depsStr || '')
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0 && !/^(?:none|n\/a|-)$/i.test(d));
}

function parseArtifacts(artStr) {
  return (artStr || '')
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

// ── .specify/_summary.json aggregation ───────────────────────────────────────

function loadSpecifySummaries() {
  const specifyRoot = join(REPO_ROOT, '.specify', 'sprints');
  if (!existsSync(specifyRoot)) return {};
  const summaries = {};
  try {
    const sprintDirs = readdirSync(specifyRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const sprintDir of sprintDirs) {
      const summaryPath = join(specifyRoot, sprintDir, '_summary.json');
      if (existsSync(summaryPath)) {
        try {
          summaries[sprintDir] = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* .specify/sprints may not exist */ }
  return summaries;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('build-task-registry: reading Sprint_plan.csv...');

  if (!existsSync(SPRINT_PLAN_CSV)) {
    console.error(`build-task-registry: ERROR — ${SPRINT_PLAN_CSV} not found`);
    process.exit(1);
  }

  const { rows: tasks } = await parseCSV(SPRINT_PLAN_CSV);
  console.log(`build-task-registry: parsed ${tasks.length} tasks`);

  // Load .specify/_summary.json files for additional metrics
  const specifySummaries = loadSpecifySummaries();
  if (Object.keys(specifySummaries).length > 0) {
    console.log(`build-task-registry: loaded ${Object.keys(specifySummaries).length} sprint summaries from .specify/`);
  }

  // Load existing registry to preserve fields we don't derive (e.g., integration_status)
  let existingRegistry = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      existingRegistry = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Build tasks_by_status
  const tasksByStatus = {
    DONE: [],
    IN_PROGRESS: [],
    VALIDATING: [],
    BLOCKED: [],
    PLANNED: [],
    BACKLOG: [],
    FAILED: [],
    NEEDS_HUMAN: [],
    IN_REVIEW: [],
  };

  // Build task_details
  const taskDetails = {};

  // Compute sprint-level stats
  const sprintStats = {};

  for (const task of tasks) {
    const taskId = task['Task ID'];
    if (!taskId) continue;

    const status = mapStatus(task['Status']);
    tasksByStatus[status] = tasksByStatus[status] || [];
    tasksByStatus[status].push(taskId);

    const deps = parseDeps(task['CleanDependencies'] || task['Dependencies'] || '');
    const artifacts = parseArtifacts(task['Artifacts To Track'] || '');

    const sprintRaw = task['Target Sprint'];
    const sprint = sprintRaw === 'Continuous'
      ? -1
      : (parseInt(sprintRaw || '0', 10) || 0);

    // Merge with existing details to preserve runtime fields (integration_status etc.)
    const existingDetail = existingRegistry.task_details?.[taskId] || {};
    taskDetails[taskId] = {
      ...existingDetail,
      section: task['Section'] || existingDetail.section || '',
      description: task['Description'] || existingDetail.description || '',
      owner: task['Owner'] || existingDetail.owner || '',
      status,
      sprint,
      dependencies: deps,
      artifacts,
      kpis: task['KPIs'] || existingDetail.kpis || '',
      definition_of_done: task['Definition of Done'] || existingDetail.definition_of_done || '',
      validation: task['Validation Method'] || existingDetail.validation || '',
      prerequisites: task['Pre-requisites'] || existingDetail.prerequisites || '',
      cadence: task['Cadence'] || existingDetail.cadence || '',
    };

    // Aggregate sprint stats
    if (sprint >= 0) {
      const key = `sprint-${sprint}`;
      if (!sprintStats[key]) {
        sprintStats[key] = {
          total_tasks: 0,
          completed: 0,
          in_progress: 0,
          validating: 0,
          blocked: 0,
          planned: 0,
          backlog: 0,
          failed: 0,
          needs_human: 0,
          in_review: 0,
          not_started: 0,
          tasks: [],
        };
      }
      const ss = sprintStats[key];
      ss.total_tasks++;
      ss.tasks.push(taskId);
      const csvStatus = (task['Status'] || '').trim();
      if (csvStatus === 'Done' || csvStatus === 'Completed') ss.completed++;
      else if (csvStatus === 'In Progress') ss.in_progress++;
      else if (csvStatus === 'Validating') ss.validating++;
      else if (csvStatus === 'Blocked') ss.blocked++;
      else if (csvStatus === 'Planned') ss.planned++;
      else if (csvStatus === 'Backlog') ss.backlog++;
      else if (csvStatus === 'Failed') ss.failed++;
      else if (csvStatus === 'Needs Human') ss.needs_human++;
      else if (csvStatus === 'In Review') ss.in_review++;
      else ss.not_started++;
    }
  }

  // Merge .specify/_summary.json stats into sprint stats
  for (const [sprintKey, summary] of Object.entries(specifySummaries)) {
    if (!sprintStats[sprintKey]) continue;
    // Supplement with evidence count if available
    if (summary.tasks_with_evidence !== undefined) {
      sprintStats[sprintKey].tasks_with_evidence = summary.tasks_with_evidence;
    }
    if (summary.completion_rate !== undefined) {
      sprintStats[sprintKey].evidence_completion_rate = summary.completion_rate;
    }
  }

  // tasks_by_section
  const tasksBySection = {};
  for (const [id, detail] of Object.entries(taskDetails)) {
    const sec = detail.section || 'Other';
    if (!tasksBySection[sec]) tasksBySection[sec] = [];
    tasksBySection[sec].push(id);
  }

  // Derive active_sprint: lowest sprint with at least one non-DONE task
  let highestSprint = 0;
  const nonDoneSprints = new Set();
  for (const detail of Object.values(taskDetails)) {
    if (typeof detail.sprint === 'number' && detail.sprint >= 0) {
      if (detail.sprint > highestSprint) highestSprint = detail.sprint;
      if (detail.status !== 'DONE') nonDoneSprints.add(detail.sprint);
    }
  }
  const activeSprint = nonDoneSprints.size > 0
    ? Math.min(...nonDoneSprints)
    : highestSprint;

  // Merge existing sprints that may have extra data from prior runs
  const mergedSprints = { ...(existingRegistry.sprints || {}), ...sprintStats };

  const registry = {
    $schema: '../schemas/task-registry.schema.json',
    version: existingRegistry.version || '1.0.0',
    last_updated: new Date().toISOString(),
    total_tasks: tasks.length,
    active_sprint: `sprint-${activeSprint}`,
    current_sprint: activeSprint,
    sprints: mergedSprints,
    tasks_by_status: tasksByStatus,
    tasks_by_section: tasksBySection,
    task_details: taskDetails,
  };

  mkdirSync(METRICS_GLOBAL, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`build-task-registry: wrote ${OUTPUT_PATH}`);
  console.log(`  total tasks:   ${tasks.length}`);
  console.log(`  active sprint: sprint-${activeSprint}`);
  console.log(`  DONE:          ${tasksByStatus.DONE.length}`);
  console.log(`  IN_PROGRESS:   ${tasksByStatus.IN_PROGRESS.length}`);
  console.log(`  BLOCKED:       ${tasksByStatus.BLOCKED.length}`);
}

main().catch(err => {
  console.error('build-task-registry: fatal:', err);
  process.exit(1);
});
