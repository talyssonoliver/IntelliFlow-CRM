/**
 * Rollback Service for Agent-Initiated Changes
 *
 * Provides functionality to rollback agent actions, retrieve action history,
 * and maintain audit logs for all agent-initiated changes.
 *
 * @module rollback-service
 * @implements IFC-149 - Action preview and rollback UI
 */

/**
 * Generate a UUID v4 compatible string.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// Types
// =============================================================================

export type AgentActionType =
  | 'lead_update'
  | 'contact_create'
  | 'contact_update'
  | 'deal_stage_change'
  | 'task_create'
  | 'task_update'
  | 'email_draft'
  | 'note_add'
  | 'field_update'
  | 'status_change';

export type ActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'rolled_back'
  | 'expired'
  | 'modified';

export interface AgentAction {
  /** Unique identifier for the action */
  id: string;
  /** Type of action being performed */
  actionType: AgentActionType;
  /** ID of the entity being modified */
  entityId: string;
  /** Type of entity (lead, contact, deal, task, etc.) */
  entityType: string;
  /** Display name of the target entity */
  entityName: string;
  /** Previous state before the action */
  previousState: Record<string, unknown>;
  /** Proposed new state after the action */
  proposedState: Record<string, unknown>;
  /** Human-readable description of the change */
  description: string;
  /** AI reasoning for proposing this action */
  aiReasoning: string;
  /** Confidence score (0-100) */
  confidenceScore: number;
  /** Current status of the action */
  status: ActionStatus;
  /** ID of the agent that initiated the action */
  agentId: string;
  /** Name of the agent */
  agentName: string;
  /** Timestamp when action was proposed */
  createdAt: Date;
  /** Timestamp when action was reviewed */
  reviewedAt?: Date;
  /** ID of user who reviewed the action */
  reviewedBy?: string;
  /** Timestamp when action expires (auto-reject) */
  expiresAt: Date;
  /** User-provided feedback on rejection/modification */
  feedback?: string;
  /** Rollback metadata if action was rolled back */
  rollbackInfo?: RollbackInfo;
}

export interface RollbackInfo {
  /** Timestamp of rollback */
  rolledBackAt: Date;
  /** User who initiated rollback */
  rolledBackBy: string;
  /** Reason for rollback */
  reason: string;
  /** State after rollback (should match previousState) */
  restoredState: Record<string, unknown>;
}

export interface ActionHistory {
  /** Entity being tracked */
  entityId: string;
  entityType: string;
  /** All actions related to this entity */
  actions: AgentAction[];
  /** Total number of actions */
  totalActions: number;
  /** Number of approved actions */
  approvedCount: number;
  /** Number of rejected actions */
  rejectedCount: number;
  /** Number of rolled back actions */
  rolledBackCount: number;
}

export interface ApprovalMetrics {
  /** Total actions in period */
  totalActions: number;
  /** Approved actions */
  approved: number;
  /** Rejected actions */
  rejected: number;
  /** Modified before approval */
  modified: number;
  /** Rolled back after approval */
  rolledBack: number;
  /** Expired without review */
  expired: number;
  /** Average time to review (ms) */
  avgReviewTimeMs: number;
  /** Approval rate percentage */
  approvalRate: number;
  /** Average confidence score of approved actions */
  avgConfidenceApproved: number;
  /** Average confidence score of rejected actions */
  avgConfidenceRejected: number;
}

export interface RollbackResult {
  success: boolean;
  actionId: string;
  previousStatus: ActionStatus;
  newStatus: ActionStatus;
  restoredState: Record<string, unknown>;
  auditLogId: string;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actionId: string;
  operation: 'approve' | 'reject' | 'modify' | 'rollback' | 'expire';
  userId: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

// =============================================================================
// In-Memory Store (for demo - replace with database in production)
// =============================================================================

const actionStore = new Map<string, AgentAction>();
const auditLogStore: AuditLogEntry[] = [];

// =============================================================================
// Helpers
// =============================================================================

function isActionExpired(action: AgentAction, now: Date): boolean {
  return action.expiresAt.getTime() <= now.getTime();
}

function expireAction(
  action: AgentAction,
  now: Date,
  triggeredBy: string,
  trigger: 'scheduler' | 'manual' = 'scheduler'
): AuditLogEntry {
  const auditLogEntry: AuditLogEntry = {
    id: generateUUID(),
    timestamp: now,
    actionId: action.id,
    operation: 'expire',
    userId: triggeredBy,
    previousState: action.previousState,
    newState: action.previousState,
    metadata: {
      trigger,
      originalExpiresAt: action.expiresAt.toISOString(),
      entityId: action.entityId,
      entityType: action.entityType,
    },
  };

  action.status = 'expired';
  actionStore.set(action.id, action);
  auditLogStore.push(auditLogEntry);

  return auditLogEntry;
}

// =============================================================================
// Rollback Service
// =============================================================================

/**
 * Rollback a specific agent action to its previous state.
 *
 * @param actionId - ID of the action to rollback
 * @param userId - ID of the user initiating the rollback
 * @param reason - Reason for the rollback
 * @returns RollbackResult indicating success or failure
 */
export async function rollbackAction(
  actionId: string,
  userId: string,
  reason: string
): Promise<RollbackResult> {
  const action = actionStore.get(actionId);

  if (!action) {
    return {
      success: false,
      actionId,
      previousStatus: 'pending',
      newStatus: 'pending',
      restoredState: {},
      auditLogId: '',
      error: `Action ${actionId} not found`,
    };
  }

  // Can only rollback approved actions
  if (action.status !== 'approved' && action.status !== 'modified') {
    return {
      success: false,
      actionId,
      previousStatus: action.status,
      newStatus: action.status,
      restoredState: {},
      auditLogId: '',
      error: `Cannot rollback action with status: ${action.status}. Only approved or modified actions can be rolled back.`,
    };
  }

  const previousStatus = action.status;
  const now = new Date();

  // Update action status
  action.status = 'rolled_back';
  action.rollbackInfo = {
    rolledBackAt: now,
    rolledBackBy: userId,
    reason,
    restoredState: { ...action.previousState },
  };

  // Create audit log entry
  const auditLogEntry: AuditLogEntry = {
    id: generateUUID(),
    timestamp: now,
    actionId,
    operation: 'rollback',
    userId,
    previousState: action.proposedState,
    newState: action.previousState,
    metadata: {
      reason,
      entityId: action.entityId,
      entityType: action.entityType,
      actionType: action.actionType,
    },
  };

  auditLogStore.push(auditLogEntry);
  actionStore.set(actionId, action);

  // In production: Apply the rollback to the actual entity here
  // await applyStateToEntity(action.entityType, action.entityId, action.previousState);

  return {
    success: true,
    actionId,
    previousStatus,
    newStatus: 'rolled_back',
    restoredState: action.previousState,
    auditLogId: auditLogEntry.id,
  };
}

/**
 * Get action history for a specific entity.
 *
 * @param entityId - ID of the entity
 * @param entityType - Type of entity (optional filter)
 * @returns ActionHistory for the entity
 */
export async function getActionHistory(
  entityId: string,
  entityType?: string
): Promise<ActionHistory> {
  const actions = Array.from(actionStore.values()).filter(
    (action) =>
      action.entityId === entityId &&
      (!entityType || action.entityType === entityType)
  );

  const approvedCount = actions.filter((a) => a.status === 'approved').length;
  const rejectedCount = actions.filter((a) => a.status === 'rejected').length;
  const rolledBackCount = actions.filter((a) => a.status === 'rolled_back').length;

  return {
    entityId,
    entityType: entityType || actions[0]?.entityType || 'unknown',
    actions: actions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    ),
    totalActions: actions.length,
    approvedCount,
    rejectedCount,
    rolledBackCount,
  };
}

/**
 * Get a single action by ID.
 *
 * @param actionId - ID of the action
 * @returns AgentAction or null if not found
 */
export async function getAction(actionId: string): Promise<AgentAction | null> {
  return actionStore.get(actionId) || null;
}

/**
 * Get all pending actions awaiting review.
 *
 * @returns Array of pending AgentActions
 */
export async function getPendingActions(): Promise<AgentAction[]> {
  const now = new Date();
  return Array.from(actionStore.values())
    .filter((action) => action.status === 'pending' && action.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Approve an agent action.
 *
 * @param actionId - ID of the action to approve
 * @param userId - ID of the approving user
 * @returns Updated AgentAction
 */
export async function approveAction(
  actionId: string,
  userId: string
): Promise<AgentAction | null> {
  const action = actionStore.get(actionId);

  if (!action || action.status !== 'pending') {
    return null;
  }

  const now = new Date();

  if (isActionExpired(action, now)) {
    expireAction(action, now, userId, 'manual');
    return null;
  }

  action.status = 'approved';
  action.reviewedAt = now;
  action.reviewedBy = userId;

  // Create audit log
  const auditLogEntry: AuditLogEntry = {
    id: generateUUID(),
    timestamp: now,
    actionId,
    operation: 'approve',
    userId,
    previousState: action.previousState,
    newState: action.proposedState,
    metadata: {
      confidenceScore: action.confidenceScore,
      entityId: action.entityId,
      entityType: action.entityType,
    },
  };

  auditLogStore.push(auditLogEntry);
  actionStore.set(actionId, action);

  // In production: Apply the change to the actual entity here
  // await applyStateToEntity(action.entityType, action.entityId, action.proposedState);

  return action;
}

/**
 * Reject an agent action.
 *
 * @param actionId - ID of the action to reject
 * @param userId - ID of the rejecting user
 * @param feedback - Reason for rejection
 * @returns Updated AgentAction
 */
export async function rejectAction(
  actionId: string,
  userId: string,
  feedback: string
): Promise<AgentAction | null> {
  const action = actionStore.get(actionId);

  if (!action || action.status !== 'pending') {
    return null;
  }

  const now = new Date();

  if (isActionExpired(action, now)) {
    expireAction(action, now, userId, 'manual');
    return null;
  }

  action.status = 'rejected';
  action.reviewedAt = now;
  action.reviewedBy = userId;
  action.feedback = feedback;

  // Create audit log
  const auditLogEntry: AuditLogEntry = {
    id: generateUUID(),
    timestamp: now,
    actionId,
    operation: 'reject',
    userId,
    previousState: action.previousState,
    newState: action.previousState, // State remains unchanged
    metadata: {
      feedback,
      confidenceScore: action.confidenceScore,
      entityId: action.entityId,
      entityType: action.entityType,
    },
  };

  auditLogStore.push(auditLogEntry);
  actionStore.set(actionId, action);

  return action;
}

/**
 * Modify and approve an agent action with user changes.
 *
 * @param actionId - ID of the action to modify
 * @param userId - ID of the modifying user
 * @param modifiedState - User-modified proposed state
 * @param feedback - Explanation of modifications
 * @returns Updated AgentAction
 */
export async function modifyAndApproveAction(
  actionId: string,
  userId: string,
  modifiedState: Record<string, unknown>,
  feedback: string
): Promise<AgentAction | null> {
  const action = actionStore.get(actionId);

  if (!action || action.status !== 'pending') {
    return null;
  }

  const now = new Date();

  if (isActionExpired(action, now)) {
    expireAction(action, now, userId, 'manual');
    return null;
  }

  const originalProposed = { ...action.proposedState };

  action.status = 'modified';
  action.reviewedAt = now;
  action.reviewedBy = userId;
  action.proposedState = modifiedState;
  action.feedback = feedback;

  // Create audit log
  const auditLogEntry: AuditLogEntry = {
    id: generateUUID(),
    timestamp: now,
    actionId,
    operation: 'modify',
    userId,
    previousState: originalProposed,
    newState: modifiedState,
    metadata: {
      feedback,
      confidenceScore: action.confidenceScore,
      entityId: action.entityId,
      entityType: action.entityType,
    },
  };

  auditLogStore.push(auditLogEntry);
  actionStore.set(actionId, action);

  // In production: Apply the modified change to the actual entity here
  // await applyStateToEntity(action.entityType, action.entityId, modifiedState);

  return action;
}

/**
 * Create a new agent action for approval.
 *
 * @param actionData - Partial action data
 * @returns Created AgentAction
 */
export async function createAction(
  actionData: Omit<AgentAction, 'id' | 'status' | 'createdAt' | 'expiresAt'>
): Promise<AgentAction> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const action: AgentAction = {
    ...actionData,
    id: generateUUID(),
    status: 'pending',
    createdAt: now,
    expiresAt,
  };

  actionStore.set(action.id, action);
  return action;
}

/**
 * Get approval metrics for analytics.
 *
 * @param startDate - Start of period
 * @param endDate - End of period
 * @returns ApprovalMetrics for the period
 */
export async function getApprovalMetrics(
  startDate?: Date,
  endDate?: Date
): Promise<ApprovalMetrics> {
  const start = startDate || new Date(0);
  const end = endDate || new Date();

  const actionsInPeriod = Array.from(actionStore.values()).filter(
    (action) => action.createdAt >= start && action.createdAt <= end
  );

  const approved = actionsInPeriod.filter((a) => a.status === 'approved');
  const rejected = actionsInPeriod.filter((a) => a.status === 'rejected');
  const modified = actionsInPeriod.filter((a) => a.status === 'modified');
  const rolledBack = actionsInPeriod.filter((a) => a.status === 'rolled_back');
  const expired = actionsInPeriod.filter((a) => a.status === 'expired');

  // Calculate average review time for reviewed actions
  const reviewedActions = actionsInPeriod.filter((a) => a.reviewedAt);
  const totalReviewTime = reviewedActions.reduce(
    (sum, a) => sum + (a.reviewedAt!.getTime() - a.createdAt.getTime()),
    0
  );
  const avgReviewTimeMs =
    reviewedActions.length > 0 ? totalReviewTime / reviewedActions.length : 0;

  // Calculate approval rate
  const decidedActions = approved.length + rejected.length + modified.length;
  const approvalRate =
    decidedActions > 0
      ? ((approved.length + modified.length) / decidedActions) * 100
      : 0;

  // Calculate average confidence scores
  const avgConfidenceApproved =
    approved.length > 0
      ? approved.reduce((sum, a) => sum + a.confidenceScore, 0) / approved.length
      : 0;

  const avgConfidenceRejected =
    rejected.length > 0
      ? rejected.reduce((sum, a) => sum + a.confidenceScore, 0) / rejected.length
      : 0;

  return {
    totalActions: actionsInPeriod.length,
    approved: approved.length,
    rejected: rejected.length,
    modified: modified.length,
    rolledBack: rolledBack.length,
    expired: expired.length,
    avgReviewTimeMs: Math.round(avgReviewTimeMs),
    approvalRate: Math.round(approvalRate * 100) / 100,
    avgConfidenceApproved: Math.round(avgConfidenceApproved * 100) / 100,
    avgConfidenceRejected: Math.round(avgConfidenceRejected * 100) / 100,
  };
}

/**
 * Get audit log entries for an action.
 *
 * @param actionId - ID of the action
 * @returns Array of AuditLogEntry
 */
export async function getAuditLog(actionId: string): Promise<AuditLogEntry[]> {
  return auditLogStore
    .filter((entry) => entry.actionId === actionId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Expire pending actions that have passed their expiration time.
 * Should be called periodically by a cron job.
 *
 * @returns Number of actions expired
 */
export async function expirePendingActions(): Promise<number> {
  const now = new Date();
  let expiredCount = 0;

  const entries = Array.from(actionStore.entries());
  for (const [, action] of entries) {
    if (action.status === 'pending' && action.expiresAt <= now) {
      expireAction(action, now, 'system', 'scheduler');
      expiredCount++;
    }
  }

  return expiredCount;
}

/**
 * Clear all actions and audit logs (for testing only).
 */
export function clearStore(): void {
  actionStore.clear();
  auditLogStore.length = 0;
}

/**
 * Get the count of pending actions (for badges/notifications).
 *
 * @returns Number of pending actions
 */
export async function getPendingActionCount(): Promise<number> {
  const now = new Date();
  return Array.from(actionStore.values()).filter(
    (action) => action.status === 'pending' && action.expiresAt > now
  ).length;
}

// =============================================================================
// Exports
// =============================================================================

export const rollbackService = {
  rollbackAction,
  getActionHistory,
  getAction,
  getPendingActions,
  approveAction,
  rejectAction,
  modifyAndApproveAction,
  createAction,
  getApprovalMetrics,
  getAuditLog,
  expirePendingActions,
  clearStore,
  getPendingActionCount,
};

export default rollbackService;
