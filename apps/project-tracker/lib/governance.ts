/**
 * Governance utilities for reading plan-overrides, review-queue, and debt-ledger
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
  TaskOverride,
  ReviewQueue,
  LintReport,
  DebtLedger,
  GovernanceSummary,
  TaskTier,
  TaskWithGovernance,
  Task,
} from './types';
import { PATHS } from './paths';

// File paths using centralized path configuration
const PLAN_OVERRIDES_PATH = path.join(PATHS.sprintTracking.root, 'plan-overrides.yaml');
const REVIEW_QUEUE_PATH = path.join(PATHS.sprintTracking.root, 'review-queue.json');
const LINT_REPORT_PATH = path.join(PATHS.artifacts.reports, 'plan-lint-report.json');
const PHANTOM_AUDIT_PATH = path.join(PATHS.artifacts.reports, 'phantom-completion-audit.json');
const DEBT_LEDGER_PATH = path.join(PATHS.docs.root, 'debt-ledger.yaml');
const SPRINT_SUMMARY_PATH = path.join(PATHS.sprintTracking.sprint0, '_summary.json');

// Interface for sprint summary task data
interface SprintTaskSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  failed: number;
}

interface CompletedTask {
  task_id: string;
  completed_at: string;
  duration_minutes: number;
}

interface SprintSummary {
  sprint: string;
  task_summary: SprintTaskSummary;
  completed_tasks: CompletedTask[];
}

/**
 * Load and parse plan-overrides.yaml
 */
export function loadPlanOverrides(): Record<string, TaskOverride> {
  try {
    if (!fs.existsSync(PLAN_OVERRIDES_PATH)) {
      console.warn('plan-overrides.yaml not found at:', PLAN_OVERRIDES_PATH);
      return {};
    }

    const content = fs.readFileSync(PLAN_OVERRIDES_PATH, 'utf8');
    const data = yaml.load(content) as Record<string, any>;

    // Convert YAML structure to TaskOverride objects
    const overrides: Record<string, TaskOverride> = {};

    for (const [taskId, override] of Object.entries(data)) {
      // Skip metadata fields
      if (
        taskId.startsWith('_') ||
        taskId === 'schema_version' ||
        taskId === 'last_updated' ||
        taskId === 'maintainer' ||
        taskId === 'gate_profiles'
      ) {
        continue;
      }

      if (typeof override === 'object' && override !== null) {
        overrides[taskId] = {
          taskId,
          tier: (override.tier as TaskTier) || 'C',
          gateProfile: override.gate_profile || [],
          acceptanceOwner: override.acceptance_owner,
          debtAllowed: override.debt_allowed === true || override.debt_allowed === 'yes',
          waiverExpiry: override.waiver_expiry,
          evidenceRequired: override.evidence_required || [],
          overrideDepsAdd: override.override_deps_add,
          overrideDepsRemove: override.override_deps_remove,
          sprintOverride: override.sprint_override,
          exceptionPolicy: override.exception_policy,
          notes: override.notes,
        };
      }
    }

    return overrides;
  } catch (error) {
    console.error('Error loading plan-overrides.yaml:', error);
    return {};
  }
}

/**
 * Load gate profile definitions from plan-overrides.yaml
 */
export function loadGateProfiles(): Record<
  string,
  { command: string; description: string; required: boolean }
> {
  try {
    if (!fs.existsSync(PLAN_OVERRIDES_PATH)) {
      return {};
    }

    const content = fs.readFileSync(PLAN_OVERRIDES_PATH, 'utf8');
    const data = yaml.load(content) as Record<string, any>;

    return data.gate_profiles || {};
  } catch (error) {
    console.error('Error loading gate profiles:', error);
    return {};
  }
}

/**
 * Load review-queue.json
 */
export function loadReviewQueue(): ReviewQueue | null {
  try {
    if (!fs.existsSync(REVIEW_QUEUE_PATH)) {
      console.warn('review-queue.json not found at:', REVIEW_QUEUE_PATH);
      return null;
    }

    const content = fs.readFileSync(REVIEW_QUEUE_PATH, 'utf8');
    return JSON.parse(content) as ReviewQueue;
  } catch (error) {
    console.error('Error loading review-queue.json:', error);
    return null;
  }
}

/**
 * Load plan-lint-report.json
 */
export function loadLintReport(): LintReport | null {
  try {
    if (!fs.existsSync(LINT_REPORT_PATH)) {
      console.warn('plan-lint-report.json not found at:', LINT_REPORT_PATH);
      return null;
    }

    const content = fs.readFileSync(LINT_REPORT_PATH, 'utf8');
    return JSON.parse(content) as LintReport;
  } catch (error) {
    console.error('Error loading plan-lint-report.json:', error);
    return null;
  }
}

/**
 * Phantom completion audit types
 */
export interface PhantomCompletionAudit {
  audit_metadata: {
    generated_at: string;
    audit_type: string;
    sprint_scope: number;
    severity: string;
  };
  summary: {
    total_completed_tasks: number;
    verified_completions: number;
    phantom_completions: number;
    integrity_score: string;
    conclusion: string;
  };
  verified_tasks: Array<{
    task_id: string;
    description: string;
    artifacts_verified?: string[];
    note?: string;
  }>;
  phantom_completions: Array<{
    task_id: string;
    description: string;
    status_claimed: string;
    missing_artifacts: string[];
    partially_exists?: string[];
    note?: string;
  }>;
  recommendations: Array<{
    priority: string;
    action: string;
    details?: string;
    impact?: string;
  }>;
  root_cause_analysis: {
    primary_cause: string;
    contributing_factors: string[];
    mitigation: string;
  };
}

/**
 * Load phantom-completion-audit.json
 */
export function loadPhantomCompletionAudit(): PhantomCompletionAudit | null {
  try {
    if (!fs.existsSync(PHANTOM_AUDIT_PATH)) {
      console.warn('phantom-completion-audit.json not found at:', PHANTOM_AUDIT_PATH);
      return null;
    }

    const content = fs.readFileSync(PHANTOM_AUDIT_PATH, 'utf8');
    return JSON.parse(content) as PhantomCompletionAudit;
  } catch (error) {
    console.error('Error loading phantom-completion-audit.json:', error);
    return null;
  }
}

/**
 * Load sprint summary from _summary.json
 */
export function loadSprintSummary(): SprintSummary | null {
  try {
    if (!fs.existsSync(SPRINT_SUMMARY_PATH)) {
      console.warn('_summary.json not found at:', SPRINT_SUMMARY_PATH);
      return null;
    }

    const content = fs.readFileSync(SPRINT_SUMMARY_PATH, 'utf8');
    return JSON.parse(content) as SprintSummary;
  } catch (error) {
    console.error('Error loading _summary.json:', error);
    return null;
  }
}

/**
 * Load debt-ledger.yaml
 */
export function loadDebtLedger(): DebtLedger | null {
  try {
    if (!fs.existsSync(DEBT_LEDGER_PATH)) {
      console.warn('debt-ledger.yaml not found at:', DEBT_LEDGER_PATH);
      return null;
    }

    const content = fs.readFileSync(DEBT_LEDGER_PATH, 'utf8');
    const data = yaml.load(content) as any;

    return {
      schema_version: data.schema_version || '1.0.0',
      last_updated: data.last_updated || new Date().toISOString(),
      items: data.items || {},
      summary: data.summary || {
        total_items: 0,
        by_severity: {},
        by_status: {},
        expiring_soon: [],
      },
    };
  } catch (error) {
    console.error('Error loading debt-ledger.yaml:', error);
    return null;
  }
}

/**
 * Get governance summary for a sprint
 */
export function getGovernanceSummary(sprint: number = 0): GovernanceSummary {
  const overrides = loadPlanOverrides();
  const reviewQueue = loadReviewQueue();
  const lintReport = loadLintReport();
  const debtLedger = loadDebtLedger();
  const sprintSummary = loadSprintSummary();

  // Count tiers
  const tierBreakdown = { A: 0, B: 0, C: 0 };
  for (const override of Object.values(overrides)) {
    tierBreakdown[override.tier]++;
  }

  // Count expiring waivers (within 30 days)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let expiringWaivers = 0;

  for (const override of Object.values(overrides)) {
    if (override.waiverExpiry) {
      const expiry = new Date(override.waiverExpiry);
      if (expiry <= thirtyDaysFromNow && expiry > now) {
        expiringWaivers++;
      }
    }
  }

  // Get completed task IDs for tier completion breakdown
  const completedTaskIds = new Set(sprintSummary?.completed_tasks?.map((t) => t.task_id) || []);

  // Calculate completion per tier
  const tierCompletion = {
    A: { done: 0, total: 0 },
    B: { done: 0, total: 0 },
    C: { done: 0, total: 0 },
  };
  for (const [taskId, override] of Object.entries(overrides)) {
    tierCompletion[override.tier].total++;
    if (completedTaskIds.has(taskId)) {
      tierCompletion[override.tier].done++;
    }
  }

  return {
    sprint,
    tierBreakdown,
    tierCompletion,
    taskSummary: sprintSummary?.task_summary || {
      total: 0,
      done: 0,
      in_progress: 0,
      blocked: 0,
      not_started: 0,
      failed: 0,
    },
    validationCoverage: lintReport?.summary.validation_coverage.coverage_percentage || 0,
    reviewQueueSize: reviewQueue?.items.length || 0,
    errorCount: lintReport?.summary.error_count || 0,
    warningCount: lintReport?.summary.warning_count || 0,
    debtItems: debtLedger?.summary.total_items || 0,
    expiringWaivers,
    lastLintRun: lintReport?.meta.generated_at,
  };
}

/**
 * Get override for a specific task
 */
export function getTaskOverride(taskId: string): TaskOverride | null {
  const overrides = loadPlanOverrides();
  return overrides[taskId] || null;
}

/**
 * Enhance a task with governance data
 */
export function enhanceTaskWithGovernance(task: Task): TaskWithGovernance {
  const override = getTaskOverride(task.id);
  const reviewQueue = loadReviewQueue();

  if (!override) {
    return task as TaskWithGovernance;
  }

  // Check if task is in review queue
  const reviewItem = reviewQueue?.items.find((item) => item.task_id === task.id);

  // Check evidence status (simplified - just check if files exist)
  const evidenceStatus: Record<string, boolean> = {};
  for (const evidence of override.evidenceRequired) {
    // For now, mark as pending - actual file checking would need fs access
    evidenceStatus[evidence] = false;
  }

  return {
    ...task,
    governance: {
      tier: override.tier,
      gateProfile: override.gateProfile,
      gateStatus: {}, // Would need actual gate execution results
      acceptanceOwner: override.acceptanceOwner,
      evidenceRequired: override.evidenceRequired,
      evidenceStatus,
      debtAllowed: override.debtAllowed,
      waiverExpiry: override.waiverExpiry,
      inReviewQueue: !!reviewItem,
      reviewReasons: reviewItem?.reasons,
    },
  };
}

/**
 * Get tasks grouped by tier
 */
export function getTasksByTier(): { A: string[]; B: string[]; C: string[] } {
  const overrides = loadPlanOverrides();
  const result = { A: [] as string[], B: [] as string[], C: [] as string[] };

  for (const [taskId, override] of Object.entries(overrides)) {
    result[override.tier].push(taskId);
  }

  return result;
}

/**
 * Detailed task info for tier display
 */
export interface TierTaskDetail {
  taskId: string;
  status: 'done' | 'pending' | 'blocked';
  acceptanceOwner?: string;
  hasLintErrors: boolean;
  lintErrorTypes: string[];
  evidenceRequired: string[];
  gateProfile: string[];
  waiverExpiry?: string;
  debtAllowed: boolean;
}

// Helper to build lint errors map (extracted to reduce cognitive complexity)
function buildTaskLintErrorsMap(lintReport: LintReport | null): Record<string, string[]> {
  const taskLintErrors: Record<string, string[]> = {};
  if (!lintReport?.errors) return taskLintErrors;

  for (const error of lintReport.errors) {
    for (const taskId of error.tasks || []) {
      if (!taskLintErrors[taskId]) {
        taskLintErrors[taskId] = [];
      }
      if (!taskLintErrors[taskId].includes(error.rule)) {
        taskLintErrors[taskId].push(error.rule);
      }
    }
  }
  return taskLintErrors;
}

// Helper to compare tier tasks for sorting
function compareTierTasks(a: TierTaskDetail, b: TierTaskDetail): number {
  // Pending before done
  if (a.status !== b.status) {
    return a.status === 'pending' ? -1 : 1;
  }
  // If both pending, errors first
  if (a.status === 'pending' && a.hasLintErrors !== b.hasLintErrors) {
    return a.hasLintErrors ? -1 : 1;
  }
  // Alphabetical by taskId
  return a.taskId.localeCompare(b.taskId);
}

/**
 * Get detailed tasks grouped by tier with status and lint info
 */
export function getDetailedTasksByTier(): {
  A: TierTaskDetail[];
  B: TierTaskDetail[];
  C: TierTaskDetail[];
} {
  const overrides = loadPlanOverrides();
  const sprintSummary = loadSprintSummary();
  const lintReport = loadLintReport();

  const completedTaskIds = new Set(sprintSummary?.completed_tasks?.map((t) => t.task_id) || []);
  const taskLintErrors = buildTaskLintErrorsMap(lintReport);

  const result: { A: TierTaskDetail[]; B: TierTaskDetail[]; C: TierTaskDetail[] } = {
    A: [],
    B: [],
    C: [],
  };

  for (const [taskId, override] of Object.entries(overrides)) {
    const isDone = completedTaskIds.has(taskId);
    const lintErrors = taskLintErrors[taskId] || [];

    const detail: TierTaskDetail = {
      taskId,
      status: isDone ? 'done' : 'pending',
      acceptanceOwner: override.acceptanceOwner,
      hasLintErrors: lintErrors.length > 0,
      lintErrorTypes: lintErrors,
      evidenceRequired: override.evidenceRequired,
      gateProfile: override.gateProfile,
      waiverExpiry: override.waiverExpiry,
      debtAllowed: override.debtAllowed,
    };

    result[override.tier].push(detail);
  }

  // Sort each tier: pending first (with errors at top), then done
  for (const tier of ['A', 'B', 'C'] as const) {
    result[tier].sort(compareTierTasks);
  }

  return result;
}

/**
 * Check if governance files exist
 */
export function checkGovernanceFilesExist(): {
  planOverrides: boolean;
  reviewQueue: boolean;
  lintReport: boolean;
  debtLedger: boolean;
} {
  return {
    planOverrides: fs.existsSync(PLAN_OVERRIDES_PATH),
    reviewQueue: fs.existsSync(REVIEW_QUEUE_PATH),
    lintReport: fs.existsSync(LINT_REPORT_PATH),
    debtLedger: fs.existsSync(DEBT_LEDGER_PATH),
  };
}
