/**
 * PG-198: Module Settings — Approval Policies validators.
 *
 * Enums, limits and the agent/action vocabulary derive from the domain
 * (DRY rule). The superRefine rejects duplicate (agent, action) assignment
 * pairs ("rows N and M", playbook §6) and incomplete auto-approve/escalation
 * settings before the router sees them; the DB CHECKs repeat the same rules.
 */
import { z } from 'zod';
import {
  APPROVAL_AGENT_TOOLS,
  APPROVAL_POLICY_LIMITS,
  APPROVAL_POLICY_SCOPES,
  APPROVAL_POLICY_WILDCARD,
  APPROVAL_TOOL_ACTION_TYPES,
  APPROVER_ROLES,
  AUTO_RESPONSE_AGENT_KEY,
  TRIGGER_TYPES,
  type ApprovalPolicyScope,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { ACCOUNT_TAG_COLOR_TOKENS } from './account-settings';

export const approvalPolicyScopeSchema = z.enum(APPROVAL_POLICY_SCOPES);
export const approverRoleSchema = z.enum(APPROVER_ROLES);

export const approvalPolicyAssignmentSchema = z.object({
  agentKey: z.string().trim().min(1).max(64),
  actionType: z.string().trim().min(1).max(64),
});
export type ApprovalPolicyAssignmentInput = z.infer<typeof approvalPolicyAssignmentSchema>;

const { timeoutMinutes, escalateAfterMinutes, autoApproveThreshold } = APPROVAL_POLICY_LIMITS;

const approvalPolicyFieldsSchema = z.object({
  name: z.string().trim().min(1).max(APPROVAL_POLICY_LIMITS.nameMaxLength),
  description: z.string().trim().max(APPROVAL_POLICY_LIMITS.descriptionMaxLength).optional(),
  colorToken: z.enum(ACCOUNT_TAG_COLOR_TOKENS).default('slate'),
  scope: approvalPolicyScopeSchema,
  isDefault: z.boolean().default(false),
  timeoutMinutes: z.number().int().min(timeoutMinutes.min).max(timeoutMinutes.max),
  minReviewerRole: approverRoleSchema.default('USER'),
  // AI auto-approval is opt-in (playbook §7: AI defaults FALSE).
  autoApproveEnabled: z.boolean().default(false),
  autoApproveMinConfidence: z
    .number()
    .int()
    .min(autoApproveThreshold.min)
    .max(autoApproveThreshold.max)
    .nullable()
    .default(null),
  escalationEnabled: z.boolean().default(false),
  escalateAfterMinutes: z
    .number()
    .int()
    .min(escalateAfterMinutes.min)
    .max(timeoutMinutes.max)
    .nullable()
    .default(null),
  escalationTargetUserId: idSchema.nullable().default(null),
  assignments: z
    .array(approvalPolicyAssignmentSchema)
    .max(APPROVAL_POLICY_LIMITS.maxAssignments)
    .default([]),
});

type ApprovalPolicyFields = z.infer<typeof approvalPolicyFieldsSchema>;

const AGENT_TOOL_ACTIONS = new Map<string, string>(Object.entries(APPROVAL_AGENT_TOOLS));
const TOOL_ACTION_TYPES = new Set<string>(APPROVAL_TOOL_ACTION_TYPES);
const TRIGGERS = new Set<string>(TRIGGER_TYPES);
const WILDCARD = APPROVAL_POLICY_WILDCARD;

/** Why an assignment can never match an item in this scope, or null when valid. */
function assignmentProblem(
  scope: ApprovalPolicyScope,
  { agentKey, actionType }: ApprovalPolicyAssignmentInput
): string | null {
  if (agentKey === WILDCARD && actionType === WILDCARD) {
    return 'Use the default policy instead of a "*" / "*" assignment';
  }
  if (scope === 'AUTO_RESPONSE') {
    if (agentKey !== WILDCARD && agentKey !== AUTO_RESPONSE_AGENT_KEY) {
      return `Unknown agent "${agentKey}" for email auto-responses`;
    }
    if (actionType !== WILDCARD && !TRIGGERS.has(actionType)) {
      return `Unknown trigger "${actionType}"`;
    }
    return null;
  }
  if (actionType !== WILDCARD && !TOOL_ACTION_TYPES.has(actionType)) {
    return `Unknown action "${actionType}"`;
  }
  if (agentKey === WILDCARD) return null;
  const toolAction = AGENT_TOOL_ACTIONS.get(agentKey);
  if (!toolAction) return `"${agentKey}" is not an agent tool that needs approval`;
  if (actionType !== WILDCARD && actionType !== toolAction) {
    return `"${agentKey}" only performs ${toolAction} actions`;
  }
  return null;
}

function refineAssignments(data: ApprovalPolicyFields, ctx: z.RefinementCtx): void {
  const seen = new Map<string, number>();
  data.assignments.forEach((assignment, index) => {
    const problem = assignmentProblem(data.scope, assignment);
    if (problem) {
      ctx.addIssue({ code: 'custom', message: problem, path: ['assignments', index] });
      return;
    }
    const key = `${assignment.agentKey}|${assignment.actionType}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate assignment: rows ${first + 1} and ${index + 1} are the same agent and action`,
      path: ['assignments', index],
    });
  });
}

function refineRules(data: ApprovalPolicyFields, ctx: z.RefinementCtx): void {
  if (data.autoApproveEnabled && data.autoApproveMinConfidence === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Set a confidence threshold to turn on auto-approval',
      path: ['autoApproveMinConfidence'],
    });
  }
  if (!data.escalationEnabled) return;
  if (data.escalationTargetUserId === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Choose who receives escalations',
      path: ['escalationTargetUserId'],
    });
  }
  if (data.escalateAfterMinutes === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Set how long to wait before escalating',
      path: ['escalateAfterMinutes'],
    });
  } else if (data.escalateAfterMinutes >= data.timeoutMinutes) {
    ctx.addIssue({
      code: 'custom',
      message: 'Escalate before the approval times out',
      path: ['escalateAfterMinutes'],
    });
  }
}

function refineApprovalPolicy(data: ApprovalPolicyFields, ctx: z.RefinementCtx): void {
  refineRules(data, ctx);
  refineAssignments(data, ctx);
}

export const createApprovalPolicySchema =
  approvalPolicyFieldsSchema.superRefine(refineApprovalPolicy);
export type CreateApprovalPolicyInput = z.infer<typeof createApprovalPolicySchema>;

export const updateApprovalPolicySchema = approvalPolicyFieldsSchema
  .extend({ id: idSchema })
  .superRefine(refineApprovalPolicy);
export type UpdateApprovalPolicyInput = z.infer<typeof updateApprovalPolicySchema>;

export const deleteApprovalPolicySchema = z.object({ id: idSchema });
export const setDefaultApprovalPolicySchema = z.object({ id: idSchema });

export const approvalPolicyPreviewSchema = z.object({ scope: approvalPolicyScopeSchema });
export type ApprovalPolicyPreviewInput = z.infer<typeof approvalPolicyPreviewSchema>;
