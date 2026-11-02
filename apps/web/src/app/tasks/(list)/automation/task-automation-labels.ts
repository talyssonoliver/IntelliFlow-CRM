// Task Automation display labels and summaries — PG-208. Vocabulary comes from
// @intelliflow/domain (constants only, L11); this file only turns it into words.

import {
  TASK_AUTOMATION_OUTCOMES,
  type TaskAutomationActionType,
  type TaskAutomationOpenStage,
  type TaskAutomationTriggerType,
} from '@intelliflow/domain';
import {
  describeSchedule,
  type TaskAutomationActionInput,
  type TaskAutomationRuleView,
  type TaskAutomationTriggerInput,
} from '@intelliflow/validators';
import type { VariableSuggestion } from '@/components/shared/variable-picker';

type DateLike = string | Date;

/** TaskAutomationRuleView as the client receives it (dates arrive as ISO strings). */
export type RuleItem = Omit<
  TaskAutomationRuleView,
  'nextRunAt' | 'lastRunAt' | 'createdAt' | 'updatedAt'
> & {
  nextRunAt: DateLike | null;
  lastRunAt: DateLike | null;
  createdAt: DateLike;
  updatedAt: DateLike;
};

export const TRIGGER_TYPE_LABELS: Record<TaskAutomationTriggerType, string> = {
  ENTITY_EVENT: 'When something happens in the CRM',
  SCHEDULE: 'On a schedule',
  WEBHOOK: 'When another system calls a webhook',
};

export const ACTION_TYPE_LABELS: Record<TaskAutomationActionType, string> = {
  CREATE_TASK: 'Create Task',
  ASSIGN_ROUND_ROBIN: 'Assign Round-Robin',
  NOTIFY: 'Notify',
};

export type OpenStage = TaskAutomationOpenStage;
export const OPEN_STAGE_LABELS: Record<OpenStage, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

export interface EventOption {
  eventType: string;
  label: string;
}

export function outcomeLabel(outcome: string | null): string | null {
  if (!outcome) return null;
  return outcome in TASK_AUTOMATION_OUTCOMES
    ? TASK_AUTOMATION_OUTCOMES[outcome as keyof typeof TASK_AUTOMATION_OUTCOMES]
    : outcome;
}

export function eventLabel(eventType: string, events: readonly EventOption[]): string {
  return events.find((e) => e.eventType === eventType)?.label ?? eventType;
}

export function triggerSummary(
  trigger: TaskAutomationTriggerInput,
  events: readonly EventOption[]
): string {
  if (trigger.type === 'WEBHOOK') return 'When the webhook is called';
  if (trigger.type === 'SCHEDULE') return describeSchedule(trigger);
  const label = eventLabel(trigger.eventType, events);
  const stage = trigger.filter?.toStage;
  return stage ? `${label} to ${OPEN_STAGE_LABELS[stage]}` : label;
}

export function actionsSummary(actions: readonly TaskAutomationActionInput[]): string {
  return actions.map((a) => ACTION_TYPE_LABELS[a.type]).join(', then ');
}

/** Who owns the created task (owner ruling 3). */
export function ownerRuleText(triggerType: TaskAutomationTriggerType): string {
  return triggerType === 'ENTITY_EVENT'
    ? 'the record owner (the rule creator if the owner has left)'
    : 'the person who created the rule';
}

/** M5: schedule rules use their own timezone; other rules end the day in UTC. */
export function dueDateHelp(triggerType: TaskAutomationTriggerType): string {
  return triggerType === 'SCHEDULE'
    ? '0 = end of today, in the rule’s timezone. Leave empty for no due date.'
    : '0 = end of today (UTC). Leave empty for no due date.';
}

const COMMON_VARIABLES: VariableSuggestion[] = [
  { path: 'rule.name', description: 'This rule’s name' },
  { path: 'event.label', description: 'What triggered the rule' },
];

const RECORD_VARIABLES: VariableSuggestion[] = [
  { path: 'record.name', description: 'Name of the lead, contact, deal or account' },
  { path: 'record.type', description: 'Record type, e.g. Lead' },
  { path: 'record.owner', description: 'Record owner’s name' },
  { path: 'record.url', description: 'Link to the record' },
];

/** Template tokens the engine fills for this trigger (task-automation-engine templateVars). */
export function variablesForTrigger(
  trigger: Pick<TaskAutomationTriggerInput, 'type'> & { eventType?: string }
): VariableSuggestion[] {
  if (trigger.type === 'SCHEDULE') {
    return [
      ...COMMON_VARIABLES,
      { path: 'schedule.date', description: 'Date of the scheduled run' },
    ];
  }
  if (trigger.type === 'WEBHOOK') return COMMON_VARIABLES;
  const vars = [...COMMON_VARIABLES, ...RECORD_VARIABLES];
  if (trigger.eventType === 'opportunity.stage_changed') {
    vars.push({ path: 'stage.new', description: 'The deal’s new stage' });
  }
  return vars;
}
