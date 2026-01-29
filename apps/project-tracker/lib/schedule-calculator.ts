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
  status: 'ahead' | 'on_track' | 'behind' | 'critical';
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
  const parts = estimate.split('/').map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
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
    const match = trimmed.match(/^([A-Z]+-[A-Z0-9-]+):?(FS|FF|SS|SF)?([+-]\d+)?$/);
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
      lagMinutes: lag ? parseInt(lag, 10) : 0,
    };
  });
}

/**
 * Add working minutes to a date, respecting working hours
 */
export function addWorkingMinutes(
  date: Date,
  minutes: number,
  config: ScheduleConfig
): Date {
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

/**
 * Main schedule calculation function
 */
export function calculateSchedule(
  tasks: TaskScheduleInput[],
  config: ScheduleConfig
): ScheduleResult {
  const { sprintStart, sprintEnd } = config;
  const scheduledTasks = new Map<string, ScheduledTask>();

  // Sort tasks topologically
  const sortedTasks = topologicalSort(tasks);

  // =========================================================================
  // Forward Pass: Calculate Early Start and Early Finish
  // =========================================================================
  for (const task of sortedTasks) {
    // Calculate expected duration
    let expectedDuration = task.durationMinutes || 60; // Default 1 hour
    let standardDeviation: number | undefined;

    if (task.estimate) {
      const pert = calculatePertDuration(task.estimate);
      expectedDuration = pert.expected;
      standardDeviation = pert.standardDeviation;
    }

    // Calculate early start
    let earlyStart = sprintStart;

    if (task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        const predecessor = scheduledTasks.get(dep.predecessorId);
        if (predecessor) {
          const depEarlyStart = calculateEarlyStart(predecessor, dep, config);
          if (depEarlyStart > earlyStart) {
            earlyStart = depEarlyStart;
          }
        }
      }
    }

    // Apply constraint
    if (task.constraintType && task.constraintDate) {
      switch (task.constraintType) {
        case 'SNET': // Start No Earlier Than
        case 'MSO': // Must Start On
          if (task.constraintDate > earlyStart) {
            earlyStart = task.constraintDate;
          }
          break;
      }
    }

    // Calculate early finish
    const earlyFinish = addWorkingMinutes(earlyStart, expectedDuration, config);

    scheduledTasks.set(task.taskId, {
      ...task,
      expectedDuration,
      standardDeviation,
      earlyStart,
      earlyFinish,
      lateStart: sprintEnd, // Placeholder, will be updated in backward pass
      lateFinish: sprintEnd,
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
    });
  }

  // =========================================================================
  // Backward Pass: Calculate Late Start and Late Finish
  // =========================================================================
  const reversedTasks = [...sortedTasks].reverse();

  for (const task of reversedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;

    // Find all successors
    const successors = sortedTasks.filter((t) =>
      t.dependencies.some((d) => d.predecessorId === task.taskId)
    );

    let lateFinish = sprintEnd;

    if (successors.length > 0) {
      for (const succ of successors) {
        const succScheduled = scheduledTasks.get(succ.taskId)!;
        const dep = succ.dependencies.find((d) => d.predecessorId === task.taskId)!;

        let succLateBound: Date;
        switch (dep.type) {
          case 'FS':
            succLateBound = new Date(succScheduled.lateStart.getTime() - dep.lagMinutes * 60000);
            break;
          case 'SS':
            succLateBound = new Date(
              succScheduled.lateStart.getTime() +
                scheduled.expectedDuration * 60000 -
                dep.lagMinutes * 60000
            );
            break;
          default:
            succLateBound = succScheduled.lateStart;
        }

        if (succLateBound < lateFinish) {
          lateFinish = succLateBound;
        }
      }
    }

    // Calculate late start
    const lateStart = new Date(lateFinish.getTime() - scheduled.expectedDuration * 60000);

    // Update scheduled task
    scheduled.lateStart = lateStart;
    scheduled.lateFinish = lateFinish;
  }

  // =========================================================================
  // Float Calculation and Critical Path
  // =========================================================================
  const criticalPathTasks: string[] = [];
  let totalCriticalDuration = 0;
  let totalCriticalComplete = 0;

  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;

    // Total float = Late Start - Early Start (in minutes)
    const totalFloat = Math.round(
      (scheduled.lateStart.getTime() - scheduled.earlyStart.getTime()) / 60000
    );
    scheduled.totalFloat = totalFloat;

    // Free float = min(ES of successors) - EF
    const successors = sortedTasks.filter((t) =>
      t.dependencies.some((d) => d.predecessorId === task.taskId)
    );

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

    // Critical path: tasks with zero total float
    if (Math.abs(totalFloat) < 1) {
      // Allow 1 minute tolerance
      scheduled.isCritical = true;
      criticalPathTasks.push(task.taskId);
      totalCriticalDuration += scheduled.expectedDuration;
      totalCriticalComplete += (scheduled.expectedDuration * scheduled.percentComplete) / 100;
    }
  }

  // =========================================================================
  // Schedule Variance (EVM)
  // =========================================================================
  let totalPlannedValue = 0;
  let totalEarnedValue = 0;

  for (const task of sortedTasks) {
    const scheduled = scheduledTasks.get(task.taskId)!;
    const taskValue = scheduled.expectedDuration; // Use duration as proxy for value

    // PV: Value of work planned to be done
    totalPlannedValue += taskValue;

    // EV: Value of work actually completed
    totalEarnedValue += (taskValue * scheduled.percentComplete) / 100;
  }

  const svMinutes = totalEarnedValue - totalPlannedValue;
  const spi = totalPlannedValue > 0 ? totalEarnedValue / totalPlannedValue : 1;

  let status: 'ahead' | 'on_track' | 'behind' | 'critical';
  if (spi >= 1.1) status = 'ahead';
  else if (spi >= 0.95) status = 'on_track';
  else if (spi >= 0.8) status = 'behind';
  else status = 'critical';

  // =========================================================================
  // Build Result
  // =========================================================================
  const completionPercentage =
    totalCriticalDuration > 0
      ? Math.round((totalCriticalComplete / totalCriticalDuration) * 100)
      : 0;

  // Find bottleneck (first incomplete critical task)
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
    scheduleVariance: {
      svMinutes: Math.round(svMinutes),
      spi: Math.round(spi * 100) / 100,
      status,
    },
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
    percentComplete: parseInt(row['Percent Complete'] || '0', 10),
    dependencies,
    status: row['Status'] || 'Planned',
  };
}
