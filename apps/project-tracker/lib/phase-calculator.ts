/**
 * Phase Calculator
 *
 * Computes execution phases from dependency graph using topological sorting.
 * Identifies parallel streams within each phase for concurrent execution.
 */

import type {
  ExecutionPhase,
  TaskPhaseEntry,
  ParallelStream,
  CSVTask,
} from '../../../tools/scripts/lib/sprint/types';

interface DependencyNode {
  task_id: string;
  sprint: number;
  status: string;
  dependencies: string[];
  dependents: string[];
}

interface DependencyGraph {
  nodes: Record<string, DependencyNode>;
  ready_to_start: string[];
  blocked_tasks: string[];
}

/**
 * Compute the phase number for a task using topological sort (recursive, memoised).
 * Extracted from calculatePhases to reduce cognitive complexity.
 */
function computeTaskPhase(
  taskId: string,
  visited: Set<string>,
  phaseAssignment: Map<string, number>,
  dependencyGraph: DependencyGraph,
  taskIds: Set<string>,
  includeAll: boolean,
  sprintNumber: number | 'all'
): number {
  if (phaseAssignment.has(taskId)) {
    return phaseAssignment.get(taskId)!;
  }
  if (visited.has(taskId)) {
    console.warn(`Circular dependency detected involving: ${taskId}`);
    return 0;
  }
  visited.add(taskId);

  const node = dependencyGraph.nodes[taskId];
  if (!node) {
    phaseAssignment.set(taskId, 0);
    return 0;
  }

  const sprintDeps = node.dependencies.filter((depId) =>
    isRelevantDependency(depId, taskIds, includeAll, sprintNumber, dependencyGraph)
  );

  if (sprintDeps.length === 0) {
    phaseAssignment.set(taskId, 0);
    return 0;
  }

  let maxDepPhase = -1;
  for (const depId of sprintDeps) {
    const depPhase = computeTaskPhase(
      depId,
      new Set(visited),
      phaseAssignment,
      dependencyGraph,
      taskIds,
      includeAll,
      sprintNumber
    );
    maxDepPhase = Math.max(maxDepPhase, depPhase);
  }

  const phase = maxDepPhase + 1;
  phaseAssignment.set(taskId, phase);
  return phase;
}

function isRelevantDependency(
  depId: string,
  taskIds: Set<string>,
  includeAll: boolean,
  sprintNumber: number | 'all',
  dependencyGraph: DependencyGraph
): boolean {
  const depNode = dependencyGraph.nodes[depId];
  if (!depNode) return false;
  if (taskIds.has(depId)) return true;
  if (!includeAll && typeof sprintNumber === 'number') {
    if (depNode.sprint < sprintNumber && depNode.status !== 'DONE') return true;
  }
  return false;
}

/**
 * Calculate execution phases for a sprint using topological sorting
 */
export function calculatePhases(
  dependencyGraph: DependencyGraph,
  tasks: CSVTask[],
  sprintNumber: number | 'all'
): { phases: ExecutionPhase[]; parallelStreams: ParallelStream[] } {
  const includeAll = sprintNumber === 'all';

  // Filter tasks for target sprint that are not completed
  const sprintTasks = tasks.filter((t) => {
    const sprint = t['Target Sprint'];
    const inSprint =
      includeAll ||
      sprint === String(sprintNumber) ||
      (sprintNumber === -1 && sprint === 'Continuous');

    const statusNorm = (t.Status || '').trim().toLowerCase();
    const isCompleted = statusNorm === 'done' || statusNorm === 'completed';

    return inSprint && !isCompleted;
  });

  const taskIds = new Set(sprintTasks.map((t) => t['Task ID']));

  // Build phase assignment using topological sort
  const phaseAssignment = new Map<string, number>();
  const _taskMap = new Map(sprintTasks.map((t) => [t['Task ID'], t]));

  // Calculate phases for all sprint tasks
  for (const task of sprintTasks) {
    computeTaskPhase(
      task['Task ID'],
      new Set(),
      phaseAssignment,
      dependencyGraph,
      taskIds,
      includeAll,
      sprintNumber
    );
  }

  // Group tasks by phase
  const tasksByPhase = new Map<number, TaskPhaseEntry[]>();

  for (const task of sprintTasks) {
    const phaseNum = phaseAssignment.get(task['Task ID']) ?? 0;

    if (!tasksByPhase.has(phaseNum)) {
      tasksByPhase.set(phaseNum, []);
    }

    // Convert CSV task to phase entry
    const entry = csvTaskToPhaseEntryLocal(task, dependencyGraph);
    tasksByPhase.get(phaseNum)!.push(entry);
  }

  // Build phase objects
  const phases: ExecutionPhase[] = [];
  const allParallelStreams: ParallelStream[] = [];

  const sortedPhaseNumbers = Array.from(tasksByPhase.keys()).sort((a, b) => a - b);

  for (const phaseNum of sortedPhaseNumbers) {
    const phaseTasks = tasksByPhase.get(phaseNum)!;

    // Identify parallel streams within this phase
    const { streams, taskStreams } = identifyParallelStreams(phaseTasks, dependencyGraph, phaseNum);

    // Assign stream IDs to tasks
    for (const task of phaseTasks) {
      task.parallelStreamId = taskStreams.get(task.taskId);
    }

    // Determine execution type
    const executionType = streams.length > 1 ? 'parallel' : 'sequential';

    phases.push({
      phaseNumber: phaseNum,
      name: generatePhaseName(phaseNum, phaseTasks),
      executionType,
      tasks: phaseTasks,
      estimatedDurationMinutes: estimatePhaseDuration(phaseTasks, executionType),
      blockedBy: phaseNum > 0 ? [`phase-${phaseNum - 1}`] : [],
    });

    // Add streams with phase prefix
    for (const stream of streams) {
      allParallelStreams.push({
        ...stream,
        streamId: `P${phaseNum}-${stream.streamId}`,
      });
    }
  }

  return { phases, parallelStreams: allParallelStreams };
}

/**
 * Identify parallel streams within a phase
 * Tasks with the same dependencies can run in parallel
 */
function identifyParallelStreams(
  tasks: TaskPhaseEntry[],
  dependencyGraph: DependencyGraph,
  _phaseNumber: number
): { streams: ParallelStream[]; taskStreams: Map<string, string> } {
  // Group tasks by dependency signature
  const signatureGroups = new Map<string, string[]>();

  for (const task of tasks) {
    const signature =
      [...task.dependencies].sort((a, b) => a.localeCompare(b)).join(',') || 'no-deps';
    if (!signatureGroups.has(signature)) {
      signatureGroups.set(signature, []);
    }
    signatureGroups.get(signature)!.push(task.taskId);
  }

  // Check for inter-dependencies (tasks in same phase that depend on each other)
  // If any exist, they must be sequential
  const hasInterDeps = checkInterDependencies(tasks, dependencyGraph);

  const streams: ParallelStream[] = [];
  const taskStreams = new Map<string, string>();
  let streamIndex = 0;

  for (const [signature, taskIds] of signatureGroups) {
    const streamLetter = getStreamLetterLocal(streamIndex);
    const streamId = streamLetter;

    // Get the shared dependencies
    const sharedDeps = signature === 'no-deps' ? [] : signature.split(',');

    // Find which other streams can run concurrently
    const canRunWith: string[] = [];
    if (!hasInterDeps) {
      for (let i = 0; i < streamIndex; i++) {
        canRunWith.push(getStreamLetterLocal(i));
      }
    }

    streams.push({
      streamId,
      name: generateStreamName(taskIds, streamLetter),
      tasks: taskIds,
      sharedDependencies: sharedDeps,
      canRunWith,
    });

    for (const taskId of taskIds) {
      taskStreams.set(taskId, streamId);
    }

    streamIndex++;
  }

  return { streams, taskStreams };
}

/**
 * Check if any tasks in the same phase depend on each other
 */
function checkInterDependencies(
  tasks: TaskPhaseEntry[],
  _dependencyGraph: DependencyGraph
): boolean {
  const taskIdsInPhase = new Set(tasks.map((t) => t.taskId));

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (taskIdsInPhase.has(depId)) {
        return true; // Found inter-dependency
      }
    }
  }

  return false;
}

/**
 * Generate a descriptive phase name
 */
function generatePhaseName(phaseNumber: number, tasks: TaskPhaseEntry[]): string {
  if (tasks.length === 0) return `Phase ${phaseNumber}`;

  // Count sections
  const sectionCounts = new Map<string, number>();
  for (const task of tasks) {
    const section = task.section || 'General';
    sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
  }

  // Get top section
  let topSection = 'General';
  let maxCount = 0;
  for (const [section, count] of sectionCounts) {
    if (count > maxCount) {
      maxCount = count;
      topSection = section;
    }
  }

  // Special names for specific phases
  if (phaseNumber === 0) {
    return 'Initialisation';
  }

  return `${topSection} (${tasks.length} tasks)`;
}

/**
 * Generate a stream name from tasks
 */
function generateStreamName(taskIds: string[], streamLetter: string): string {
  if (taskIds.length === 1) {
    return taskIds[0];
  }

  // Find common prefix
  const prefixes = taskIds.map((id) => id.split('-')[0]);
  const commonPrefix = prefixes[0];
  const allSamePrefix = prefixes.every((p) => p === commonPrefix);

  if (allSamePrefix) {
    return `${commonPrefix} Stream ${streamLetter}`;
  }

  return `Parallel Stream ${streamLetter}`;
}

/**
 * Estimate phase duration based on tasks and execution type
 */
function estimatePhaseDuration(
  tasks: TaskPhaseEntry[],
  executionType: 'sequential' | 'parallel'
): number {
  const taskMinutes = 15; // Default estimate per task

  if (executionType === 'parallel') {
    // Parallel execution: duration is max of parallel tasks
    return taskMinutes;
  } else {
    // Sequential execution: sum of all tasks
    return tasks.length * taskMinutes;
  }
}

const SWARM_SECTION_KEYWORDS = ['implementation', 'development', 'coding', 'core crm'];
const MATOP_SECTION_KEYWORDS = ['validation', 'security', 'quality', 'exception'];
const AIENV_SECTION_KEYWORDS = ['ai foundation', 'environment', 'automation'];
const VALIDATION_DESC_KEYWORDS = ['validate', 'verify', 'audit'];

function isSwarmTask(section: string, taskId: string): boolean {
  if (SWARM_SECTION_KEYWORDS.some((kw) => section.includes(kw))) return true;
  if (taskId.startsWith('IFC-') || taskId.startsWith('PG-')) return true;
  return false;
}

function isMatopTask(section: string, taskId: string): boolean {
  if (MATOP_SECTION_KEYWORDS.some((kw) => section.includes(kw))) return true;
  if (taskId.startsWith('EXC-')) return true;
  return false;
}

function isAiEnvSection(section: string): boolean {
  return AIENV_SECTION_KEYWORDS.some((kw) => section.includes(kw));
}

function isValidationDescription(description: string): boolean {
  const lc = description.toLowerCase();
  return VALIDATION_DESC_KEYWORDS.some((kw) => lc.includes(kw));
}

function resolveExecutionMode(
  section: string,
  taskId: string,
  description: string
): 'swarm' | 'matop' | 'manual' {
  if (isSwarmTask(section, taskId)) return 'swarm';
  if (isMatopTask(section, taskId)) return 'matop';
  if (isAiEnvSection(section)) {
    return isValidationDescription(description) ? 'matop' : 'swarm';
  }
  return 'manual';
}

/**
 * Convert CSV task to TaskPhaseEntry
 */
function csvTaskToPhaseEntryLocal(task: CSVTask, dependencyGraph: DependencyGraph): TaskPhaseEntry {
  const section = task.Section.toLowerCase();
  const executionMode = resolveExecutionMode(section, task['Task ID'], task.Description || '');

  // Get dependencies from graph or CSV
  const node = dependencyGraph.nodes[task['Task ID']];
  const dependencies = node?.dependencies || parseDependencies(task.Dependencies);

  return {
    taskId: task['Task ID'],
    description: task.Description,
    section: task.Section,
    owner: task.Owner,
    status: mapCSVStatusLocal(task.Status),
    dependencies,
    executionMode,
    definitionOfDone: task['Definition of Done'],
    kpis: task.KPIs,
    artifactsToTrack: task['Artifacts To Track'],
    validationMethod: task['Validation Method'],
  };
}

/**
 * Parse dependencies from CSV string
 */
function parseDependencies(depsString: string): string[] {
  if (!depsString || depsString === 'None' || depsString === '-') {
    return [];
  }

  return depsString
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d !== 'None' && d !== '-');
}

/**
 * Map CSV status to TaskStatus
 */
function mapCSVStatusLocal(
  status: string
): 'pending' | 'planned' | 'in_progress' | 'completed' | 'failed' | 'needs_human' | 'blocked' {
  const statusMap: Record<
    string,
    'pending' | 'planned' | 'in_progress' | 'completed' | 'failed' | 'needs_human' | 'blocked'
  > = {
    Backlog: 'pending',
    Planned: 'planned',
    'In Progress': 'in_progress',
    Validating: 'in_progress',
    Completed: 'completed',
    Done: 'completed',
    Failed: 'failed',
    Blocked: 'blocked',
    'Needs Human': 'needs_human',
    'In Review': 'pending',
  };
  return statusMap[status] || 'pending';
}

/**
 * Get stream letter (A, B, C, ...)
 */
function getStreamLetterLocal(index: number): string {
  return String.fromCodePoint(65 + index);
}

function isInTargetSprint(
  sprint: string,
  sprintNumber: number | 'all',
  includeAll: boolean
): boolean {
  if (includeAll) return true;
  if (sprint === String(sprintNumber)) return true;
  if (sprintNumber === -1 && sprint === 'Continuous') return true;
  return false;
}

function isNotDone(status: string): boolean {
  const statusNorm = (status || '').trim().toLowerCase();
  return statusNorm !== 'done' && statusNorm !== 'completed';
}

/**
 * Get tasks ready to start (all dependencies satisfied)
 */
export function getReadyTasks(
  dependencyGraph: DependencyGraph,
  tasks: CSVTask[],
  sprintNumber: number | 'all'
): TaskPhaseEntry[] {
  const readyTaskIds = new Set(dependencyGraph.ready_to_start);
  const includeAll = sprintNumber === 'all';

  return tasks
    .filter((t) => {
      const sprint = t['Target Sprint'];
      return (
        isInTargetSprint(sprint, sprintNumber, includeAll) &&
        readyTaskIds.has(t['Task ID']) &&
        isNotDone(t.Status)
      );
    })
    .map((t) => csvTaskToPhaseEntryLocal(t, dependencyGraph));
}

function getUnsatisfiedDeps(taskId: string, dependencyGraph: DependencyGraph): string[] {
  const node = dependencyGraph.nodes[taskId];
  if (!node) return [];
  return node.dependencies.filter((depId) => {
    const depNode = dependencyGraph.nodes[depId];
    return depNode && depNode.status !== 'DONE';
  });
}

/**
 * Get blocked tasks with their blocking reasons
 */
export function getBlockedTasks(
  dependencyGraph: DependencyGraph,
  tasks: CSVTask[],
  sprintNumber: number | 'all'
): Array<{ task: TaskPhaseEntry; blockedBy: string[] }> {
  const blockedTaskIds = new Set(dependencyGraph.blocked_tasks);
  const includeAll = sprintNumber === 'all';

  return tasks
    .filter((t) => {
      const sprint = t['Target Sprint'];
      return (
        isInTargetSprint(sprint, sprintNumber, includeAll) &&
        blockedTaskIds.has(t['Task ID']) &&
        isNotDone(t.Status)
      );
    })
    .map((t) => ({
      task: csvTaskToPhaseEntryLocal(t, dependencyGraph),
      blockedBy: getUnsatisfiedDeps(t['Task ID'], dependencyGraph),
    }));
}

function renderParallelPhase(phase: ExecutionPhase): string[] {
  const lines: string[] = [];
  const streamTasks = new Map<string, string[]>();
  for (const task of phase.tasks) {
    const stream = task.parallelStreamId || 'default';
    if (!streamTasks.has(stream)) streamTasks.set(stream, []);
    streamTasks.get(stream)!.push(task.taskId);
  }
  const streamLines: string[][] = [];
  for (const [streamId, taskIds] of streamTasks) {
    streamLines.push([`[${streamId}]`, ...taskIds.map((id) => `  ${id}`)]);
  }
  const maxLen = Math.max(...streamLines.map((s) => s.length));
  for (let i = 0; i < maxLen; i++) {
    const row = streamLines.map((s) => (s[i] || '').padEnd(20)).join(' | ');
    lines.push(`  ${row}`);
  }
  lines.push('  ↓ (parallel execution)');
  return lines;
}

function renderSequentialPhase(phase: ExecutionPhase): string[] {
  const lines: string[] = [];
  for (const task of phase.tasks) {
    lines.push(`  → ${task.taskId}`);
  }
  lines.push('  ↓');
  return lines;
}

/**
 * Generate ASCII dependency graph for visualization
 */
export function generateAsciiGraph(
  phases: ExecutionPhase[],
  _parallelStreams: ParallelStream[]
): string {
  const lines: string[] = [];

  lines.push('```', 'EXECUTION DEPENDENCY GRAPH', '='.repeat(60), '');

  for (const phase of phases) {
    lines.push(`Phase ${phase.phaseNumber}: ${phase.name}`, '-'.repeat(40));

    const phaseLines =
      phase.executionType === 'parallel'
        ? renderParallelPhase(phase)
        : renderSequentialPhase(phase);
    lines.push(...phaseLines, '');
  }

  lines.push('='.repeat(60), '```');

  return lines.join('\n');
}
