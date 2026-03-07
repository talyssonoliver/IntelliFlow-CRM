/**
 * Priority Scorer — Smart Work Queue Engine
 *
 * Implements a WSJF-inspired (Weighted Shortest Job First) prioritization
 * algorithm adapted for the IntelliFlow project tracker.
 *
 * METHODOLOGY (based on SAFe WSJF + CPM):
 *   Priority = Cost of Delay / Job Size Proxy
 *
 * Cost of Delay is the sum of three Fibonacci-scaled (1-13) dimensions:
 *   1. Business Value — governance tier (A/B/C) + critical path membership
 *   2. Time Criticality — Total Float from CPM (negative = overdue) + sprint distance
 *   3. Risk Reduction / Opportunity Enablement — fan-out (downstream unblocking) + phase health
 *
 * Job Size Proxy uses pipeline progress to approximate remaining effort:
 *   - exec-ready = 1 (smallest remaining work)
 *   - plan-ready  = 2
 *   - needs-spec  = 3 (most remaining work)
 *
 * Buckets are assigned by percentile rank within the scored set:
 *   - NOW  = top 20% OR overdue (negative float) OR critical-path Tier A
 *   - NEXT = middle 40%
 *   - WAIT = bottom 40%
 *
 * References:
 *   - SAFe WSJF: https://framework.scaledagile.com/wsjf
 *   - CPM / Total Float: schedule-calculator.ts (lines 430-467)
 *   - Governance tiers: governance.ts computeDefaultTier()
 *   - Feature Matrix forecast risk: tools/scripts/generate-feature-matrix.ps1
 */

import type { Task } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriorityFactors {
  /** Fibonacci 1-13 — governance tier + critical path membership */
  businessValue: number;
  /** Fibonacci 1-13 — schedule pressure from CPM float + sprint proximity */
  timeCriticality: number;
  /** Fibonacci 1-13 — downstream unblocking potential + phase health */
  riskReductionOpportunity: number;
  /** 1-3 — pipeline remaining effort (lower = closer to delivery) */
  jobSizeProxy: number;
}

export interface ScoredTask {
  taskId: string;
  task: Task;
  /** WSJF score = (BV + TC + RROE) / jobSizeProxy */
  score: number;
  factors: PriorityFactors;
  /** Human-readable explanation of top contributing factors */
  reason: string;
  recommendedAction: 'spec' | 'plan' | 'exec';
  bucket: 'now' | 'next' | 'wait';
  /** Sprint number from CSV Target Sprint column */
  sprintNumber: number;
  /** Parallel execution group ID (if task belongs to one) */
  parallelGroupId: string | null;
}

/** Dependency-graph node (from /api/dependency-graph `nodes` map) */
export interface DepGraphNode {
  task_id: string;
  dependencies: string[];
  dependents: string[];
}

/** Session status for a single task (from /api/tasks/plan) */
export interface SessionStatus {
  hasSpec: boolean;
  hasPlan: boolean;
}

/** Phase progress entry (from /api/sprint/progress) */
export interface PhaseProgress {
  phaseId: string;
  phaseName: string;
  total: number;
  completed: number;
  inProgress: number;
  percentage: number;
}

/**
 * Schedule task info from /api/schedule/calculate
 * Includes CPM-computed fields that replace naive date comparisons.
 */
export interface ScheduleTaskInfo {
  taskId: string;
  /** ISO 8601 — projected finish from forward pass */
  earlyFinish?: string;
  /** CPM Total Float = LS - ES in minutes. Negative = overdue */
  totalFloat?: number;
  isCritical?: boolean;
}

// ---------------------------------------------------------------------------
// Fibonacci scale mapping
// ---------------------------------------------------------------------------

/** Modified Fibonacci sequence used in SAFe WSJF (1,2,3,5,8,13) */
const FIB = [1, 2, 3, 5, 8, 13] as const;

/**
 * Map a continuous value [0..1] to the Fibonacci scale.
 * 0 → 1 (lowest), 1 → 13 (highest)
 */
function toFibonacci(normalized: number): number {
  const clamped = Math.max(0, Math.min(1, normalized));
  const idx = Math.round(clamped * (FIB.length - 1));
  return FIB[idx];
}

// ---------------------------------------------------------------------------
// Factor 1: Business Value (Fibonacci 1-13)
// ---------------------------------------------------------------------------

/**
 * Business Value combines:
 *   - Governance tier: A=high, B=medium, C=low
 *   - Critical path membership: bonus for tasks on the critical path
 *
 * Governance tiers (from governance.ts computeDefaultTier):
 *   A = security, foundational IFC-001..010, 5+ dependents, exceptions, strategy
 *   B = ENV setup, AI-SETUP, automation, 2-4 dependents
 *   C = everything else
 */
function isTierAId(taskId: string, lcSection: string, dependentCount: number): boolean {
  if (taskId.includes('SEC') || lcSection.includes('security')) return true;
  if (taskId.startsWith('IFC-0') && Number.parseInt(taskId.replace('IFC-', ''), 10) <= 10) return true;
  if (dependentCount >= 5) return true;
  if (taskId.startsWith('EXC-')) return true;
  if (lcSection.includes('planning') || lcSection.includes('strategy')) return true;
  if (
    taskId.startsWith('DOC-001') ||
    taskId.startsWith('BRAND-001') ||
    taskId.startsWith('GTM-') ||
    taskId.startsWith('ANALYTICS-001')
  )
    return true;
  return false;
}

function isTierBId(taskId: string, dependentCount: number): boolean {
  if (taskId.startsWith('ENV-') || taskId.startsWith('AI-SETUP-')) return true;
  if (taskId.startsWith('AUTOMATION-')) return true;
  if (dependentCount >= 2) return true;
  if (taskId.startsWith('ENG-OPS-') || taskId.startsWith('PM-OPS-')) return true;
  return false;
}

export function scoreBusinessValue(
  taskId: string,
  section: string,
  dependentCount: number,
  isCriticalPath: boolean
): number {
  const lcSection = section.toLowerCase();

  let tierScore: number;
  if (isTierAId(taskId, lcSection, dependentCount)) {
    tierScore = 0.85; // Tier A → Fibonacci 8-13
  } else if (isTierBId(taskId, dependentCount)) {
    tierScore = 0.5; // Tier B → Fibonacci 3-5
  } else {
    tierScore = 0.2; // Tier C → Fibonacci 1-2
  }

  if (isCriticalPath) {
    tierScore = Math.min(1, tierScore + 0.3);
  }

  return toFibonacci(tierScore);
}

// ---------------------------------------------------------------------------
// Factor 2: Time Criticality (Fibonacci 1-13)
// ---------------------------------------------------------------------------

/**
 * Time Criticality combines:
 *   - CPM Total Float (schedule-calculator.ts lines 448-452)
 *     Negative float = overdue (highest urgency)
 *     Zero float = critical path (no slack)
 *     Positive float = increasing slack
 *   - Sprint distance: closer sprint = more urgent
 *
 * This replaces the naive earlyFinish date comparison with proper
 * CPM-based schedule pressure metrics.
 */
function floatToScore(totalFloat: number): number {
  if (totalFloat <= 0) return 1;
  if (totalFloat <= 60) return 0.8;
  if (totalFloat <= 480) return 0.6;
  if (totalFloat <= 2400) return 0.3;
  return 0;
}

function earlyFinishToScore(earlyFinish: string): number {
  const diffMs = new Date(earlyFinish).getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 1;
  if (diffDays < 1) return 0.8;
  if (diffDays < 7) return 0.5;
  if (diffDays < 14) return 0.2;
  return 0;
}

function sprintDistanceToScore(taskSprint: number | string, currentSprint: number): number {
  if (typeof taskSprint !== 'number') return 0;
  const distance = taskSprint - currentSprint;
  if (distance <= 0) return 1;
  if (distance === 1) return 0.6;
  if (distance === 2) return 0.3;
  return 0;
}

export function scoreTimeCriticality(
  taskId: string,
  scheduleTaskMap: Map<string, ScheduleTaskInfo>,
  taskSprint: number | string,
  currentSprint: number
): number {
  const info = scheduleTaskMap.get(taskId);
  let floatScore = 0;

  if (info?.totalFloat !== undefined) {
    floatScore = floatToScore(info.totalFloat);
  } else if (info?.earlyFinish) {
    floatScore = earlyFinishToScore(info.earlyFinish);
  }

  const sprintScore = sprintDistanceToScore(taskSprint, currentSprint);
  const combined = floatScore * 0.6 + sprintScore * 0.4;
  return toFibonacci(combined);
}

// ---------------------------------------------------------------------------
// Factor 3: Risk Reduction / Opportunity Enablement (Fibonacci 1-13)
// ---------------------------------------------------------------------------

/**
 * RROE captures the "multiplier effect" of completing this task:
 *   - Fan-out: how many downstream tasks are unblocked
 *     (Matches Feature Matrix "execution risk" concept: unresolved dependencies)
 *   - Phase health: if the task's sprint has a phase falling behind,
 *     completing this task reduces schedule risk
 *
 * From SAFe: "highlight jobs that may not bring revenue immediately
 * but benefit the long-run" — a high fan-out task is exactly that.
 */
function computePhaseHealthScore(phaseProgress: PhaseProgress[]): number {
  if (phaseProgress.length === 0) return 0;
  const phasesWithTasks = phaseProgress.filter((p) => p.total > 0);
  if (phasesWithTasks.length === 0) return 0;
  const minPct = Math.min(...phasesWithTasks.map((p) => p.percentage));
  if (minPct < 50) return 1;
  if (minPct < 75) return 0.5;
  return 0;
}

export function scoreRiskReduction(dependentCount: number, phaseProgress: PhaseProgress[]): number {
  // Fan-out: 0 deps → 0, 1 → 0.15, 2 → 0.3, 3 → 0.5, 4 → 0.7, 5+ → 0.9
  const fanOutScore = Math.min(dependentCount / 5.5, 1);
  const phaseScore = computePhaseHealthScore(phaseProgress);
  const combined = fanOutScore * 0.7 + phaseScore * 0.3;
  return toFibonacci(combined);
}

// ---------------------------------------------------------------------------
// Job Size Proxy (denominator)
// ---------------------------------------------------------------------------

/**
 * Approximates remaining effort via pipeline stage.
 * Lower = less work remaining = higher WSJF priority.
 *
 *   exec-ready (spec + plan done) → 1  (just needs execution)
 *   plan-ready (spec done)        → 2  (needs plan + execution)
 *   needs-spec                    → 3  (needs full pipeline)
 */
export function computeJobSizeProxy(session: SessionStatus | undefined): number {
  if (!session) return 3;
  if (session.hasSpec && session.hasPlan) return 1;
  if (session.hasSpec) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Recommended action
// ---------------------------------------------------------------------------

function getRecommendedAction(session: SessionStatus | undefined): 'spec' | 'plan' | 'exec' {
  if (!session) return 'spec';
  if (session.hasSpec && session.hasPlan) return 'exec';
  if (session.hasSpec) return 'plan';
  return 'spec';
}

// ---------------------------------------------------------------------------
// Reason string builder
// ---------------------------------------------------------------------------

function buildReason(
  factors: PriorityFactors,
  dependentCount: number,
  isCriticalPath: boolean,
  totalFloat: number | undefined
): string {
  const parts: string[] = [];

  if (isCriticalPath) parts.push('Critical path');
  if (totalFloat !== undefined && totalFloat <= 0) parts.push('Overdue');
  else if (totalFloat !== undefined && totalFloat <= 60) parts.push('Due today');
  if (dependentCount >= 3) parts.push(`Unblocks ${dependentCount} tasks`);
  if (factors.jobSizeProxy === 1) parts.push('Exec ready');
  if (factors.businessValue >= 8) parts.push('Tier A');
  if (factors.riskReductionOpportunity >= 8) parts.push('High fan-out');
  if (factors.timeCriticality >= 8) parts.push('Current sprint');

  return parts.length > 0 ? parts.join(' \u00b7 ') : 'Ready';
}

// ---------------------------------------------------------------------------
// Bucket assignment (percentile-based)
// ---------------------------------------------------------------------------

/**
 * Assigns buckets using percentile rank within the scored set,
 * with hard overrides for overdue/critical-path Tier A tasks.
 *
 * Percentile thresholds:
 *   - NOW:  top 20% of tasks by score
 *   - NEXT: middle 40%
 *   - WAIT: bottom 40%
 *
 * Hard overrides (always NOW):
 *   - Negative Total Float (overdue per CPM)
 *   - Critical-path AND Tier A governance
 */
function assignBuckets(scoredTasks: ScoredTaskInternal[]): void {
  if (scoredTasks.length === 0) return;

  // Percentile thresholds
  const total = scoredTasks.length;
  const nowCutoff = Math.max(1, Math.ceil(total * 0.2));
  const nextCutoff = Math.ceil(total * 0.6);

  for (let i = 0; i < scoredTasks.length; i++) {
    const s = scoredTasks[i];

    // Hard override: overdue (negative float)
    if (s._totalFloat !== undefined && s._totalFloat <= 0) {
      s.bucket = 'now';
      continue;
    }

    // Hard override: critical path + high business value
    if (s._isCriticalPath && s.factors.businessValue >= 8) {
      s.bucket = 'now';
      continue;
    }

    // Percentile rank (array is already sorted descending by score)
    if (i < nowCutoff) {
      s.bucket = 'now';
    } else if (i < nextCutoff) {
      s.bucket = 'next';
    } else {
      s.bucket = 'wait';
    }
  }
}

/** Parallel execution group from dependency graph */
export interface ParallelGroup {
  group_id: string;
  tasks: string[];
}

/** Internal type with extra fields for bucket assignment */
interface ScoredTaskInternal extends ScoredTask {
  _isCriticalPath: boolean;
  _totalFloat: number | undefined;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function buildTaskGroupMap(parallelGroups?: ParallelGroup[]): Map<string, string> {
  const taskToGroupMap = new Map<string, string>();
  if (!parallelGroups) return taskToGroupMap;
  for (const group of parallelGroups) {
    for (const taskId of group.tasks) {
      taskToGroupMap.set(taskId, group.group_id);
    }
  }
  return taskToGroupMap;
}

function scoreTask(
  task: Task,
  ctx: {
    depGraphNodes: Map<string, DepGraphNode>;
    criticalPathIds: Set<string>;
    sessionStatuses: Map<string, SessionStatus>;
    scheduleTaskMap: Map<string, ScheduleTaskInfo>;
    phaseProgress: PhaseProgress[];
    effectiveSprint: number;
    taskToGroupMap: Map<string, string>;
  }
): ScoredTaskInternal {
  const session = ctx.sessionStatuses.get(task.id);
  const node = ctx.depGraphNodes.get(task.id);
  const dependentCount = node?.dependents.length ?? 0;
  const isCriticalPath = ctx.criticalPathIds.has(task.id);
  const scheduleInfo = ctx.scheduleTaskMap.get(task.id);

  const businessValue = scoreBusinessValue(task.id, task.section, dependentCount, isCriticalPath);
  const timeCriticality = scoreTimeCriticality(task.id, ctx.scheduleTaskMap, task.sprint, ctx.effectiveSprint);
  const riskReductionOpportunity = scoreRiskReduction(dependentCount, ctx.phaseProgress);
  const jobSizeProxy = computeJobSizeProxy(session);

  const factors: PriorityFactors = { businessValue, timeCriticality, riskReductionOpportunity, jobSizeProxy };
  const costOfDelay = businessValue + timeCriticality + riskReductionOpportunity;
  const score = Math.round((costOfDelay / jobSizeProxy) * 100) / 100;

  return {
    taskId: task.id,
    task,
    score,
    factors,
    reason: buildReason(factors, dependentCount, isCriticalPath, scheduleInfo?.totalFloat),
    recommendedAction: getRecommendedAction(session),
    bucket: 'wait' as const,
    sprintNumber: typeof task.sprint === 'number' ? task.sprint : 0,
    parallelGroupId: ctx.taskToGroupMap.get(task.id) ?? null,
    _isCriticalPath: isCriticalPath,
    _totalFloat: scheduleInfo?.totalFloat,
  };
}

export function computePriorityScores(
  readyTasks: Task[],
  depGraphNodes: Map<string, DepGraphNode>,
  criticalPathIds: Set<string>,
  sessionStatuses: Map<string, SessionStatus>,
  scheduleTaskMap: Map<string, ScheduleTaskInfo>,
  phaseProgress: PhaseProgress[],
  currentSprint?: number,
  parallelGroups?: ParallelGroup[]
): ScoredTask[] {
  const effectiveSprint =
    currentSprint ??
    Math.min(
      ...readyTasks.filter((t) => typeof t.sprint === 'number').map((t) => t.sprint as number),
      0
    );

  const taskToGroupMap = buildTaskGroupMap(parallelGroups);
  const ctx = { depGraphNodes, criticalPathIds, sessionStatuses, scheduleTaskMap, phaseProgress, effectiveSprint, taskToGroupMap };

  const scored: ScoredTaskInternal[] = readyTasks.map((task) => scoreTask(task, ctx));

  // Sort descending by WSJF score (used for bucket assignment + NEXT/WAIT ordering)
  scored.sort((a, b) => b.score - a.score);

  // Assign NOW / NEXT / WAIT based on percentile rank + hard overrides
  assignBuckets(scored);

  // Apply 3-level sort to NOW bucket tasks only:
  //   1. Sprint number ascending (lower sprint = work on first)
  //   2. Pipeline readiness ascending (exec-ready=1, plan-ready=2, needs-spec=3)
  //   3. WSJF score descending (tiebreaker)
  // NEXT/WAIT keep pure WSJF ordering.
  const nowTasks = scored.filter((s) => s.bucket === 'now');
  const otherTasks = scored.filter((s) => s.bucket !== 'now');

  nowTasks.sort((a, b) => {
    // 1. Sprint number ascending
    if (a.sprintNumber !== b.sprintNumber) return a.sprintNumber - b.sprintNumber;
    // 2. Pipeline readiness ascending (lower jobSizeProxy = more ready)
    if (a.factors.jobSizeProxy !== b.factors.jobSizeProxy)
      return a.factors.jobSizeProxy - b.factors.jobSizeProxy;
    // 3. WSJF score descending
    return b.score - a.score;
  });

  const result = [...nowTasks, ...otherTasks];

  // Strip internal fields before returning
  return result.map(({ _isCriticalPath, _totalFloat, ...rest }) => rest);
}
