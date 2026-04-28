/**
 * build-dependency-graph.mjs
 *
 * Re-derives apps/project-tracker/docs/metrics/_global/dependency-graph.json
 * from Sprint_plan.csv (Dependencies column drives the edges).
 *
 * Matches the schema in tools/scripts/lib/schemas/dependency-graph.schema.ts.
 * Idempotent — safe to re-run.
 */

import { createReadStream, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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
const OUTPUT_PATH = join(METRICS_GLOBAL, 'dependency-graph.json');

// ── CSV Parsing ───────────────────────────────────────────────────────────────

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
  const rows = lines.slice(1)
    .filter(l => l.trim().length > 0)
    .map(line => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = (values[i] || '').trim(); });
      return row;
    });
  return { headers, rows };
}

// ── Status + dep mapping ──────────────────────────────────────────────────────

function mapStatus(csvStatus) {
  const s = (csvStatus || '').trim().toLowerCase();
  if (s === 'done' || s === 'completed') return 'DONE';
  if (s === 'in progress' || s === 'validating') return 'IN_PROGRESS';
  if (s === 'blocked' || s === 'needs human') return 'BLOCKED';
  if (s === 'failed') return 'FAILED';
  if (s === 'backlog' || s === 'not started') return 'BACKLOG';
  if (s === 'in review') return 'IN_REVIEW';
  if (s === 'needs_human') return 'NEEDS_HUMAN';
  return 'PLANNED';
}

function parseDeps(depsStr) {
  return (depsStr || '')
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0 && !/^(?:none|n\/a|-)$/i.test(d));
}

// ── Graph construction ────────────────────────────────────────────────────────

function buildNodes(tasks) {
  const nodes = {};
  const statusMap = new Map();
  const sprintMap = new Map();

  for (const task of tasks) {
    const taskId = task['Task ID'];
    if (!taskId) continue;
    const status = mapStatus(task['Status']);
    const sprintRaw = task['Target Sprint'];
    const sprint = sprintRaw === 'Continuous' ? -1 : (parseInt(sprintRaw || '0', 10) || 0);
    const deps = parseDeps(task['CleanDependencies'] || task['Dependencies'] || '');
    statusMap.set(taskId, status);
    sprintMap.set(taskId, sprint);
    nodes[taskId] = { task_id: taskId, sprint, status, dependencies: deps, dependents: [] };
  }

  // Compute reverse edges (dependents)
  for (const [, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      if (nodes[depId]) {
        nodes[depId].dependents.push(node.task_id);
      }
    }
  }

  return { nodes, statusMap, sprintMap };
}

function classifyReadiness(nodes, statusMap) {
  const SKIP = new Set(['DONE', 'IN_PROGRESS', 'FAILED']);
  const ready_to_start = [];
  const blocked_tasks = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    if (SKIP.has(node.status)) continue;
    const allDepsDone = node.dependencies.every(depId => statusMap.get(depId) === 'DONE');
    if (allDepsDone && (node.status === 'PLANNED' || node.status === 'BACKLOG')) {
      ready_to_start.push(taskId);
    } else {
      blocked_tasks.push(taskId);
    }
  }

  const bySprintAsc = (a, b) => (nodes[a]?.sprint ?? 999) - (nodes[b]?.sprint ?? 999);
  ready_to_start.sort(bySprintAsc);
  blocked_tasks.sort(bySprintAsc);
  return { ready_to_start, blocked_tasks };
}

function computeCrossSprintDeps(nodes, sprintMap) {
  const result = [];
  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      const depSprint = sprintMap.get(depId);
      if (
        depSprint !== undefined &&
        depSprint !== node.sprint &&
        depSprint >= 0 &&
        node.sprint >= 0
      ) {
        result.push({
          from_task: depId,
          to_task: taskId,
          from_sprint: depSprint,
          to_sprint: node.sprint,
          dependency_type: 'REQUIRED',
        });
      }
    }
  }
  return result;
}

function computeParallelGroups(nodes) {
  const tasksBySprint = {};
  for (const [taskId, node] of Object.entries(nodes)) {
    if (node.sprint < 0) continue;
    if (!tasksBySprint[node.sprint]) tasksBySprint[node.sprint] = [];
    tasksBySprint[node.sprint].push(taskId);
  }

  const groups = {};
  for (const [sprintNum, taskIds] of Object.entries(tasksBySprint)) {
    const sprint = parseInt(sprintNum, 10);
    if (sprint < 0) continue;

    // Group tasks by their dependency set
    const depGroups = {};
    for (const taskId of taskIds) {
      const node = nodes[taskId];
      if (node.status === 'DONE') continue;
      const depKey = [...node.dependencies].sort().join(',') || 'no-deps';
      if (!depGroups[depKey]) depGroups[depKey] = [];
      depGroups[depKey].push(taskId);
    }

    const parallelGroups = {};
    let idx = 1;
    for (const [, list] of Object.entries(depGroups)) {
      if (list.length > 1) {
        parallelGroups[`group-${idx}`] = list;
        idx++;
      }
    }
    if (Object.keys(parallelGroups).length > 0) {
      groups[`sprint-${sprint}`] = parallelGroups;
    }
  }
  return groups;
}

function tracePathFrom(startId, nodes) {
  const path = [];
  const visited = new Set();
  function recurse(id) {
    if (visited.has(id)) return;
    visited.add(id);
    path.unshift(id);
    const node = nodes[id];
    if (node && node.dependencies.length > 0) {
      const first = node.dependencies.find(d => nodes[d]);
      if (first) recurse(first);
    }
  }
  recurse(startId);
  return path;
}

function computeCriticalPaths(nodes, statusMap) {
  const endTasks = Object.values(nodes).filter(
    n => n.dependents.length === 0 && n.status !== 'DONE'
  );
  const paths = [];
  for (const endNode of endTasks.slice(0, 5)) {
    const path = tracePathFrom(endNode.task_id, nodes);
    if (path.length <= 1) continue;
    const doneCount = path.filter(t => statusMap.get(t) === 'DONE').length;
    const pct = Math.round((doneCount / path.length) * 1000) / 10;
    const blocking = path.find(t => statusMap.get(t) !== 'DONE') ?? path[path.length - 1];
    paths.push({
      name: `Path to ${endNode.task_id}`,
      tasks: path,
      total_duration_estimate_minutes: path.length * 15,
      completion_percentage: pct,
      blocking_status: blocking,
    });
  }
  return paths;
}

function detectViolations(nodes) {
  const violations = [];
  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      if (!nodes[depId]) {
        violations.push({ task_id: taskId, violation: `Missing dependency: ${depId} does not exist` });
      }
    }
    if (node.dependencies.includes(taskId)) {
      violations.push({ task_id: taskId, violation: 'Self-referencing dependency' });
    }
  }
  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('build-dependency-graph: reading Sprint_plan.csv...');

  if (!existsSync(SPRINT_PLAN_CSV)) {
    console.error(`build-dependency-graph: ERROR — ${SPRINT_PLAN_CSV} not found`);
    process.exit(1);
  }

  const { rows: tasks } = await parseCSV(SPRINT_PLAN_CSV);
  console.log(`build-dependency-graph: parsed ${tasks.length} tasks`);

  const { nodes, statusMap, sprintMap } = buildNodes(tasks);
  const { ready_to_start, blocked_tasks } = classifyReadiness(nodes, statusMap);
  const cross_sprint_dependencies = computeCrossSprintDeps(nodes, sprintMap);
  const parallel_execution_groups = computeParallelGroups(nodes);
  const critical_paths = computeCriticalPaths(nodes, statusMap);
  const dependency_violations = detectViolations(nodes);

  const graph = {
    $schema: '../schemas/dependency-graph.schema.json',
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    description: 'Cross-sprint dependency tracking for all tasks',
    nodes,
    critical_paths,
    cross_sprint_dependencies,
    blocked_tasks,
    ready_to_start,
    dependency_violations,
    parallel_execution_groups,
  };

  mkdirSync(METRICS_GLOBAL, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 2), 'utf-8');

  console.log(`build-dependency-graph: wrote ${OUTPUT_PATH}`);
  console.log(`  total nodes:       ${Object.keys(nodes).length}`);
  console.log(`  ready to start:    ${ready_to_start.length}`);
  console.log(`  blocked:           ${blocked_tasks.length}`);
  console.log(`  cross-sprint deps: ${cross_sprint_dependencies.length}`);
  console.log(`  violations:        ${dependency_violations.length}`);
}

main().catch(err => {
  console.error('build-dependency-graph: fatal:', err);
  process.exit(1);
});
