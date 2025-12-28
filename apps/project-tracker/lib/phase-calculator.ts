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
  DependencySignature,
  CSVTask,
  csvTaskToPhaseEntry,
  getStreamLetter,
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

    return inSprint && t.Status !== 'Done' && t.Status !== 'Completed';
  });

  const taskIds = new Set(sprintTasks.map((t) => t['Task ID']));

  // Build phase assignment using topological sort
  const phaseAssignment = new Map<string, number>();
  const taskMap = new Map(sprintTasks.map((t) => [t['Task ID'], t]));

  // Calculate phase for each task: phase = max(dependency phases) + 1
  const calculateTaskPhase = (taskId: string, visited: Set<string>): number => {
    if (phaseAssignment.has(taskId)) {
      return phaseAssignment.get(taskId)!;
    }

    // Detect circular dependencies
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

    // Get dependencies within this sprint (or all when includeAll)
    const sprintDeps = node.dependencies.filter((depId) => {
      const depNode = dependencyGraph.nodes[depId];
      if (!depNode) return false;

      // If dep is part of the current execution set, it must be scheduled first
      if (taskIds.has(depId)) return true;

      if (!includeAll) {
        // If dep is from previous sprint and not done, this task is blocked
        if (depNode.sprint < sprintNumber && depNode.status !== 'DONE') {
          return true; // This will push the task to a later phase
        }
      }

      return false;
    });

    if (sprintDeps.length === 0) {
      phaseAssignment.set(taskId, 0);
      return 0;
    }

    // Phase = max dependency phase + 1
    let maxDepPhase = -1;
    for (const depId of sprintDeps) {
      const depPhase = calculateTaskPhase(depId, new Set(visited));
      maxDepPhase = Math.max(maxDepPhase, depPhase);
    }

    const phase = maxDepPhase + 1;
    phaseAssignment.set(taskId, phase);
    return phase;
  };

  // Calculate phases for all sprint tasks
  for (const task of sprintTasks) {
    calculateTaskPhase(task['Task ID'], new Set());
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
  phaseNumber: number
): { streams: ParallelStream[]; taskStreams: Map<string, string> } {
  // Group tasks by dependency signature
  const signatureGroups = new Map<string, string[]>();

  for (const task of tasks) {
    const signature = task.dependencies.sort().join(',') || 'no-deps';
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
  dependencyGraph: DependencyGraph
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

/**
 * Convert CSV task to TaskPhaseEntry
 */
function csvTaskToPhaseEntryLocal(task: CSVTask, dependencyGraph: DependencyGraph): TaskPhaseEntry {
  const section = task.Section.toLowerCase();
  let executionMode: 'swarm' | 'matop' | 'manual' = 'manual';

  // Determine execution mode based on section and task ID patterns
  if (
    section.includes('implementation') ||
    section.includes('development') ||
    section.includes('coding') ||
    section.includes('core crm') ||
    task['Task ID'].startsWith('IFC-') ||
    task['Task ID'].startsWith('PG-')
  ) {
    executionMode = 'swarm';
  } else if (
    section.includes('validation') ||
    section.includes('security') ||
    section.includes('quality') ||
    section.includes('exception') ||
    task['Task ID'].startsWith('EXC-')
  ) {
    executionMode = 'matop';
  } else if (
    section.includes('ai foundation') ||
    section.includes('environment') ||
    section.includes('automation')
  ) {
    // AI/Environment tasks can use either - check if it's setup vs validation
    if (
      task.Description?.toLowerCase().includes('validate') ||
      task.Description?.toLowerCase().includes('verify') ||
      task.Description?.toLowerCase().includes('audit')
    ) {
      executionMode = 'matop';
    } else {
      executionMode = 'swarm';
    }
  }

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
  return String.fromCharCode(65 + index);
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
      const isTargetSprint =
        includeAll ||
        sprint === String(sprintNumber) ||
        (sprintNumber === -1 && sprint === 'Continuous');
      const isReady = readyTaskIds.has(t['Task ID']);
      const notDone = t.Status !== 'Done' && t.Status !== 'Completed';

      return isTargetSprint && isReady && notDone;
    })
    .map((t) => csvTaskToPhaseEntryLocal(t, dependencyGraph));
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
      const isTargetSprint =
        includeAll ||
        sprint === String(sprintNumber) ||
        (sprintNumber === -1 && sprint === 'Continuous');
      const isBlocked = blockedTaskIds.has(t['Task ID']);
      const notDone = t.Status !== 'Done' && t.Status !== 'Completed';

      return isTargetSprint && isBlocked && notDone;
    })
    .map((t) => {
      const node = dependencyGraph.nodes[t['Task ID']];
      const unsatisfiedDeps =
        node?.dependencies.filter((depId) => {
          const depNode = dependencyGraph.nodes[depId];
          return depNode && depNode.status !== 'DONE';
        }) || [];

      return {
        task: csvTaskToPhaseEntryLocal(t, dependencyGraph),
        blockedBy: unsatisfiedDeps,
      };
    });
}

/**
 * Generate ASCII dependency graph for visualization
 */
export function generateAsciiGraph(
  phases: ExecutionPhase[],
  parallelStreams: ParallelStream[]
): string {
  const lines: string[] = [];

  lines.push('```');
  lines.push('EXECUTION DEPENDENCY GRAPH');
  lines.push('='.repeat(60));
  lines.push('');

  for (const phase of phases) {
    lines.push(`Phase ${phase.phaseNumber}: ${phase.name}`);
    lines.push('-'.repeat(40));

    if (phase.executionType === 'parallel') {
      // Group tasks by stream
      const streamTasks = new Map<string, string[]>();
      for (const task of phase.tasks) {
        const stream = task.parallelStreamId || 'default';
        if (!streamTasks.has(stream)) {
          streamTasks.set(stream, []);
        }
        streamTasks.get(stream)!.push(task.taskId);
      }

      // Draw parallel streams
      const streamLines: string[][] = [];
      for (const [streamId, taskIds] of streamTasks) {
        const streamLine = [`[${streamId}]`, ...taskIds.map((id) => `  ${id}`)];
        streamLines.push(streamLine);
      }

      // Print streams side by side (simplified)
      const maxLen = Math.max(...streamLines.map((s) => s.length));
      for (let i = 0; i < maxLen; i++) {
        const row = streamLines.map((s) => (s[i] || '').padEnd(20)).join(' | ');
        lines.push(`  ${row}`);
      }

      lines.push('  ↓ (parallel execution)');
    } else {
      // Sequential tasks
      for (const task of phase.tasks) {
        lines.push(`  → ${task.taskId}`);
      }
      lines.push('  ↓');
    }

    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('```');

  return lines.join('\n');
}
