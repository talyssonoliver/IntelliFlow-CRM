/**
 * Waiver Checker
 *
 * Checks plan-overrides.yaml for waiver status, debt allowance,
 * and exception policies for tasks.
 *
 * @module tools/scripts/lib/sprint-audit/waiver-checker
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// =============================================================================
// Types
// =============================================================================

export type Tier = 'A' | 'B' | 'C';
export type ExceptionPolicy = 'waiver' | 'stub_contract' | 'deferred' | null;

export interface TaskOverride {
  tier?: Tier;
  gate_profile?: string[];
  acceptance_owner?: string;
  debt_allowed?: boolean;
  waiver_expiry?: string;
  evidence_required?: string[];
  override_deps_add?: string[];
  override_deps_remove?: string[];
  exception_policy?: string;
  acceptance_criteria?: string[];
  notes?: string;
}

export interface PlanOverrides {
  schema_version: string;
  last_updated: string;
  maintainer: string;
  linter_config?: {
    fanout_threshold?: number;
    waiver_warning_days?: number;
  };
  gate_profiles?: Record<string, {
    command: string | null;
    description: string;
    required: boolean;
    timeout?: number;
    type?: string;
    threshold?: Record<string, number>;
  }>;
  [taskId: string]: TaskOverride | string | Record<string, unknown>;
}

export interface WaiverStatus {
  hasOverride: boolean;
  tier: Tier | null;
  debtAllowed: boolean;
  hasWaiver: boolean;
  waiverExpiry: string | null;
  waiverExpired: boolean;
  daysUntilExpiry: number | null;
  exceptionPolicy: ExceptionPolicy;
  gateProfile: string[];
  evidenceRequired: string[];
  acceptanceOwner: string | null;
  notes: string | null;
}

// =============================================================================
// Loading
// =============================================================================

let cachedOverrides: PlanOverrides | null = null;
let cachedPath: string | null = null;

/**
 * Loads plan-overrides.yaml
 */
export function loadPlanOverrides(repoRoot: string, forceReload = false): PlanOverrides {
  const overridesPath = path.join(
    repoRoot,
    'apps/project-tracker/docs/metrics/plan-overrides.yaml'
  );

  if (!forceReload && cachedOverrides && cachedPath === overridesPath) {
    return cachedOverrides;
  }

  if (!fs.existsSync(overridesPath)) {
    throw new Error(`plan-overrides.yaml not found at ${overridesPath}`);
  }

  const content = fs.readFileSync(overridesPath, 'utf-8');
  cachedOverrides = yaml.parse(content) as PlanOverrides;
  cachedPath = overridesPath;

  return cachedOverrides;
}

/**
 * Gets override for a specific task
 */
export function getTaskOverride(repoRoot: string, taskId: string): TaskOverride | null {
  const overrides = loadPlanOverrides(repoRoot);
  const override = overrides[taskId];

  if (!override || typeof override === 'string') {
    return null;
  }

  // Skip metadata keys
  if (taskId.startsWith('_') || taskId === 'schema_version' ||
      taskId === 'last_updated' || taskId === 'maintainer' ||
      taskId === 'linter_config' || taskId === 'gate_profiles') {
    return null;
  }

  return override as TaskOverride;
}

// =============================================================================
// Waiver Status
// =============================================================================

/**
 * Calculates days until waiver expiry
 */
function calculateDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Gets comprehensive waiver status for a task
 */
export function getWaiverStatus(repoRoot: string, taskId: string): WaiverStatus {
  const override = getTaskOverride(repoRoot, taskId);

  const defaultStatus: WaiverStatus = {
    hasOverride: false,
    tier: null,
    debtAllowed: false,
    hasWaiver: false,
    waiverExpiry: null,
    waiverExpired: false,
    daysUntilExpiry: null,
    exceptionPolicy: null,
    gateProfile: [],
    evidenceRequired: [],
    acceptanceOwner: null,
    notes: null,
  };

  if (!override) {
    return defaultStatus;
  }

  const waiverExpiry = override.waiver_expiry || null;
  let waiverExpired = false;
  let daysUntilExpiry: number | null = null;

  if (waiverExpiry) {
    daysUntilExpiry = calculateDaysUntilExpiry(waiverExpiry);
    waiverExpired = daysUntilExpiry < 0;
  }

  // Parse exception policy
  let exceptionPolicy: ExceptionPolicy = null;
  if (override.exception_policy) {
    const policy = override.exception_policy.toLowerCase();
    if (policy === 'stub_contract' || policy === 'stub-contract') {
      exceptionPolicy = 'stub_contract';
    } else if (policy === 'waiver') {
      exceptionPolicy = 'waiver';
    } else if (policy === 'deferred') {
      exceptionPolicy = 'deferred';
    }
  }

  return {
    hasOverride: true,
    tier: (override.tier as Tier) || null,
    debtAllowed: override.debt_allowed === true,
    hasWaiver: waiverExpiry !== null,
    waiverExpiry,
    waiverExpired,
    daysUntilExpiry,
    exceptionPolicy,
    gateProfile: override.gate_profile || [],
    evidenceRequired: override.evidence_required || [],
    acceptanceOwner: override.acceptance_owner || null,
    notes: override.notes || null,
  };
}

/**
 * Checks if a task's issues are covered by an active waiver
 */
export function isIssueCoveredByWaiver(
  repoRoot: string,
  taskId: string,
  issueType: 'placeholder' | 'kpi_missed' | 'stub_artifact' | 'empty_artifact'
): boolean {
  const status = getWaiverStatus(repoRoot, taskId);

  // No waiver at all
  if (!status.hasWaiver && !status.exceptionPolicy) {
    return false;
  }

  // Waiver expired
  if (status.waiverExpired) {
    return false;
  }

  // Debt not allowed
  if (!status.debtAllowed) {
    return false;
  }

  // Stub contract exception covers stub artifacts
  if (status.exceptionPolicy === 'stub_contract' && issueType === 'stub_artifact') {
    return true;
  }

  // Active waiver with debt allowed covers most issues
  if (status.hasWaiver && status.debtAllowed) {
    return true;
  }

  return false;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Gets waiver status for multiple tasks
 */
export function getMultipleWaiverStatuses(
  repoRoot: string,
  taskIds: string[]
): Map<string, WaiverStatus> {
  const results = new Map<string, WaiverStatus>();

  for (const taskId of taskIds) {
    results.set(taskId, getWaiverStatus(repoRoot, taskId));
  }

  return results;
}

/**
 * Lists tasks with expiring waivers (within N days)
 */
export function getExpiringWaivers(
  repoRoot: string,
  warningDays: number = 30
): Array<{ taskId: string; expiryDate: string; daysRemaining: number }> {
  const overrides = loadPlanOverrides(repoRoot);
  const expiring: Array<{ taskId: string; expiryDate: string; daysRemaining: number }> = [];

  for (const [taskId, override] of Object.entries(overrides)) {
    if (typeof override !== 'object' || !override) continue;
    if (taskId.startsWith('_') || taskId === 'schema_version') continue;

    const taskOverride = override as TaskOverride;
    if (!taskOverride.waiver_expiry) continue;

    const daysRemaining = calculateDaysUntilExpiry(taskOverride.waiver_expiry);

    if (daysRemaining <= warningDays && daysRemaining >= 0) {
      expiring.push({
        taskId,
        expiryDate: taskOverride.waiver_expiry,
        daysRemaining,
      });
    }
  }

  // Sort by days remaining (soonest first)
  return expiring.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Lists tasks with expired waivers
 */
export function getExpiredWaivers(repoRoot: string): Array<{ taskId: string; expiryDate: string; daysOverdue: number }> {
  const overrides = loadPlanOverrides(repoRoot);
  const expired: Array<{ taskId: string; expiryDate: string; daysOverdue: number }> = [];

  for (const [taskId, override] of Object.entries(overrides)) {
    if (typeof override !== 'object' || !override) continue;
    if (taskId.startsWith('_') || taskId === 'schema_version') continue;

    const taskOverride = override as TaskOverride;
    if (!taskOverride.waiver_expiry) continue;

    const daysRemaining = calculateDaysUntilExpiry(taskOverride.waiver_expiry);

    if (daysRemaining < 0) {
      expired.push({
        taskId,
        expiryDate: taskOverride.waiver_expiry,
        daysOverdue: Math.abs(daysRemaining),
      });
    }
  }

  // Sort by days overdue (most overdue first)
  return expired.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// =============================================================================
// Gate Profile Helpers
// =============================================================================

/**
 * Gets the required gates for a task
 */
export function getRequiredGates(repoRoot: string, taskId: string): string[] {
  const status = getWaiverStatus(repoRoot, taskId);
  return status.gateProfile;
}

/**
 * Gets the evidence required for a task
 */
export function getRequiredEvidence(repoRoot: string, taskId: string): string[] {
  const status = getWaiverStatus(repoRoot, taskId);
  return status.evidenceRequired;
}

/**
 * Gets gate profile definitions
 */
export function getGateProfiles(repoRoot: string): Record<string, {
  command: string | null;
  description: string;
  required: boolean;
  timeout?: number;
}> {
  const overrides = loadPlanOverrides(repoRoot);
  return overrides.gate_profiles || {};
}
