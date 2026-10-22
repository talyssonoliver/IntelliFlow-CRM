/**
 * Effective approval rule resolution (PG-198, BR-1).
 *
 * Precedence: exact (agent, action) assignment → (agent, *) → (*, action) →
 * the scope's default policy → built-in defaults.
 */
import {
  APPROVAL_POLICY_DEFAULTS,
  APPROVAL_POLICY_WILDCARD,
  type ApprovalPolicyScope,
  type ApprovalRule,
} from './constants';

export interface ApprovalPolicyAssignmentRecord {
  agentKey: string;
  actionType: string;
}

export interface ApprovalPolicyRecord extends ApprovalRule {
  id: string;
  name: string;
  scope: ApprovalPolicyScope;
  isDefault: boolean;
  assignments: ApprovalPolicyAssignmentRecord[];
}

export type ApprovalRuleSource =
  | 'ASSIGNMENT_EXACT'
  | 'ASSIGNMENT_AGENT'
  | 'ASSIGNMENT_ACTION'
  | 'SCOPE_DEFAULT'
  | 'BUILT_IN';

export interface ResolvedApprovalPolicy {
  rule: ApprovalRule;
  policyId: string | null;
  policyName: string | null;
  source: ApprovalRuleSource;
}

function toRule(policy: ApprovalRule): ApprovalRule {
  return {
    timeoutMinutes: policy.timeoutMinutes,
    minReviewerRole: policy.minReviewerRole,
    autoApproveEnabled: policy.autoApproveEnabled,
    autoApproveMinConfidence: policy.autoApproveMinConfidence,
    escalationEnabled: policy.escalationEnabled,
    escalateAfterMinutes: policy.escalateAfterMinutes,
    escalationTargetUserId: policy.escalationTargetUserId,
  };
}

function resolved(
  policy: ApprovalPolicyRecord,
  source: ApprovalRuleSource
): ResolvedApprovalPolicy {
  return { rule: toRule(policy), policyId: policy.id, policyName: policy.name, source };
}

function findAssigned(
  policies: ApprovalPolicyRecord[],
  agentKey: string,
  actionType: string
): ApprovalPolicyRecord | undefined {
  return policies.find((p) =>
    p.assignments.some((a) => a.agentKey === agentKey && a.actionType === actionType)
  );
}

export function resolveApprovalPolicy(
  policies: readonly ApprovalPolicyRecord[],
  scope: ApprovalPolicyScope,
  agentKey: string,
  actionType: string
): ResolvedApprovalPolicy {
  const inScope = policies.filter((p) => p.scope === scope);

  const exact = findAssigned(inScope, agentKey, actionType);
  if (exact) return resolved(exact, 'ASSIGNMENT_EXACT');

  const agentWide = findAssigned(inScope, agentKey, APPROVAL_POLICY_WILDCARD);
  if (agentWide) return resolved(agentWide, 'ASSIGNMENT_AGENT');

  const actionWide = findAssigned(inScope, APPROVAL_POLICY_WILDCARD, actionType);
  if (actionWide) return resolved(actionWide, 'ASSIGNMENT_ACTION');

  const scopeDefault = inScope.find((p) => p.isDefault);
  if (scopeDefault) return resolved(scopeDefault, 'SCOPE_DEFAULT');

  return {
    rule: APPROVAL_POLICY_DEFAULTS[scope],
    policyId: null,
    policyName: null,
    source: 'BUILT_IN',
  };
}
