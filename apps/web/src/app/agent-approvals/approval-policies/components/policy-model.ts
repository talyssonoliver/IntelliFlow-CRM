/**
 * Approval policy view model (PG-198): the row shape `approvalPolicies.list`
 * returns, the save payload, and the labels and option lists the page shows.
 * Vocabulary comes from the domain constants (DRY), never retyped here.
 */
import {
  APPROVAL_AGENT_TOOL_KEYS,
  APPROVAL_POLICY_WILDCARD,
  APPROVAL_TOOL_ACTION_TYPES,
  AUTO_RESPONSE_AGENT_KEY,
  TRIGGER_TYPES,
  type ApprovalPolicyScope,
  type ApproverRole,
} from '@intelliflow/domain';
import type { AccountTagColorToken } from '@intelliflow/validators';

export interface PolicyAssignment {
  agentKey: string;
  actionType: string;
}

export interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  colorToken: string;
  scope: ApprovalPolicyScope;
  isDefault: boolean;
  timeoutMinutes: number;
  minReviewerRole: ApproverRole;
  autoApproveEnabled: boolean;
  autoApproveMinConfidence: number | null;
  escalationEnabled: boolean;
  escalateAfterMinutes: number | null;
  escalationTargetUserId: string | null;
  escalationTarget: { id: string; name: string } | null;
  assignments: PolicyAssignment[];
}

export interface PolicySaveInput {
  name: string;
  description?: string;
  colorToken: AccountTagColorToken;
  scope: ApprovalPolicyScope;
  isDefault: boolean;
  timeoutMinutes: number;
  minReviewerRole: ApproverRole;
  autoApproveEnabled: boolean;
  autoApproveMinConfidence: number | null;
  escalationEnabled: boolean;
  escalateAfterMinutes: number | null;
  escalationTargetUserId: string | null;
  assignments: PolicyAssignment[];
}

export const WILDCARD = APPROVAL_POLICY_WILDCARD;

export const SCOPE_META: Record<
  ApprovalPolicyScope,
  {
    title: string;
    description: string;
    icon: string;
    iconBg: string;
    iconFg: string;
    itemNoun: string;
  }
> = {
  AGENT_TOOL: {
    title: 'Agent tool actions',
    description: 'Cases, appointments and messages an AI agent wants to create or change.',
    icon: 'smart_toy',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconFg: 'text-blue-600 dark:text-blue-400',
    itemNoun: 'action',
  },
  AUTO_RESPONSE: {
    title: 'Email auto-responses',
    description: 'AI-drafted replies waiting for a person before they are sent.',
    icon: 'forward_to_inbox',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconFg: 'text-violet-600 dark:text-violet-400',
    itemNoun: 'draft',
  },
};

export const ROLE_LABELS: Record<ApproverRole, string> = {
  USER: 'Any user with approval access',
  SALES_REP: 'Sales rep or above',
  MANAGER: 'Manager or above',
  ADMIN: 'Admin only',
};

const AGENT_LABELS: Record<string, string> = {
  [WILDCARD]: 'Any agent',
  create_case: 'Create case',
  create_appointment: 'Create appointment',
  update_case: 'Update case',
  update_appointment: 'Update appointment',
  draft_message: 'Draft message',
  [AUTO_RESPONSE_AGENT_KEY]: 'Auto-response',
};

const ACTION_LABELS: Record<string, string> = {
  [WILDCARD]: 'Any action',
  CREATE: 'Create',
  UPDATE: 'Update',
  DRAFT: 'Draft',
  EMAIL_RECEIVED: 'Email received',
  FORM_SUBMIT: 'Form submitted',
  CHAT_MESSAGE: 'Chat message',
  MANUAL: 'Manual',
};

export function agentLabel(key: string): string {
  return AGENT_LABELS[key] ?? key;
}

export function actionLabel(key: string): string {
  return ACTION_LABELS[key] ?? key;
}

/** Agent and action choices an assignment row offers in a queue. */
export function assignmentOptions(scope: ApprovalPolicyScope): {
  agents: string[];
  actions: string[];
} {
  if (scope === 'AUTO_RESPONSE') {
    return { agents: [WILDCARD, AUTO_RESPONSE_AGENT_KEY], actions: [WILDCARD, ...TRIGGER_TYPES] };
  }
  return {
    agents: [WILDCARD, ...APPROVAL_AGENT_TOOL_KEYS],
    actions: [WILDCARD, ...APPROVAL_TOOL_ACTION_TYPES],
  };
}

/** "45 min", "2 h", "1 d 6 h". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(' ');
}

/** AC-018: escalation is on but its target user was deleted (FK set to null). */
export function hasFormerTarget(
  policy: Pick<PolicyRow, 'escalationEnabled' | 'escalationTargetUserId'>
): boolean {
  return policy.escalationEnabled && policy.escalationTargetUserId === null;
}
