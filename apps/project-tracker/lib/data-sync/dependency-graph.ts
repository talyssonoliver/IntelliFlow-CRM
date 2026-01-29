/**
 * Dependency Graph Operations
 */

import { join } from 'node:path';
import type { DependencyNode, CrossSprintDep, CriticalPath, TaskRecord } from './types';
import { mapCsvStatusToGraph, parseDependencies } from './csv-mapping';
import { writeJsonFile } from './file-io';

/**
 * Update dependency-graph.json with current task states
 */
export function updateDependencyGraph(tasks: TaskRecord[], metricsDir: string): void {
  const graphPath = join(metricsDir, '_global', 'dependency-graph.json');

  const nodes: Record<string, DependencyNode> = {};
  const taskStatusMap = new Map<string, string>();
  const taskSprintMap = new Map<string, number>();

  for (const task of tasks) {
    const taskId = task['Task ID'];
    if (!taskId) continue;

    const status = mapCsvStatusToGraph(task.Status || '');
    const sprintRaw = task['Target Sprint'];
    const sprint = sprintRaw === 'Continuous' ? -1 : parseInt(sprintRaw || '0', 10) || 0;

    const deps = parseDependencies(task.CleanDependencies || task.Dependencies || '');

    taskStatusMap.set(taskId, status);
    taskSprintMap.set(taskId, sprint);

    nodes[taskId] = {
      task_id: taskId,
      sprint,
      status,
      dependencies: deps,
      dependents: [],
    };
  }

  // Build dependents (reverse lookup)
  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      if (nodes[depId]) {
        nodes[depId].dependents.push(taskId);
      }
    }
  }

  // Compute ready_to_start and blocked_tasks
  const ready_to_start: string[] = [];
  const blocked_tasks: string[] = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    if (node.status === 'DONE' || node.status === 'IN_PROGRESS' || node.status === 'FAILED')
      continue;

    const allDepsComplete = node.dependencies.every((depId) => {
      const depStatus = taskStatusMap.get(depId);
      return depStatus === 'DONE';
    });

    if (allDepsComplete && (node.status === 'PLANNED' || node.status === 'BACKLOG')) {
      ready_to_start.push(taskId);
    } else {
      blocked_tasks.push(taskId);
    }
  }

  // Sort by sprint
  ready_to_start.sort((a, b) => (nodes[a]?.sprint ?? 999) - (nodes[b]?.sprint ?? 999));
  blocked_tasks.sort((a, b) => (nodes[a]?.sprint ?? 999) - (nodes[b]?.sprint ?? 999));

  // Compute cross-sprint dependencies
  const cross_sprint_dependencies = computeCrossSprintDeps(nodes, taskSprintMap);
  const parallel_execution_groups = computeParallelGroups(nodes);
  const critical_paths = computeCriticalPaths(nodes, taskStatusMap);
  const dependency_violations = detectDependencyViolations(nodes);

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

  writeJsonFile(graphPath, graph, 2);
}

/**
 * Compute cross-sprint dependencies
 */
function computeCrossSprintDeps(
  nodes: Record<string, DependencyNode>,
  taskSprintMap: Map<string, number>
): CrossSprintDep[] {
  const result: CrossSprintDep[] = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      const depSprint = taskSprintMap.get(depId);
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

/**
 * Compute parallel execution groups
 */
export function computeParallelGroups(
  nodes: Record<string, DependencyNode>
): Record<string, Record<string, string[]>> {
  const groups: Record<string, Record<string, string[]>> = {};

  const tasksBySprint: Record<number, string[]> = {};
  for (const [taskId, node] of Object.entries(nodes)) {
    if (node.sprint < 0) continue;
    if (!tasksBySprint[node.sprint]) {
      tasksBySprint[node.sprint] = [];
    }
    tasksBySprint[node.sprint].push(taskId);
  }

  for (const [sprintNum, taskIds] of Object.entries(tasksBySprint)) {
    const sprint = parseInt(sprintNum, 10);
    if (sprint < 0) continue;

    const depGroups: Record<string, string[]> = {};
    for (const taskId of taskIds) {
      const node = nodes[taskId];
      if (node.status !== 'DONE') {
        const depKey = node.dependencies.sort().join(',') || 'no-deps';
        if (!depGroups[depKey]) {
          depGroups[depKey] = [];
        }
        depGroups[depKey].push(taskId);
      }
    }

    const parallelGroups: Record<string, string[]> = {};
    let groupIndex = 1;
    for (const [, taskList] of Object.entries(depGroups)) {
      if (taskList.length > 1) {
        parallelGroups[`group-${groupIndex}`] = taskList;
        groupIndex++;
      }
    }

    if (Object.keys(parallelGroups).length > 0) {
      groups[`sprint-${sprint}`] = parallelGroups;
    }
  }

  return groups;
}

/**
 * Compute critical paths
 */
export function computeCriticalPaths(
  nodes: Record<string, DependencyNode>,
  taskStatusMap: Map<string, string>
): CriticalPath[] {
  const paths: CriticalPath[] = [];

  const endTasks = Object.values(nodes).filter(
    (n) => n.dependents.length === 0 && n.status !== 'DONE'
  );

  for (const endNode of endTasks.slice(0, 5)) {
    const path: string[] = [];
    const visited = new Set<string>();

    const tracePath = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      path.unshift(taskId);

      const node = nodes[taskId];
      if (node && node.dependencies.length > 0) {
        const firstDep = node.dependencies.find((d) => nodes[d]);
        if (firstDep) {
          tracePath(firstDep);
        }
      }
    };

    tracePath(endNode.task_id);

    if (path.length > 1) {
      const doneCount = path.filter((t) => taskStatusMap.get(t) === 'DONE').length;
      const completionPct = (doneCount / path.length) * 100;
      const blockingTask =
        path.find((t) => taskStatusMap.get(t) !== 'DONE') || path[path.length - 1];

      paths.push({
        name: `Path to ${endNode.task_id}`,
        tasks: path,
        total_duration_estimate_minutes: path.length * 15,
        completion_percentage: Math.round(completionPct * 10) / 10,
        blocking_status: blockingTask,
      });
    }
  }

  return paths;
}

/**
 * Detect dependency violations
 */
export function detectDependencyViolations(
  nodes: Record<string, DependencyNode>
): Array<{ task_id: string; violation: string }> {
  const violations: Array<{ task_id: string; violation: string }> = [];

  for (const [taskId, node] of Object.entries(nodes)) {
    for (const depId of node.dependencies) {
      if (!nodes[depId]) {
        violations.push({
          task_id: taskId,
          violation: `Missing dependency: ${depId} does not exist`,
        });
      }
    }

    if (node.dependencies.includes(taskId)) {
      violations.push({
        task_id: taskId,
        violation: 'Self-referencing dependency',
      });
    }
  }

  return violations;
}
