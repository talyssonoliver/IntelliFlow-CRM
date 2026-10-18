/**
 * Approval policy constants (PG-198, ADR-079).
 *
 * Canonical vocabulary for tenant approval policies that govern both approval
 * queues: agent tool actions (IFC-139) and AI auto-response drafts (IFC-029).
 * Validators, Prisma CHECK constraints and the UI derive from these arrays.
 */

/** Which approval queue a policy governs. */
export const APPROVAL_POLICY_SCOPES = ['AGENT_TOOL', 'AUTO_RESPONSE'] as const;
export type ApprovalPolicyScope = (typeof APPROVAL_POLICY_SCOPES)[number];

/** Reviewer roles in ascending order of authority (Prisma `UserRole`). */
export const APPROVER_ROLES = ['USER', 'SALES_REP', 'MANAGER', 'ADMIN'] as const;
export type ApproverRole = (typeof APPROVER_ROLES)[number];

/** Matches any agent key or any action type in a policy assignment. */
export const APPROVAL_POLICY_WILDCARD = '*';

/** The single agent behind the AUTO_RESPONSE queue. */
export const AUTO_RESPONSE_AGENT_KEY = 'auto_response';

/**
 * Actor recorded when a policy (not a person) approves or escalates an item.
 * The `system:` prefix is the contract that marks a decision as automated.
 */
export const SYSTEM_APPROVAL_ACTOR = 'system:approval-policy';

/** Approval-requiring agent tools and the action type each one performs. */
export const APPROVAL_AGENT_TOOLS = {
  create_case: 'CREATE',
  create_appointment: 'CREATE',
  update_case: 'UPDATE',
  update_appointment: 'UPDATE',
  draft_message: 'DRAFT',
} as const;

export const APPROVAL_AGENT_TOOL_KEYS = [
  'create_case',
  'create_appointment',
  'update_case',
  'update_appointment',
  'draft_message',
] as const;
export type ApprovalAgentToolKey = (typeof APPROVAL_AGENT_TOOL_KEYS)[number];

export const APPROVAL_TOOL_ACTION_TYPES = ['CREATE', 'UPDATE', 'DRAFT'] as const;
export type ApprovalToolActionType = (typeof APPROVAL_TOOL_ACTION_TYPES)[number];

export const APPROVAL_POLICY_LIMITS = {
  nameMaxLength: 100,
  descriptionMaxLength: 500,
  /** 5 minutes .. 7 days */
  timeoutMinutes: { min: 5, max: 10080 },
  /** Must also be strictly below the policy timeout. */
  escalateAfterMinutes: { min: 5 },
  /** ISO 42001 D.1: automatic only above 0.9 confidence. */
  autoApproveThreshold: { min: 90, max: 99 },
  maxAssignments: 50,
} as const;

/** The enforceable part of a policy. */
export interface ApprovalRule {
  timeoutMinutes: number;
  minReviewerRole: ApproverRole;
  autoApproveEnabled: boolean;
  /** Percent; confidence must be strictly above it. */
  autoApproveMinConfidence: number | null;
  escalationEnabled: boolean;
  escalateAfterMinutes: number | null;
  escalationTargetUserId: string | null;
}

/**
 * Built-in rules used when a tenant has no policy for a scope. They reproduce
 * the behaviour before policies existed: 30-minute agent actions, 24-hour
 * drafts, permission-only review, no auto-approval, no escalation.
 */
export const APPROVAL_POLICY_DEFAULTS: Readonly<Record<ApprovalPolicyScope, ApprovalRule>> = {
  AGENT_TOOL: {
    timeoutMinutes: 30,
    minReviewerRole: 'USER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: false,
    escalateAfterMinutes: null,
    escalationTargetUserId: null,
  },
  AUTO_RESPONSE: {
    timeoutMinutes: 1440,
    minReviewerRole: 'USER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: false,
    escalateAfterMinutes: null,
    escalationTargetUserId: null,
  },
};
