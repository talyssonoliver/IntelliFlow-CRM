import { describe, it, expect } from 'vitest';
import {
  APPROVAL_POLICY_SCOPES,
  APPROVER_ROLES,
  APPROVAL_POLICY_WILDCARD,
  AUTO_RESPONSE_AGENT_KEY,
  SYSTEM_APPROVAL_ACTOR,
  APPROVAL_AGENT_TOOLS,
  APPROVAL_AGENT_TOOL_KEYS,
  APPROVAL_TOOL_ACTION_TYPES,
  APPROVAL_POLICY_LIMITS,
  APPROVAL_POLICY_DEFAULTS,
  approverRoleRank,
  canReview,
  isValidConfidence,
  confidenceToPercent,
  evaluateAutoApproval,
  isEscalationDue,
  resolveApprovalPolicy,
  type ApprovalRule,
  type ApprovalPolicyRecord,
  type AutoApprovalInput,
} from '../index';
import { TRIGGER_TYPES } from '../../../autoresponse/AutoResponseDraft';

const baseRule: ApprovalRule = {
  timeoutMinutes: 60,
  minReviewerRole: 'USER',
  autoApproveEnabled: false,
  autoApproveMinConfidence: null,
  escalationEnabled: false,
  escalateAfterMinutes: null,
  escalationTargetUserId: null,
};

function policy(overrides: Partial<ApprovalPolicyRecord> = {}): ApprovalPolicyRecord {
  return {
    id: 'p1',
    name: 'Policy',
    scope: 'AGENT_TOOL',
    isDefault: false,
    assignments: [],
    ...baseRule,
    ...overrides,
  };
}

describe('approval policy constants', () => {
  it('exposes the two scopes and ordered approver roles', () => {
    expect(APPROVAL_POLICY_SCOPES).toEqual(['AGENT_TOOL', 'AUTO_RESPONSE']);
    expect(APPROVER_ROLES).toEqual(['USER', 'SALES_REP', 'MANAGER', 'ADMIN']);
  });

  it('exposes the wildcard, agent key and system actor', () => {
    expect(APPROVAL_POLICY_WILDCARD).toBe('*');
    expect(AUTO_RESPONSE_AGENT_KEY).toBe('auto_response');
    expect(SYSTEM_APPROVAL_ACTOR).toBe('system:approval-policy');
  });

  it('lists exactly the approval-requiring agent tools with their action types', () => {
    expect(APPROVAL_AGENT_TOOLS).toEqual({
      create_case: 'CREATE',
      create_appointment: 'CREATE',
      update_case: 'UPDATE',
      update_appointment: 'UPDATE',
      draft_message: 'DRAFT',
    });
    expect([...APPROVAL_AGENT_TOOL_KEYS].sort()).toEqual(Object.keys(APPROVAL_AGENT_TOOLS).sort());
    expect(APPROVAL_TOOL_ACTION_TYPES).toEqual(['CREATE', 'UPDATE', 'DRAFT']);
  });

  it('defines the limits from the spec (BR-3)', () => {
    expect(APPROVAL_POLICY_LIMITS.timeoutMinutes).toEqual({ min: 5, max: 10080 });
    expect(APPROVAL_POLICY_LIMITS.escalateAfterMinutes.min).toBe(5);
    expect(APPROVAL_POLICY_LIMITS.autoApproveThreshold).toEqual({ min: 90, max: 99 });
    expect(APPROVAL_POLICY_LIMITS.nameMaxLength).toBe(100);
  });

  it('built-in defaults reproduce the behaviour before policies existed (AC-007)', () => {
    expect(APPROVAL_POLICY_DEFAULTS.AGENT_TOOL).toEqual({ ...baseRule, timeoutMinutes: 30 });
    expect(APPROVAL_POLICY_DEFAULTS.AUTO_RESPONSE).toEqual({ ...baseRule, timeoutMinutes: 1440 });
  });
});

describe('approverRoleRank / canReview (BR-4)', () => {
  it('ranks the roles in order, admin-equivalents at the top', () => {
    expect(approverRoleRank('USER')).toBe(0);
    expect(approverRoleRank('SALES_REP')).toBe(1);
    expect(approverRoleRank('MANAGER')).toBe(2);
    expect(approverRoleRank('ADMIN')).toBe(3);
    expect(approverRoleRank('OWNER')).toBe(3);
    expect(approverRoleRank('SUPER_ADMIN')).toBe(3);
  });

  it('ranks unknown, empty and differently-cased roles as -1', () => {
    expect(approverRoleRank('admin')).toBe(-1);
    expect(approverRoleRank('GUEST')).toBe(-1);
    expect(approverRoleRank(undefined)).toBe(-1);
    expect(approverRoleRank(null)).toBe(-1);
  });

  it('lets any role through when the minimum is USER', () => {
    expect(canReview('GUEST', baseRule)).toBe(true);
    expect(canReview(undefined, baseRule)).toBe(true);
  });

  it('requires at least the minimum role otherwise', () => {
    const rule = { ...baseRule, minReviewerRole: 'MANAGER' as const };
    expect(canReview('SALES_REP', rule)).toBe(false);
    expect(canReview('MANAGER', rule)).toBe(true);
    expect(canReview('ADMIN', rule)).toBe(true);
    expect(canReview('OWNER', rule)).toBe(true);
    expect(canReview('GUEST', rule)).toBe(false);
    expect(canReview(undefined, rule)).toBe(false);
  });
});

describe('confidence helpers', () => {
  it('accepts only finite numbers in [0, 1]', () => {
    expect(isValidConfidence(0)).toBe(true);
    expect(isValidConfidence(1)).toBe(true);
    expect(isValidConfidence(0.5)).toBe(true);
    expect(isValidConfidence(-0.1)).toBe(false);
    expect(isValidConfidence(1.1)).toBe(false);
    expect(isValidConfidence(Number.NaN)).toBe(false);
    expect(isValidConfidence(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidConfidence(null)).toBe(false);
    expect(isValidConfidence(undefined)).toBe(false);
    expect(isValidConfidence('0.9')).toBe(false);
  });

  it('converts to a percentage without rounding, or null when invalid', () => {
    expect(confidenceToPercent(0.899)).toBeCloseTo(89.9, 10);
    expect(confidenceToPercent(0.95)).toBeCloseTo(95, 10);
    expect(confidenceToPercent(Number.NaN)).toBeNull();
    expect(confidenceToPercent(null)).toBeNull();
  });
});

describe('evaluateAutoApproval (A3/A4)', () => {
  const enabled: ApprovalRule = {
    ...baseRule,
    autoApproveEnabled: true,
    autoApproveMinConfidence: 90,
  };
  const eligible: AutoApprovalInput = {
    scope: 'AGENT_TOOL',
    rule: enabled,
    confidence: 0.95,
    impact: 'LOW',
    agentKey: 'create_case',
    actionType: 'CREATE',
    requesterRole: 'MANAGER',
    requesterCanApprove: true,
    hasSessionRequester: true,
  };

  it('approves an eligible agent action and explains why', () => {
    const result = evaluateAutoApproval(eligible);
    expect(result.approve).toBe(true);
    expect(result.reason).toMatch(/95(\.0)?% > 90%/);
  });

  it.each([
    ['policy disabled', { rule: { ...enabled, autoApproveEnabled: false } }, /disabled/],
    ['threshold missing', { rule: { ...enabled, autoApproveMinConfidence: null } }, /threshold/],
    ['threshold below 90', { rule: { ...enabled, autoApproveMinConfidence: 89 } }, /threshold/],
    ['threshold above 99', { rule: { ...enabled, autoApproveMinConfidence: 100 } }, /threshold/],
    ['no session requester', { hasSessionRequester: false }, /requester/],
    ['requester lacks permission', { requesterCanApprove: false }, /permission/],
    [
      'requester below minimum role',
      { rule: { ...enabled, minReviewerRole: 'ADMIN' as const }, requesterRole: 'MANAGER' },
      /role/,
    ],
    ['confidence missing', { confidence: undefined }, /confidence/],
    ['confidence null', { confidence: null }, /confidence/],
    ['confidence NaN', { confidence: Number.NaN }, /confidence/],
    ['confidence negative', { confidence: -0.1 }, /confidence/],
    ['confidence above 1', { confidence: 1.1 }, /confidence/],
    ['confidence equal to the threshold', { confidence: 0.9 }, /not above/],
    ['confidence below the threshold', { confidence: 0.899 }, /not above/],
    ['impact HIGH', { impact: 'HIGH' as const }, /impact/],
    ['impact missing', { impact: undefined }, /impact/],
    ['DELETE action', { actionType: 'DELETE' }, /DELETE/],
    [
      'email draft',
      { agentKey: 'draft_message', actionType: 'DRAFT', messageType: 'EMAIL' },
      /external/,
    ],
    [
      'sms draft',
      { agentKey: 'draft_message', actionType: 'DRAFT', messageType: 'SMS' },
      /external/,
    ],
    ['draft without a channel', { agentKey: 'draft_message', actionType: 'DRAFT' }, /unknown/],
    [
      'draft with an unrecognised channel',
      { agentKey: 'draft_message', actionType: 'DRAFT', messageType: 'FAX' },
      /external/,
    ],
  ])('refuses when %s', (_label, patch, reason) => {
    const result = evaluateAutoApproval({ ...eligible, ...patch } as AutoApprovalInput);
    expect(result.approve).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('allows an internal note draft', () => {
    const result = evaluateAutoApproval({
      ...eligible,
      agentKey: 'draft_message',
      actionType: 'DRAFT',
      messageType: 'NOTE',
    });
    expect(result.approve).toBe(true);
  });

  it('just above the threshold is enough (strictly greater)', () => {
    expect(evaluateAutoApproval({ ...eligible, confidence: 0.9001 }).approve).toBe(true);
  });

  it('ignores impact for auto-response drafts', () => {
    const result = evaluateAutoApproval({
      ...eligible,
      scope: 'AUTO_RESPONSE',
      agentKey: AUTO_RESPONSE_AGENT_KEY,
      actionType: 'EMAIL_RECEIVED',
      impact: undefined,
      requesterRole: 'USER',
    });
    expect(result.approve).toBe(true);
  });
});

describe('isEscalationDue', () => {
  const rule: ApprovalRule = {
    ...baseRule,
    escalationEnabled: true,
    escalateAfterMinutes: 30,
    escalationTargetUserId: 'u-target',
  };
  const start = new Date('2026-10-13T10:00:00Z');

  it('is false when escalation is disabled or incomplete', () => {
    const later = new Date('2026-10-13T12:00:00Z');
    expect(isEscalationDue(start, later, baseRule, false)).toBe(false);
    expect(isEscalationDue(start, later, { ...rule, escalateAfterMinutes: null }, false)).toBe(
      false
    );
    expect(isEscalationDue(start, later, { ...rule, escalationTargetUserId: null }, false)).toBe(
      false
    );
  });

  it('is false before the delay and true from the delay onwards', () => {
    expect(isEscalationDue(start, new Date('2026-10-13T10:29:59Z'), rule, false)).toBe(false);
    expect(isEscalationDue(start, new Date('2026-10-13T10:30:00Z'), rule, false)).toBe(true);
  });

  it('is false once already escalated', () => {
    expect(isEscalationDue(start, new Date('2026-10-13T11:00:00Z'), rule, true)).toBe(false);
  });
});

describe('resolveApprovalPolicy (BR-1)', () => {
  const scopeDefault = policy({
    id: 'default',
    name: 'Default',
    isDefault: true,
    timeoutMinutes: 45,
  });
  const exact = policy({
    id: 'exact',
    name: 'Exact',
    timeoutMinutes: 10,
    assignments: [{ agentKey: 'create_case', actionType: 'CREATE' }],
  });
  const agentWide = policy({
    id: 'agent',
    name: 'Agent',
    timeoutMinutes: 20,
    assignments: [{ agentKey: 'update_case', actionType: '*' }],
  });
  const actionWide = policy({
    id: 'action',
    name: 'Action',
    timeoutMinutes: 25,
    assignments: [{ agentKey: '*', actionType: 'UPDATE' }],
  });
  const all = [scopeDefault, exact, agentWide, actionWide];

  it('prefers an exact (agent, action) assignment', () => {
    const r = resolveApprovalPolicy(all, 'AGENT_TOOL', 'create_case', 'CREATE');
    expect(r).toMatchObject({ policyId: 'exact', policyName: 'Exact', source: 'ASSIGNMENT_EXACT' });
    expect(r.rule.timeoutMinutes).toBe(10);
  });

  it('then an agent-wide assignment', () => {
    const r = resolveApprovalPolicy(all, 'AGENT_TOOL', 'update_case', 'UPDATE');
    expect(r).toMatchObject({ policyId: 'agent', source: 'ASSIGNMENT_AGENT' });
  });

  it('then an action-wide assignment', () => {
    const r = resolveApprovalPolicy(all, 'AGENT_TOOL', 'update_appointment', 'UPDATE');
    expect(r).toMatchObject({ policyId: 'action', source: 'ASSIGNMENT_ACTION' });
  });

  it('then the scope default', () => {
    const r = resolveApprovalPolicy(all, 'AGENT_TOOL', 'draft_message', 'DRAFT');
    expect(r).toMatchObject({ policyId: 'default', source: 'SCOPE_DEFAULT' });
    expect(r.rule.timeoutMinutes).toBe(45);
  });

  it('falls back to the built-in rule for the scope', () => {
    const r = resolveApprovalPolicy([], 'AUTO_RESPONSE', AUTO_RESPONSE_AGENT_KEY, 'MANUAL');
    expect(r).toEqual({
      policyId: null,
      policyName: null,
      source: 'BUILT_IN',
      rule: APPROVAL_POLICY_DEFAULTS.AUTO_RESPONSE,
    });
  });

  it('ignores policies from the other scope', () => {
    const other = policy({
      id: 'other',
      scope: 'AUTO_RESPONSE',
      isDefault: true,
      assignments: [{ agentKey: 'create_case', actionType: 'CREATE' }],
    });
    const r = resolveApprovalPolicy([other], 'AGENT_TOOL', 'create_case', 'CREATE');
    expect(r.source).toBe('BUILT_IN');
  });

  it('returns only rule fields, not the policy record', () => {
    const r = resolveApprovalPolicy(all, 'AGENT_TOOL', 'create_case', 'CREATE');
    expect(Object.keys(r.rule).sort()).toEqual(Object.keys(baseRule).sort());
  });

  it('auto-response trigger types are valid action types for the scope', () => {
    expect(TRIGGER_TYPES).toContain('EMAIL_RECEIVED');
  });
});
