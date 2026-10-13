import { describe, it, expect } from 'vitest';
import { APPROVAL_POLICY_SCOPES, APPROVER_ROLES, SYSTEM_APPROVAL_ACTOR } from '@intelliflow/domain';
import {
  approvalPolicyScopeSchema,
  approverRoleSchema,
  createApprovalPolicySchema,
  updateApprovalPolicySchema,
  deleteApprovalPolicySchema,
  setDefaultApprovalPolicySchema,
  approvalPolicyPreviewSchema,
} from '../approval-policies';
import { actorIdSchema } from '../common';

const CUID = 'cabcdefgh1234';

const agentPolicy = {
  name: 'Strict updates',
  scope: 'AGENT_TOOL' as const,
  timeoutMinutes: 60,
};

const autoResponsePolicy = {
  name: 'Email drafts',
  scope: 'AUTO_RESPONSE' as const,
  timeoutMinutes: 1440,
};

function issues(input: unknown) {
  const result = createApprovalPolicySchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues;
}

describe('approval policy enums', () => {
  it('derive from the domain constants', () => {
    expect(approvalPolicyScopeSchema.options).toEqual([...APPROVAL_POLICY_SCOPES]);
    expect(approverRoleSchema.options).toEqual([...APPROVER_ROLES]);
  });
});

describe('createApprovalPolicySchema', () => {
  it('applies safe defaults (AI auto-approval OFF)', () => {
    const parsed = createApprovalPolicySchema.parse(agentPolicy);
    expect(parsed).toMatchObject({
      colorToken: 'slate',
      isDefault: false,
      minReviewerRole: 'USER',
      autoApproveEnabled: false,
      autoApproveMinConfidence: null,
      escalationEnabled: false,
      escalateAfterMinutes: null,
      escalationTargetUserId: null,
      assignments: [],
    });
  });

  it('accepts a fully configured agent-tool policy', () => {
    const parsed = createApprovalPolicySchema.parse({
      ...agentPolicy,
      description: '  Managers review updates  ',
      colorToken: 'amber',
      isDefault: true,
      minReviewerRole: 'MANAGER',
      autoApproveEnabled: true,
      autoApproveMinConfidence: 95,
      escalationEnabled: true,
      escalateAfterMinutes: 30,
      escalationTargetUserId: CUID,
      assignments: [
        { agentKey: 'update_case', actionType: 'UPDATE' },
        { agentKey: 'create_case', actionType: '*' },
        { agentKey: '*', actionType: 'DRAFT' },
      ],
    });
    expect(parsed.description).toBe('Managers review updates');
    expect(parsed.assignments).toHaveLength(3);
  });

  it('accepts an auto-response policy keyed by trigger type', () => {
    const parsed = createApprovalPolicySchema.parse({
      ...autoResponsePolicy,
      assignments: [
        { agentKey: 'auto_response', actionType: 'EMAIL_RECEIVED' },
        { agentKey: '*', actionType: 'CHAT_MESSAGE' },
        { agentKey: 'auto_response', actionType: '*' },
      ],
    });
    expect(parsed.assignments).toHaveLength(3);
  });

  it('rejects duplicate (agent, action) pairs with "rows N and M" on the second row', () => {
    const found = issues({
      ...agentPolicy,
      assignments: [
        { agentKey: 'update_case', actionType: 'UPDATE' },
        { agentKey: 'create_case', actionType: 'CREATE' },
        { agentKey: 'update_case', actionType: 'UPDATE' },
      ],
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/rows 1 and 3/);
    expect(found[0]!.path).toEqual(['assignments', 2]);
  });

  it.each([
    ['empty name', { name: '   ' }, 'name'],
    ['too-long name', { name: 'x'.repeat(101) }, 'name'],
    ['colour outside the allowlist', { colorToken: 'gold' }, 'colorToken'],
    ['unknown scope', { scope: 'TICKETS' }, 'scope'],
    ['timeout below 5 minutes', { timeoutMinutes: 4 }, 'timeoutMinutes'],
    ['timeout above 7 days', { timeoutMinutes: 10081 }, 'timeoutMinutes'],
    ['fractional timeout', { timeoutMinutes: 30.5 }, 'timeoutMinutes'],
    ['unknown reviewer role', { minReviewerRole: 'OWNER' }, 'minReviewerRole'],
    [
      'threshold 89',
      { autoApproveEnabled: true, autoApproveMinConfidence: 89 },
      'autoApproveMinConfidence',
    ],
    [
      'threshold 100',
      { autoApproveEnabled: true, autoApproveMinConfidence: 100 },
      'autoApproveMinConfidence',
    ],
    ['auto-approve without threshold', { autoApproveEnabled: true }, 'autoApproveMinConfidence'],
    [
      'escalation without a target',
      { escalationEnabled: true, escalateAfterMinutes: 30 },
      'escalationTargetUserId',
    ],
    [
      'escalation without a delay',
      { escalationEnabled: true, escalationTargetUserId: CUID },
      'escalateAfterMinutes',
    ],
    [
      'escalation delay equal to the timeout',
      { escalationEnabled: true, escalateAfterMinutes: 60, escalationTargetUserId: CUID },
      'escalateAfterMinutes',
    ],
    [
      'escalation delay below 5 minutes',
      { escalationEnabled: true, escalateAfterMinutes: 4, escalationTargetUserId: CUID },
      'escalateAfterMinutes',
    ],
    [
      'malformed escalation target',
      { escalationTargetUserId: 'not-an-id' },
      'escalationTargetUserId',
    ],
    [
      'a stored delay at or above the timeout while escalation is off',
      { escalationEnabled: false, escalateAfterMinutes: 60 },
      'escalateAfterMinutes',
    ],
  ])('rejects %s', (_label, patch, field) => {
    const found = issues({ ...agentPolicy, ...patch });
    expect(found.some((i) => i.path[0] === field)).toBe(true);
  });

  it.each([
    ['an unknown agent tool', { agentKey: 'search_leads', actionType: '*' }],
    ['an action the tool never performs', { agentKey: 'create_case', actionType: 'UPDATE' }],
    ['an unknown action type', { agentKey: '*', actionType: 'DELETE' }],
    ['a double wildcard', { agentKey: '*', actionType: '*' }],
    ['an auto-response trigger', { agentKey: '*', actionType: 'EMAIL_RECEIVED' }],
  ])('rejects an agent-tool assignment with %s', (_label, assignment) => {
    const found = issues({ ...agentPolicy, assignments: [assignment] });
    expect(found[0]!.path).toEqual(['assignments', 0]);
  });

  it.each([
    ['an agent tool key', { agentKey: 'create_case', actionType: '*' }],
    ['an unknown trigger', { agentKey: 'auto_response', actionType: 'CREATE' }],
    ['a double wildcard', { agentKey: '*', actionType: '*' }],
  ])('rejects an auto-response assignment with %s', (_label, assignment) => {
    const found = issues({ ...autoResponsePolicy, assignments: [assignment] });
    expect(found[0]!.path).toEqual(['assignments', 0]);
  });

  it('caps the number of assignments', () => {
    const many = Array.from({ length: 51 }, () => ({ agentKey: 'create_case', actionType: '*' }));
    expect(
      createApprovalPolicySchema.safeParse({ ...agentPolicy, assignments: many }).success
    ).toBe(false);
  });
});

describe('id-only schemas', () => {
  it('update requires an id and applies the same refinements', () => {
    expect(updateApprovalPolicySchema.safeParse(agentPolicy).success).toBe(false);
    expect(updateApprovalPolicySchema.parse({ ...agentPolicy, id: CUID }).id).toBe(CUID);
    expect(
      updateApprovalPolicySchema.safeParse({
        ...agentPolicy,
        id: CUID,
        autoApproveEnabled: true,
      }).success
    ).toBe(false);
  });

  it('delete and setDefault take an id', () => {
    expect(deleteApprovalPolicySchema.parse({ id: CUID })).toEqual({ id: CUID });
    expect(setDefaultApprovalPolicySchema.parse({ id: CUID })).toEqual({ id: CUID });
    expect(deleteApprovalPolicySchema.safeParse({ id: 'x' }).success).toBe(false);
  });

  it('preview takes a scope', () => {
    expect(approvalPolicyPreviewSchema.parse({ scope: 'AUTO_RESPONSE' })).toEqual({
      scope: 'AUTO_RESPONSE',
    });
    expect(approvalPolicyPreviewSchema.safeParse({ scope: 'X' }).success).toBe(false);
  });
});

describe('actorIdSchema (A10)', () => {
  it('accepts user ids and system actors', () => {
    expect(actorIdSchema.safeParse(CUID).success).toBe(true);
    expect(actorIdSchema.safeParse('00000000-0000-4000-8000-000000000001').success).toBe(true);
    expect(actorIdSchema.safeParse(SYSTEM_APPROVAL_ACTOR).success).toBe(true);
  });

  it('rejects malformed actors', () => {
    expect(actorIdSchema.safeParse('system:').success).toBe(false);
    expect(actorIdSchema.safeParse('admin').success).toBe(false);
    expect(actorIdSchema.safeParse('system:Approval Policy').success).toBe(false);
  });
});
