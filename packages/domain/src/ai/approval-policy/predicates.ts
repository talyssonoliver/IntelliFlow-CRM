/**
 * Approval policy decisions (PG-198): reviewer authority, auto-approval
 * eligibility and escalation timing. Pure functions — callers supply the facts.
 */
import {
  APPROVAL_POLICY_LIMITS,
  APPROVER_ROLES,
  type ApprovalPolicyScope,
  type ApprovalRule,
} from './constants';

/** Roles outside Prisma `UserRole` that carry admin authority elsewhere in the app. */
const ADMIN_EQUIVALENT_ROLES = new Set(['OWNER', 'SUPER_ADMIN']);

/** USER 0 < SALES_REP 1 < MANAGER 2 < ADMIN 3 (OWNER/SUPER_ADMIN = 3); unknown → -1. */
export function approverRoleRank(role: string | null | undefined): number {
  if (!role) return -1;
  if (ADMIN_EQUIVALENT_ROLES.has(role)) return APPROVER_ROLES.indexOf('ADMIN');
  return (APPROVER_ROLES as readonly string[]).indexOf(role);
}

/**
 * Whether a reviewer meets the rule's minimum role. A USER minimum adds nothing
 * on top of the existing permission, so any role (even unknown) passes it.
 */
export function canReview(role: string | null | undefined, rule: ApprovalRule): boolean {
  if (rule.minReviewerRole === 'USER') return true;
  return approverRoleRank(role) >= approverRoleRank(rule.minReviewerRole);
}

export function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** 0..1 → percent, without rounding (0.899 stays 89.9); invalid → null. */
export function confidenceToPercent(value: unknown): number | null {
  return isValidConfidence(value) ? value * 100 : null;
}

export interface AutoApprovalInput {
  scope: ApprovalPolicyScope;
  rule: ApprovalRule;
  /** Model confidence 0..1 as produced by the AI caller. */
  confidence?: number | null;
  /** Agent tool actions only. */
  impact?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  agentKey?: string;
  actionType?: string;
  /** draft_message channel (EMAIL/SMS/NOTE). */
  messageType?: string;
  requesterRole?: string | null;
  /** The requester holds the queue's approve permission. */
  requesterCanApprove: boolean;
  /** The item was requested by a signed-in person (not a background job). */
  hasSessionRequester: boolean;
}

export interface AutoApprovalDecision {
  approve: boolean;
  reason: string;
}

/** The only draft_message channel that stays inside the CRM. */
const INTERNAL_DRAFT_CHANNEL = 'NOTE';

function refuse(reason: string): AutoApprovalDecision {
  return { approve: false, reason };
}

function thresholdIsValid(threshold: number | null): threshold is number {
  const { min, max } = APPROVAL_POLICY_LIMITS.autoApproveThreshold;
  return threshold !== null && Number.isInteger(threshold) && threshold >= min && threshold <= max;
}

function agentToolRefusal(input: AutoApprovalInput): string | null {
  if (input.actionType === 'DELETE') return 'DELETE actions always need a human';
  // Fail closed: a draft is eligible only when it is positively an internal note.
  if (input.agentKey === 'draft_message' && input.messageType !== INTERNAL_DRAFT_CHANNEL) {
    return `${input.messageType ?? 'unknown'} drafts may reach people outside the CRM (external channel)`;
  }
  if (!input.impact) return 'impact is unknown';
  if (input.impact === 'HIGH') return 'HIGH impact actions always need a human';
  return null;
}

/**
 * Auto-approval never grants more than the requester could do (BR-6) and only
 * fires on a real confidence strictly above the policy threshold (A4).
 */
export function evaluateAutoApproval(input: AutoApprovalInput): AutoApprovalDecision {
  const { rule } = input;
  if (!rule.autoApproveEnabled) return refuse('auto-approval is disabled');
  if (!thresholdIsValid(rule.autoApproveMinConfidence)) {
    return refuse('auto-approval threshold is not configured');
  }
  if (!input.hasSessionRequester) return refuse('no signed-in requester');
  if (!input.requesterCanApprove) return refuse('requester lacks the approve permission');
  if (!canReview(input.requesterRole, rule)) {
    return refuse(`requester role is below ${rule.minReviewerRole}`);
  }
  const percent = confidenceToPercent(input.confidence);
  if (percent === null) return refuse('no valid model confidence');
  if (input.scope === 'AGENT_TOOL') {
    const refusal = agentToolRefusal(input);
    if (refusal) return refuse(refusal);
  }
  const threshold = rule.autoApproveMinConfidence;
  if (percent <= threshold) {
    return refuse(`confidence ${percent.toFixed(1)}% is not above ${threshold}%`);
  }
  return { approve: true, reason: `confidence ${percent.toFixed(1)}% > ${threshold}%` };
}

/** Whether a pending item has waited long enough to be escalated (once). */
export function isEscalationDue(
  startedAt: Date,
  now: Date,
  rule: ApprovalRule,
  alreadyEscalated: boolean
): boolean {
  if (alreadyEscalated) return false;
  if (!rule.escalationEnabled || rule.escalateAfterMinutes === null) return false;
  if (!rule.escalationTargetUserId) return false;
  return now.getTime() - startedAt.getTime() >= rule.escalateAfterMinutes * 60_000;
}
