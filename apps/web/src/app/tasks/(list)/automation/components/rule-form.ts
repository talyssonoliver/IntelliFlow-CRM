// Rule dialog form model — PG-208. Pure functions between the dialog's string
// state and the router input: build the input, validate it with the shared
// validator, map Zod issues to field errors, and detect a duplicate active rule
// (the database partial unique index stays the authority, AC-TA-003).

import type {
  TaskAutomationEventType,
  TaskAutomationTriggerType,
  TaskPriority,
} from '@intelliflow/domain';
import {
  createTaskAutomationRuleSchema,
  findDuplicateTriggerActionRules,
  type CreateTaskAutomationRuleInput,
  type TaskAutomationActionInput,
  type TaskAutomationTriggerInput,
} from '@intelliflow/validators';
import type { ScheduleCadenceValue } from '@/components/shared/schedule-cadence-fields';
import type { OpenStage, RuleItem } from '../task-automation-labels';

export interface RuleFormState {
  name: string;
  description: string;
  isActive: boolean;
  tags: string[];
  triggerType: TaskAutomationTriggerType;
  eventType: TaskAutomationEventType;
  toStage: OpenStage | '';
  schedule: ScheduleCadenceValue;
  timezone: string;
  titleTemplate: string;
  descriptionTemplate: string;
  priority: TaskPriority;
  /** Kept as typed; parsed on save. Empty = no due date. */
  dueInDays: string;
  linkToRecord: boolean;
  assignEnabled: boolean;
  assignUserIds: string[];
  notifyEnabled: boolean;
  notifyAssignee: boolean;
  notifyOwner: boolean;
  notifyUserIds: string[];
  notifyMessage: string;
}

/** Field keys used for error ids (`rule-<key>-error`). */
export type RuleFieldKey =
  | 'name'
  | 'description'
  | 'tags'
  | 'eventType'
  | 'toStage'
  | 'cadence'
  | 'dayOfWeek'
  | 'dayOfMonth'
  | 'timeOfDay'
  | 'cronExpression'
  | 'timezone'
  | 'titleTemplate'
  | 'descriptionTemplate'
  | 'dueInDays'
  | 'assignUserIds'
  | 'notifyRecipients'
  | 'notifyMessage'
  | 'actions';

export type RuleFormErrors = Partial<Record<RuleFieldKey, string>>;

export function emptyRuleForm(timezone: string, eventType: TaskAutomationEventType): RuleFormState {
  return {
    name: '',
    description: '',
    isActive: true,
    tags: [],
    triggerType: 'ENTITY_EVENT',
    eventType,
    toStage: '',
    schedule: {
      cadence: 'daily',
      dayOfWeek: '1',
      dayOfMonth: '1',
      timeOfDay: '09:00',
      cronExpression: '',
    },
    timezone,
    titleTemplate: '',
    descriptionTemplate: '',
    priority: 'MEDIUM',
    dueInDays: '1',
    linkToRecord: true,
    assignEnabled: false,
    assignUserIds: [],
    notifyEnabled: false,
    notifyAssignee: true,
    notifyOwner: false,
    notifyUserIds: [],
    notifyMessage: '',
  };
}

function triggerIntoForm(form: RuleFormState, trigger: TaskAutomationTriggerInput): void {
  form.triggerType = trigger.type;
  if (trigger.type === 'ENTITY_EVENT') {
    form.eventType = trigger.eventType;
    form.toStage = trigger.filter?.toStage ?? '';
    return;
  }
  if (trigger.type !== 'SCHEDULE') return;
  form.timezone = trigger.timezone;
  form.schedule = {
    cadence: trigger.cadence,
    dayOfWeek: String(trigger.dayOfWeek ?? 1),
    dayOfMonth: String(trigger.dayOfMonth ?? 1),
    timeOfDay: trigger.timeOfDay ?? '09:00',
    cronExpression: trigger.cronExpression ?? '',
  };
}

function actionIntoForm(form: RuleFormState, action: TaskAutomationActionInput): void {
  if (action.type === 'CREATE_TASK') {
    form.titleTemplate = action.titleTemplate;
    form.descriptionTemplate = action.descriptionTemplate ?? '';
    form.priority = action.priority;
    form.dueInDays = action.dueInDays === null ? '' : String(action.dueInDays);
    form.linkToRecord = action.linkToRecord;
  } else if (action.type === 'ASSIGN_ROUND_ROBIN') {
    form.assignEnabled = true;
    form.assignUserIds = [...action.userIds];
  } else {
    form.notifyEnabled = true;
    form.notifyAssignee = action.recipients.assignee;
    form.notifyOwner = action.recipients.owner;
    form.notifyUserIds = [...action.recipients.userIds];
    form.notifyMessage = action.message ?? '';
  }
}

export function ruleToForm(
  rule: RuleItem,
  timezone: string,
  eventType: TaskAutomationEventType
): RuleFormState {
  const form = emptyRuleForm(timezone, eventType);
  form.name = rule.name;
  form.description = rule.description ?? '';
  form.isActive = rule.isActive;
  form.tags = [...rule.tags];
  triggerIntoForm(form, rule.trigger);
  form.notifyAssignee = false;
  for (const action of rule.actions) actionIntoForm(form, action);
  return form;
}

function toInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Unparseable text stays a NaN so the validator reports it instead of dropping it. */
function dueInDaysValue(value: string): number | null {
  if (value.trim() === '') return null;
  return toInt(value) ?? Number.NaN;
}

export function formTrigger(form: RuleFormState): TaskAutomationTriggerInput {
  if (form.triggerType === 'WEBHOOK') return { type: 'WEBHOOK' };
  if (form.triggerType === 'ENTITY_EVENT') {
    if (form.toStage && form.eventType === 'opportunity.stage_changed') {
      return { type: 'ENTITY_EVENT', eventType: form.eventType, filter: { toStage: form.toStage } };
    }
    return { type: 'ENTITY_EVENT', eventType: form.eventType };
  }
  const s = form.schedule;
  const custom = s.cadence === 'custom';
  return {
    type: 'SCHEDULE',
    cadence: s.cadence,
    timezone: form.timezone,
    ...(s.cadence === 'weekly' ? { dayOfWeek: toInt(s.dayOfWeek) } : {}),
    ...(s.cadence === 'monthly' || s.cadence === 'quarterly'
      ? { dayOfMonth: toInt(s.dayOfMonth) }
      : {}),
    ...(custom ? { cronExpression: s.cronExpression.trim() } : { timeOfDay: s.timeOfDay }),
  };
}

export function formActions(form: RuleFormState): TaskAutomationActionInput[] {
  const actions: TaskAutomationActionInput[] = [
    {
      type: 'CREATE_TASK',
      titleTemplate: form.titleTemplate,
      descriptionTemplate: form.descriptionTemplate.trim() || null,
      priority: form.priority,
      dueInDays: dueInDaysValue(form.dueInDays),
      linkToRecord: form.triggerType === 'ENTITY_EVENT' && form.linkToRecord,
    },
  ];
  if (form.assignEnabled) actions.push({ type: 'ASSIGN_ROUND_ROBIN', userIds: form.assignUserIds });
  if (form.notifyEnabled) {
    actions.push({
      type: 'NOTIFY',
      recipients: {
        assignee: form.notifyAssignee,
        owner: form.notifyOwner,
        userIds: form.notifyUserIds,
      },
      message: form.notifyMessage.trim() || null,
    });
  }
  return actions;
}

export function formToInput(form: RuleFormState): CreateTaskAutomationRuleInput {
  return {
    name: form.name,
    description: form.description.trim() || null,
    isActive: form.isActive,
    tags: form.tags,
    trigger: formTrigger(form),
    actions: formActions(form),
  };
}

const TRIGGER_FIELDS: Record<string, RuleFieldKey> = {
  eventType: 'eventType',
  filter: 'toStage',
  cadence: 'cadence',
  dayOfWeek: 'dayOfWeek',
  dayOfMonth: 'dayOfMonth',
  timeOfDay: 'timeOfDay',
  cronExpression: 'cronExpression',
  timezone: 'timezone',
};

const ACTION_FIELDS: Record<string, RuleFieldKey> = {
  titleTemplate: 'titleTemplate',
  descriptionTemplate: 'descriptionTemplate',
  dueInDays: 'dueInDays',
  userIds: 'assignUserIds',
  recipients: 'notifyRecipients',
  message: 'notifyMessage',
};

/** Map one Zod issue path to the field that shows it. */
export function fieldForPath(path: readonly PropertyKey[]): RuleFieldKey {
  const [head, second, third] = path;
  if (head === 'trigger') return TRIGGER_FIELDS[String(second)] ?? 'actions';
  if (head === 'actions') {
    return third === undefined ? 'actions' : (ACTION_FIELDS[String(third)] ?? 'actions');
  }
  if (head === 'name' || head === 'description' || head === 'tags') return head;
  return 'actions';
}

export function validateRuleForm(form: RuleFormState): {
  input: CreateTaskAutomationRuleInput | null;
  errors: RuleFormErrors;
} {
  const result = createTaskAutomationRuleSchema.safeParse(formToInput(form));
  if (result.success) return { input: result.data, errors: {} };
  const errors: RuleFormErrors = {};
  for (const issue of result.error.issues) {
    const key = fieldForPath(issue.path);
    errors[key] ??=
      key === 'dueInDays' ? 'Enter a whole number of days from 0 to 365.' : issue.message;
  }
  return { input: null, errors };
}

/** Name of an active rule that already does the same thing, if any. */
export function duplicateRuleName(
  candidate: CreateTaskAutomationRuleInput,
  rules: readonly RuleItem[],
  editingId: string | null
): string | null {
  if (!candidate.isActive) return null;
  const others = rules.filter((r) => r.id !== editingId && r.isActive);
  const pair = findDuplicateTriggerActionRules([
    ...others.map((r) => ({ isActive: true, trigger: r.trigger, actions: r.actions })),
    { isActive: true, trigger: candidate.trigger, actions: candidate.actions },
  ]);
  if (!pair || pair[1] !== others.length) return null;
  return others[pair[0]].name;
}
