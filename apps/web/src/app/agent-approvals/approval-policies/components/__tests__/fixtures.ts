import type { PolicyRow } from '../policy-model';

export function policyRow(overrides: Partial<PolicyRow> = {}): PolicyRow {
  return {
    id: 'cmpolicy0000000001',
    name: 'Standard',
    description: null,
    colorToken: 'blue',
    scope: 'AGENT_TOOL',
    isDefault: true,
    timeoutMinutes: 60,
    minReviewerRole: 'USER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: false,
    escalateAfterMinutes: null,
    escalationTargetUserId: null,
    escalationTarget: null,
    assignments: [],
    ...overrides,
  };
}

export const LIMITS = {
  nameMaxLength: 100,
  descriptionMaxLength: 500,
  timeoutMinutes: { min: 5, max: 10080 },
  escalateAfterMinutes: { min: 5 },
  autoApproveThreshold: { min: 90, max: 99 },
  maxAssignments: 50,
};
