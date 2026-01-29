/**
 * Action Tracker
 *
 * Creates and manages action items from audit findings.
 * Integrates with debt-ledger.yaml for remediation tracking.
 *
 * @module tools/scripts/lib/sprint-audit/action-tracker
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { TaskAttestation } from './attestation-generator';

// =============================================================================
// Types
// =============================================================================

export type ActionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ActionStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';
export type ActionType = 'missing_artifact' | 'failed_validation' | 'missed_kpi' | 'placeholder' | 'waiver_expired' | 'blocked_dependency';

export interface ActionItem {
  id: string;
  origin_task: string;
  type: ActionType;
  severity: ActionSeverity;
  description: string;
  created_at: string;
  expiry_date?: string;
  remediation_plan?: string;
  remediation_sprint?: number;
  status: ActionStatus;
  owner?: string;
  notes?: string;
}

export interface DebtLedger {
  schema_version: string;
  last_updated: string;
  maintainer: string;
  items: Record<string, {
    origin_task: string;
    owner: string;
    severity: ActionSeverity;
    description: string;
    created_at: string;
    expiry_date: string;
    remediation_plan: string;
    remediation_sprint: number;
    status: ActionStatus;
    notes?: string;
  }>;
  summary: {
    total_items: number;
    by_severity: Record<ActionSeverity, number>;
    by_status: Record<ActionStatus, number>;
    expiring_soon: string[];
  };
  review_schedule: {
    cadence: string;
    next_review: string;
    reviewers: string[];
    escalation_path: Record<string, string>;
  };
  alerts: {
    expiry_warning_days: number;
    notification_channels: string[];
  };
}

export interface ReviewQueueItem {
  task_id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tier: 'A' | 'B' | 'C';
  reasons: string[];
  evidence_missing: boolean;
  waiver_expiry?: string;
  created_at: string;
  action_items: string[];
}

// =============================================================================
// Action ID Generation
// =============================================================================

function generateActionId(taskId: string, type: ActionType, index: number): string {
  const typePrefix: Record<ActionType, string> = {
    missing_artifact: 'MISS',
    failed_validation: 'FAIL',
    missed_kpi: 'KPI',
    placeholder: 'PLCH',
    waiver_expired: 'WAIV',
    blocked_dependency: 'BLCK',
  };

  return `${typePrefix[type]}-${taskId}-${String(index).padStart(3, '0')}`;
}

// =============================================================================
// Action Creation from Attestation
// =============================================================================

/**
 * Creates action items from attestation findings
 */
export function createActionsFromAttestation(
  attestation: TaskAttestation,
  defaultOwner: string = 'Tech Lead'
): ActionItem[] {
  const actions: ActionItem[] = [];
  const now = new Date().toISOString();
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let index = 1;

  // Missing/failed artifacts
  const artifactIssues = Object.entries(attestation.artifact_hashes).length === 0 &&
    attestation.evidence_summary.artifacts_verified === 0;

  if (artifactIssues) {
    actions.push({
      id: generateActionId(attestation.task_id, 'missing_artifact', index++),
      origin_task: attestation.task_id,
      type: 'missing_artifact',
      severity: 'critical',
      description: `Task ${attestation.task_id} has no verified artifacts`,
      created_at: now,
      expiry_date: defaultExpiry,
      status: 'open',
      owner: defaultOwner,
      remediation_plan: 'Create all required artifacts listed in Sprint_plan.csv',
    });
  }

  // Failed validations
  if (attestation.evidence_summary.validations_failed > 0) {
    const failedValidations = attestation.validation_results.filter((v) => !v.passed);
    for (const v of failedValidations) {
      actions.push({
        id: generateActionId(attestation.task_id, 'failed_validation', index++),
        origin_task: attestation.task_id,
        type: 'failed_validation',
        severity: 'critical',
        description: `Validation failed: ${v.command} (exit code: ${v.exit_code})`,
        created_at: now,
        expiry_date: defaultExpiry,
        status: 'open',
        owner: defaultOwner,
        remediation_plan: `Fix issues causing "${v.command}" to fail`,
      });
    }
  }

  // Missed KPIs
  if (attestation.evidence_summary.kpis_missed > 0) {
    const missedKpis = attestation.kpi_results.filter((k) => !k.met);
    for (const k of missedKpis) {
      actions.push({
        id: generateActionId(attestation.task_id, 'missed_kpi', index++),
        origin_task: attestation.task_id,
        type: 'missed_kpi',
        severity: 'high',
        description: `KPI not met: ${k.kpi} (target: ${k.target}, actual: ${k.actual})`,
        created_at: now,
        expiry_date: defaultExpiry,
        status: 'open',
        owner: defaultOwner,
        remediation_plan: `Improve implementation to meet KPI target: ${k.target}`,
      });
    }
  }

  // Placeholders found
  if (attestation.evidence_summary.placeholders_found > 0) {
    actions.push({
      id: generateActionId(attestation.task_id, 'placeholder', index++),
      origin_task: attestation.task_id,
      type: 'placeholder',
      severity: 'medium',
      description: `${attestation.evidence_summary.placeholders_found} placeholder(s) found in task artifacts`,
      created_at: now,
      expiry_date: defaultExpiry,
      status: 'open',
      owner: defaultOwner,
      remediation_plan: 'Remove TODO, FIXME, STUB comments and implement placeholder code',
    });
  }

  return actions;
}

// =============================================================================
// Debt Ledger Integration
// =============================================================================

/**
 * Loads the debt ledger
 */
export function loadDebtLedger(repoRoot: string): DebtLedger | null {
  const ledgerPath = path.join(repoRoot, 'docs/debt-ledger.yaml');

  if (!fs.existsSync(ledgerPath)) {
    return null;
  }

  const content = fs.readFileSync(ledgerPath, 'utf-8');
  return yaml.parse(content) as DebtLedger;
}

/**
 * Saves the debt ledger
 */
export async function saveDebtLedger(repoRoot: string, ledger: DebtLedger): Promise<void> {
  const ledgerPath = path.join(repoRoot, 'docs/debt-ledger.yaml');
  const content = yaml.stringify(ledger, { lineWidth: 0 });
  await fs.promises.writeFile(ledgerPath, content, 'utf-8');
  console.log(`Debt ledger updated: ${ledgerPath}`);
}

/**
 * Adds action items to debt ledger
 */
export async function addToDebtLedger(
  repoRoot: string,
  actions: ActionItem[]
): Promise<string[]> {
  let ledger = loadDebtLedger(repoRoot);
  const addedIds: string[] = [];

  if (!ledger) {
    // Create new ledger
    ledger = {
      schema_version: '1.0.0',
      last_updated: new Date().toISOString().split('T')[0],
      maintainer: 'Tech Lead',
      items: {},
      summary: {
        total_items: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
        by_status: { open: 0, in_progress: 0, resolved: 0, wont_fix: 0 },
        expiring_soon: [],
      },
      review_schedule: {
        cadence: 'weekly',
        next_review: getNextWeekday().toISOString().split('T')[0],
        reviewers: ['Tech Lead', 'PM'],
        escalation_path: {
          severity_critical: 'CTO',
          severity_high: 'Tech Lead',
          expiring_soon: 'PM',
        },
      },
      alerts: {
        expiry_warning_days: 30,
        notification_channels: ['slack: #tech-debt', 'email: tech-lead@intelliflow.dev'],
      },
    };
  }

  // Add new items
  for (const action of actions) {
    // Skip if already exists
    if (ledger.items[action.id]) {
      continue;
    }

    ledger.items[action.id] = {
      origin_task: action.origin_task,
      owner: action.owner || 'Tech Lead',
      severity: action.severity,
      description: action.description,
      created_at: action.created_at,
      expiry_date: action.expiry_date || getDefaultExpiry(),
      remediation_plan: action.remediation_plan || 'To be determined',
      remediation_sprint: action.remediation_sprint || 0,
      status: action.status,
      notes: action.notes,
    };

    addedIds.push(action.id);
  }

  // Update summary
  updateLedgerSummary(ledger);

  // Save
  await saveDebtLedger(repoRoot, ledger);

  return addedIds;
}

function getNextWeekday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(today.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
}

function getDefaultExpiry(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

function updateLedgerSummary(ledger: DebtLedger): void {
  const items = Object.values(ledger.items);

  ledger.summary.total_items = items.length;

  // Reset counts
  ledger.summary.by_severity = { critical: 0, high: 0, medium: 0, low: 0 };
  ledger.summary.by_status = { open: 0, in_progress: 0, resolved: 0, wont_fix: 0 };
  ledger.summary.expiring_soon = [];

  const now = new Date();
  const warningDays = ledger.alerts.expiry_warning_days || 30;

  for (const [id, item] of Object.entries(ledger.items)) {
    // Count by severity
    ledger.summary.by_severity[item.severity]++;

    // Count by status
    if (ledger.summary.by_status[item.status] !== undefined) {
      ledger.summary.by_status[item.status]++;
    }

    // Check expiring soon
    if (item.expiry_date && item.status === 'open') {
      const expiry = new Date(item.expiry_date);
      const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= warningDays && daysUntil >= 0) {
        ledger.summary.expiring_soon.push(id);
      }
    }
  }

  ledger.last_updated = now.toISOString().split('T')[0];
}

// =============================================================================
// Review Queue Integration
// =============================================================================

/**
 * Loads the review queue
 */
export function loadReviewQueue(repoRoot: string): ReviewQueueItem[] {
  const queuePath = path.join(repoRoot, 'artifacts/reports/review-queue.json');

  if (!fs.existsSync(queuePath)) {
    return [];
  }

  const content = fs.readFileSync(queuePath, 'utf-8');
  return JSON.parse(content) as ReviewQueueItem[];
}

/**
 * Saves the review queue
 */
export async function saveReviewQueue(
  repoRoot: string,
  queue: ReviewQueueItem[]
): Promise<void> {
  const queuePath = path.join(repoRoot, 'artifacts/reports/review-queue.json');
  await fs.promises.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.promises.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
  console.log(`Review queue updated: ${queuePath}`);
}

/**
 * Adds items to the review queue
 */
export async function addToReviewQueue(
  repoRoot: string,
  attestation: TaskAttestation,
  tier: 'A' | 'B' | 'C' = 'C'
): Promise<void> {
  const queue = loadReviewQueue(repoRoot);

  // Check if task already in queue
  const existingIndex = queue.findIndex((item) => item.task_id === attestation.task_id);

  const reasons: string[] = [];
  const actionItems: string[] = [];

  if (attestation.evidence_summary.validations_failed > 0) {
    reasons.push(`${attestation.evidence_summary.validations_failed} validation(s) failed`);
  }
  if (attestation.evidence_summary.kpis_missed > 0) {
    reasons.push(`${attestation.evidence_summary.kpis_missed} KPI(s) missed`);
  }
  if (attestation.evidence_summary.placeholders_found > 0) {
    reasons.push(`${attestation.evidence_summary.placeholders_found} placeholder(s) found`);
  }
  if (attestation.verdict === 'BLOCKED') {
    reasons.push('Task is blocked by dependencies');
  }
  if (attestation.verdict === 'INCOMPLETE') {
    reasons.push('Task is incomplete');
  }

  // Determine priority
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  if (attestation.verdict === 'BLOCKED' || attestation.evidence_summary.validations_failed > 0) {
    priority = 'critical';
  } else if (attestation.evidence_summary.kpis_missed > 0) {
    priority = 'high';
  } else if (attestation.evidence_summary.placeholders_found > 0) {
    priority = 'medium';
  }

  const queueItem: ReviewQueueItem = {
    task_id: attestation.task_id,
    priority,
    tier,
    reasons,
    evidence_missing: attestation.evidence_summary.artifacts_verified === 0,
    created_at: new Date().toISOString(),
    action_items: actionItems,
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = queueItem;
  } else {
    queue.push(queueItem);
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  await saveReviewQueue(repoRoot, queue);
}

/**
 * Removes a task from the review queue (when issues are resolved)
 */
export async function removeFromReviewQueue(
  repoRoot: string,
  taskId: string
): Promise<boolean> {
  const queue = loadReviewQueue(repoRoot);
  const initialLength = queue.length;

  const filtered = queue.filter((item) => item.task_id !== taskId);

  if (filtered.length === initialLength) {
    return false; // Task wasn't in queue
  }

  await saveReviewQueue(repoRoot, filtered);
  return true;
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Gets a summary of open actions for a task
 */
export function getTaskActions(repoRoot: string, taskId: string): ActionItem[] {
  const ledger = loadDebtLedger(repoRoot);
  if (!ledger) return [];

  return Object.entries(ledger.items)
    .filter(([_, item]) => item.origin_task === taskId)
    .map(([id, item]) => ({
      id,
      origin_task: item.origin_task,
      type: 'missing_artifact' as ActionType, // Would need to parse from id
      severity: item.severity,
      description: item.description,
      created_at: item.created_at,
      expiry_date: item.expiry_date,
      remediation_plan: item.remediation_plan,
      remediation_sprint: item.remediation_sprint,
      status: item.status,
      owner: item.owner,
      notes: item.notes,
    }));
}

/**
 * Gets summary statistics for debt ledger
 */
export function getDebtSummary(repoRoot: string): {
  total: number;
  open: number;
  critical: number;
  expiringSoon: number;
} | null {
  const ledger = loadDebtLedger(repoRoot);
  if (!ledger) return null;

  return {
    total: ledger.summary.total_items,
    open: ledger.summary.by_status.open || 0,
    critical: ledger.summary.by_severity.critical || 0,
    expiringSoon: ledger.summary.expiring_soon.length,
  };
}
