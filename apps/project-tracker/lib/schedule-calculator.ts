/**
 * PMBOK Schedule Calculator
 *
 * Implements Critical Path Method (CPM) and PERT analysis for project scheduling.
 *
 * Features:
 * - Three-point estimation (PERT): Expected = (O + 4M + P) / 6
 * - Forward pass: Calculate Early Start/Finish
 * - Backward pass: Calculate Late Start/Finish
 * - Float calculation: Total Float = LS - ES
 * - Critical path identification
 * - Schedule variance (EVM): SV, SPI
 */

export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF';
export type ScheduleStatus = 'ahead' | 'on_track' | 'behind' | 'critical';

export interface ScheduleDependency {
  predecessorId: string;
  type: DependencyType;
  lagMinutes: number;
}

export interface ThreePointEstimate {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
}

export interface TaskScheduleInput {
  taskId: string;
  estimate?: ThreePointEstimate;
  durationMinutes?: number; // Direct duration if no three-point
  plannedStart?: Date;
  plannedFinish?: Date;
  percentComplete: number;
  dependencies: ScheduleDependency[];
  constraintType?: 'ASAP' | 'ALAP' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';
  constraintDate?: Date;
  targetSprint?: number; // Target sprint number for scheduling
  status: string;
}

export interface ScheduledTask extends TaskScheduleInput {
  // PERT results
  expectedDuration: number;
  standardDeviation?: number;

  // Forward pass
  earlyStart: Date;
  earlyFinish: Date;

  // Backward pass
  lateStart: Date;
  lateFinish: Date;

  // Float
  totalFloat: number;
  freeFloat: number;

  // Critical path
  isCritical: boolean;

  // EVM (if baseline exists)
  scheduleVariance?: number;
  spi?: number;
}

export interface CriticalPathResult {
  taskIds: string[];
  totalDuration: number;
  completionPercentage: number;
  bottleneckTaskId?: string;
}

export interface ScheduleVarianceResult {
  svMinutes: number;
  spi: number;
  status: ScheduleStatus;
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  criticalPath: CriticalPathResult;
  scheduleVariance: ScheduleVarianceResult;
  calculatedAt: Date;
}

export interface ScheduleConfig {
  sprintStart: Date;
  sprintEnd: Date;
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
}

/**
 * Calculate expected duration using PERT three-point estimation
 * Expected = (O + 4M + P) / 6
 */
export function calculatePertDuration(estimate: ThreePointEstimate): {
  expected: number;
  standardDeviation: number;
} {
  const { optimistic, mostLikely, pessimistic } = estimate;
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const standardDeviation = (pessimistic - optimistic) / 6;
  return { expected: Math.round(expected), standardDeviation };
}

/**
 * Parse estimate string "O/M/P" format (e.g., "30/60/120")
 */
export function parseEstimateString(estimate: string): ThreePointEstimate | null {
  if (!estimate || estimate.trim() === '') return null;
  const parts = estimate.split('/').map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return {
    optimistic: parts[0],
    mostLikely: parts[1],
    pessimistic: parts[2],
  };
}

/**
 * Parse dependency types string (e.g., "IFC-001:FS,IFC-002:SS+30")
 */
export function parseDependencyTypes(depString: string): ScheduleDependency[] {
  if (!depString || depString.trim() === '') return [];

  return depString.split(',').map((dep) => {
    const trimmed = dep.trim();

    // Parse format: TASK_ID:TYPE[+/-lag]
    const match = /^([A-Z]+-[A-Z0-9-]+):?(FS|FF|SS|SF)?([+-]\d+)?$/.exec(trimmed);
    if (!match) {
      // Fallback: just task ID with default FS
      return {
        predecessorId: trimmed.split(':')[0],
        type: 'FS' as DependencyType,
        lagMinutes: 0,
      };
    }

    const [, taskId, type, lag] = match;
    return {
      predecessorId: taskId,
      type: (type || 'FS') as DependencyType,
      lagMinutes: lag ? Number.parseInt(lag, 10) : 0,
    };
  });
}

/**
 * Add working minutes to a date, respecting working hours
 */
export function addWorkingMinutes(date: Date, minutes: number, config: ScheduleConfig): Date {
  const { workingHoursPerDay } = config;
  const workingMinutesPerDay = workingHoursPerDay * 60;

  let remainingMinutes = minutes;
  const result = new Date(date);

  while (remainingMinutes > 0) {
    const minutesToday = Math.min(remainingMinutes, workingMinutesPerDay);
    result.setMinutes(result.getMinutes() + minutesToday);
    remainingMinutes -= minutesToday;

    if (remainingMinutes > 0) {
      // Move to next working day
      result.setDate(result.getDate() + 1);
      // Skip weekends
      while (result.getDay() === 0 || result.getDay() === 6) {
        result.setDate(result.getDate() + 1);
      }
      // Reset to start of day
      result.setHours(9, 0, 0, 0);
    }
  }

  return result;
}

/**
 * Topological sort of tasks based on dependencies
 */
function topologicalSort(tasks: TaskScheduleInput[]): TaskScheduleInput[] {
  const taskMap = new Map(tasks.map((t) => [t.taskId, t]));
  const visited = new Set<string>();
  const sorted: TaskScheduleInput[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) return;

    for (const dep of task.dependencies) {
      visit(dep.predecessorId);
    }

    sorted.push(task);
  }

  for (const task of tasks) {
    visit(task.taskId);
  }

  return sorted;
}

/**
 * Calculate early start based on predecessor and dependency type
 */
function calculateEarlyStart(
  predecessorSchedule: ScheduledTask,
  dep: ScheduleDependency,
  config: ScheduleConfig
): Date {
  const { type, lagMinutes } = dep;
  let baseDate: Date;

  switch (type) {
    case 'FS': // Finish-to-Start
      baseDate = predecessorSchedule.earlyFinish;
      break;
    case 'SS': // Start-to-Start
      baseDate = predecessorSchedule.earlyStart;
      break;
    case 'FF': // Finish-to-Finish - need to work backwards
    case 'SF': // Start-to-Finish - need to work backwards
      // These are handled differently; for now use earlyFinish
      baseDate = predecessorSchedule.earlyFinish;
      break;
    default:
      baseDate = predecessorSchedule.earlyFinish;
  }

  return addWorkingMinutes(baseDate, lagMinutes, config);
}

function computePertValues(task: TaskScheduleInput): {
  expectedDuration: number;
  standardDeviation: number | undefined;
} {
  if (task.estimate) {
    const pert = calculatePertDuration(task.estimate);
    return { expectedDuration: pert.expected, standardDeviation: pert.standardDeviation };
  }
  return { expectedDuration: task.durationMinutes || 60, standardDeviation: undefined };
}

function computeSprintBasedStart(
  task: TaskScheduleInput,
  sprintStart: Date,
  tasksBySpint: Map<number, TaskScheduleInput[]>,
  taskPositionInSprint: Map<string, number>
): Date {
  const sprintStartDate = new Date(sprintStart);
  sprintStartDate.setDate(sprintStartDate.getDate() + task.targetSprint! * 14);
  const sprintTasks = tasksBySpint.get(task.targetSprint!) || [];
  const position = taskPositionInSprint.get(task.taskId) || 0;
  const totalTasksInSprint = sprintTasks.length;
  const daysToDistribute = Math.min(12, totalTasksInSprint);
  const dayOffset =
    totalTasksInSprint > 1
      ? Math.floor((position / (totalTasksInSprint - 1)) * daysToDistribute)
      : 0;
  const result = new Date(sprintStartDate);
  result.setDate(result.getDate() + dayOffset);
  return result;
}

function computeBaseEarlyStart(
  task: TaskScheduleInput,
  sprintStart: Date,
  tasksBySpint: Map<number, TaskScheduleInput[]>,
  taskPositionInSprint: Map<string, number>
): Date {
  if (task.plannedStart && !Number.isNaN(task.plannedStart.getTime())) {
    return new Date(task.plannedStart);
  }
  if (task.targetSprint !== undefined && task.targetSprint >= 0) {
    return computeSprintBasedStart(task, sprintStart, tasksBySpint, taskPositionInSprint);
  }
  return new Date(sprintStart);
}

function applyDependencyConstraints(
  earlyStart: Date,
  task: TaskScheduleInput,
  scheduledTasks: Map<string, ScheduledTask>,
  config: ScheduleConfig
): Date {
  let result = earlyStart;
  for (const dep of task.dependencies) {
    const predecessor = scheduledTasks.get(dep.predecessorId);
    if (predecessor) {
      const depEarlyStart = calculateEarlyStart(predecessor, dep, config);
      if (depEarlyStart > result) {
        result = depEarlyStart;
      }
    }
  }
  return result;
}

function applyExplicitConstraint(earlyStart: Date, task: TaskScheduleInput): Date {
  if (!task.constraintType || !task.constraintDate) return earlyStart;
  if (task.constraintType === 'SNET' || task.constraintType === 'MSO') {
    if (task.constraintDate > earlyStart) return task.constraintDate;
  }
  return earlyStart;
}

function computeSuccLateBound(
  dep: ScheduleDependency,
  succScheduled: ScheduledTask,
  expectedDuration: number
): Date {
  if (dep.type === 'FS') {
    return new Date(succScheduled.lateStart.getTime() - dep.lagMinutes * 60000);
  }
  if (dep.type === 'SS') {
    return new Date(
      succScheduled.lateStart.getTime() + expectedDuration * 60000 - dep.lagMinutes * 60000
    );
  }
  return succScheduled.lateStart;
}

function buildSprintPositionMaps(
  sortedTasks: TaskScheduleInput[]
): {
  tasksBySpint: Map<number, TaskScheduleInput[]>;
  taskPositionInSprint: Map<string, number>;
} {
  const tasksBySpint = new Map<number, TaskScheduleInput[]>();
  const taskPositionInSprint = new Map<string, number>();
  for (const task of sortedTasks) {
    const sprint = task.targetSprint ?? 0;
    if (!tasksBySpint.has(sprint)) tasksBySpint.set(sprint, []);
    const sprintTasks = tasksBySpint.get(sprint)!;
    taskPositionInSprint.set(task.taskId, sprintTasks.length);
    sprintTasks.push(task);
  }
  return { tasksBySpint, taskPositionInSprint };
}

function runForwardPass(
  sortedTasks: TaskScheduleInput[],
  sprintStart: Date,
  sprintEnd: Date,
  tasksBySpint: Map<number, TaskScheduleInput[]>,
  taskPositionInSprint: Map<string, number>,
  config: ScheduleConfig
): Map<string, ScheduledTask> {
  const scheduledTasks = new Map<string, ScheduledTask>();
  for (const task of sortedTasks) {
    const { expectedDuration, standardDeviation } = computePertValues(task);
    let earlyStart = computeBaseEarlyStart(task, sprintStart, tasksBySpint, taskPositionInSprint);
    if (task.dependencies.length > 0) {
      earlyStart = applyDependencyConstraints(earlyStart, task, scheduledTasks, config);
    }
    earlyStart = applyExplicitConstraint(earlyStart, task);
    const earlyFinish = addWorkingMinutes(earlyStart, expectedDuration, config);
    scheduledTasks.set(task.taskId, {
      ...task,
      expectedDuration,
      standardDeviation,
      earlyStart,
      earlyFinish,
      lateStart: sprintEnd,
      lateFinish: sprintEnd,
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
    });
  }
  return scheduledTasks;
}

function runBackwardPass(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>,
  config: ScheduleConfig
): void {
  let maxEarlyFinish = new Date(0);
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    if (scheduled.earlyFinish > maxEarlyFinish) maxEarlyFinish = scheduled.earlyFinish;
  }
  const projectEndDate = maxEarlyFinish;
  const reversedTasks = [...sortedTasks].reverse();
  for (const task of reversedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    const successors = sortedTasks.filter((t) =>
      t.dependencies.some((d) => d.predecessorId === task.taskId)
    );
    let lateFinish = projectEndDate;
    for (const succ of successors) {
      const succScheduled = scheduledTasks.get(succ.taskId)!;
      const dep = succ.dependencies.find((d) => d.predecessorId === task.taskId)!;
      const succLateBound = computeSuccLateBound(dep, succScheduled, scheduled.expectedDuration);
      if (succLateBound < lateFinish) lateFinish = succLateBound;
    }
    const lateStart = new Date(lateFinish.getTime() - scheduled.expectedDuration * 60000);
    scheduled.lateStart = lateStart;
    scheduled.lateFinish = lateFinish;
  }
}

function computeFloat(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>
): void {
  const successorMap = new Map<string, TaskScheduleInput[]>();
  for (const task of sortedTasks) {
    const successors = sortedTasks.filter((t) =>
      t.dependencies.some((d) => d.predecessorId === task.taskId)
    );
    successorMap.set(task.taskId, successors);
  }
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    scheduled.totalFloat = Math.round(
      (scheduled.lateStart.getTime() - scheduled.earlyStart.getTime()) / 60000
    );
    const successors = successorMap.get(task.taskId) || [];
    if (successors.length > 0) {
      const minSuccessorES = Math.min(
        ...successors.map((s) => scheduledTasks.get(s.taskId)!.earlyStart.getTime())
      );
      scheduled.freeFloat = Math.round(
        (minSuccessorES - scheduled.earlyFinish.getTime()) / 60000
      );
    } else {
      scheduled.freeFloat = scheduled.totalFloat;
    }
  }
}

function buildLongestPaths(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>
): { longestPathTo: Map<string, number>; pathPredecessor: Map<string, string | null> } {
  const longestPathTo = new Map<string, number>();
  const pathPredecessor = new Map<string, string | null>();
  for (const task of sortedTasks) {
    let maxPathLength = 0;
    let bestPredecessor: string | null = null;
    for (const dep of task.dependencies) {
      const predPath = longestPathTo.get(dep.predecessorId);
      if (predPath === undefined) continue;
      const predScheduled = scheduledTasks.get(dep.predecessorId);
      const predDuration = predScheduled ? predScheduled.expectedDuration : 0;
      const pathLength = predPath + predDuration;
      if (pathLength > maxPathLength) {
        maxPathLength = pathLength;
        bestPredecessor = dep.predecessorId;
      }
    }
    longestPathTo.set(task.taskId, maxPathLength);
    pathPredecessor.set(task.taskId, bestPredecessor);
  }
  return { longestPathTo, pathPredecessor };
}

function findCriticalEndTask(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>,
  longestPathTo: Map<string, number>
): string | null {
  let criticalEndTask: string | null = null;
  let maxTotalPath = 0;
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    const pathLength = (longestPathTo.get(task.taskId) || 0) + scheduled.expectedDuration;
    if (pathLength > maxTotalPath) {
      maxTotalPath = pathLength;
      criticalEndTask = task.taskId;
    }
  }
  return criticalEndTask;
}

function buildCriticalPathSet(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>,
  criticalEndTask: string | null,
  pathPredecessor: Map<string, string | null>
): Set<string> {
  const criticalPathSet = new Set<string>();
  if (criticalEndTask) {
    let current: string | null = criticalEndTask;
    while (current) {
      criticalPathSet.add(current);
      current = pathPredecessor.get(current) || null;
    }
  }
  let minFloat = Infinity;
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    if (scheduled.totalFloat < minFloat && scheduled.totalFloat >= 0) minFloat = scheduled.totalFloat;
  }
  const floatThreshold = minFloat + 60;
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    if (scheduled.totalFloat <= floatThreshold) criticalPathSet.add(task.taskId);
  }
  return criticalPathSet;
}

function identifyCriticalPath(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>
): { criticalPathTasks: string[]; totalCriticalDuration: number; totalCriticalComplete: number } {
  const { longestPathTo, pathPredecessor } = buildLongestPaths(sortedTasks, scheduledTasks);
  const criticalEndTask = findCriticalEndTask(sortedTasks, scheduledTasks, longestPathTo);
  const criticalPathSet = buildCriticalPathSet(sortedTasks, scheduledTasks, criticalEndTask, pathPredecessor);

  const criticalPathTasks: string[] = [];
  let totalCriticalDuration = 0;
  let totalCriticalComplete = 0;
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    if (criticalPathSet.has(task.taskId)) {
      scheduled.isCritical = true;
      criticalPathTasks.push(task.taskId);
      totalCriticalDuration += scheduled.expectedDuration;
      totalCriticalComplete += (scheduled.expectedDuration * scheduled.percentComplete) / 100;
    }
  }
  return { criticalPathTasks, totalCriticalDuration, totalCriticalComplete };
}

function computeEvm(
  sortedTasks: TaskScheduleInput[],
  scheduledTasks: Map<string, ScheduledTask>
): { svMinutes: number; spi: number; status: 'ahead' | 'on_track' | 'behind' | 'critical' } {
  let totalPlannedValue = 0;
  let totalEarnedValue = 0;
  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    totalPlannedValue += scheduled.expectedDuration;
    totalEarnedValue += (scheduled.expectedDuration * scheduled.percentComplete) / 100;
  }
  const svMinutes = totalEarnedValue - totalPlannedValue;
  const spi = totalPlannedValue > 0 ? totalEarnedValue / totalPlannedValue : 1;
  let status: 'ahead' | 'on_track' | 'behind' | 'critical';
  if (spi >= 1.1) status = 'ahead';
  else if (spi >= 0.95) status = 'on_track';
  else if (spi >= 0.8) status = 'behind';
  else status = 'critical';
  return { svMinutes: Math.round(svMinutes), spi: Math.round(spi * 100) / 100, status };
}

export function calculateSchedule(
  tasks: TaskScheduleInput[],
  config: ScheduleConfig
): ScheduleResult {
  const { sprintStart, sprintEnd } = config;
  const sortedTasks = topologicalSort(tasks);
  const { tasksBySpint, taskPositionInSprint } = buildSprintPositionMaps(sortedTasks);
  const scheduledTasks = runForwardPass(
    sortedTasks, sprintStart, sprintEnd, tasksBySpint, taskPositionInSprint, config
  );
  runBackwardPass(sortedTasks, scheduledTasks, config);
  computeFloat(sortedTasks, scheduledTasks);
  const { criticalPathTasks, totalCriticalDuration, totalCriticalComplete } =
    identifyCriticalPath(sortedTasks, scheduledTasks);
  const { svMinutes, spi, status } = computeEvm(sortedTasks, scheduledTasks);

  const completionPercentage =
    totalCriticalDuration > 0
      ? Math.round((totalCriticalComplete / totalCriticalDuration) * 100)
      : 0;

  const bottleneckTaskId = criticalPathTasks.find((id) => {
    const t = scheduledTasks.get(id)!;
    return t.percentComplete < 100;
  });

  return {
    tasks: scheduledTasks,
    criticalPath: {
      taskIds: criticalPathTasks,
      totalDuration: totalCriticalDuration,
      completionPercentage,
      bottleneckTaskId,
    },
    scheduleVariance: { svMinutes, spi, status },
    calculatedAt: new Date(),
  };
}

/**
 * TaskRecord type from data-sync (inline to avoid circular imports)
 */
interface TaskRecordInput {
  'Task ID': string;
  Status?: string;
  'Estimate (O/M/P)'?: string;
  'Planned Start'?: string;
  'Planned Finish'?: string;
  'Percent Complete'?: string;
  'Dependency Types'?: string;
}

/**
 * Convert CSV row to TaskScheduleInput
 */
export function csvRowToTaskInput(row: TaskRecordInput): TaskScheduleInput {
  const estimate = parseEstimateString(row['Estimate (O/M/P)'] || '');
  const dependencies = parseDependencyTypes(row['Dependency Types'] || '');

  return {
    taskId: row['Task ID'],
    estimate: estimate || undefined,
    durationMinutes: estimate ? undefined : 60, // Default 1 hour if no estimate
    plannedStart: row['Planned Start'] ? new Date(row['Planned Start']) : undefined,
    plannedFinish: row['Planned Finish'] ? new Date(row['Planned Finish']) : undefined,
    percentComplete: Number.parseInt(row['Percent Complete'] || '0', 10),
    dependencies,
    status: row['Status'] || 'Planned',
  };
}
