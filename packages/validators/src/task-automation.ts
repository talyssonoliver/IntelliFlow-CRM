// IntelliFlow CRM - Task Automation Validators (PG-208)
// Zod schemas for /tasks/automation (taskAutomation router). Vocabulary and the
// duplicate-rule key come from @intelliflow/domain (DRY); schedule cadence
// shapes are shared with Scheduled Reports (PG-201). ADR-084.

import { z } from 'zod';
import {
  TASK_AUTOMATION_ACTION_TYPES,
  TASK_AUTOMATION_EVENT_TYPES,
  TASK_AUTOMATION_LIMITS,
  TASK_AUTOMATION_OPEN_STAGES,
  TASK_PRIORITIES,
  canonicalRuleKey,
  type TaskAutomationActionShape,
  type TaskAutomationTriggerShape,
} from '@intelliflow/domain';
import { ACCOUNT_TAG_COLOR_TOKENS } from './account-settings';
import {
  checkCadenceRules,
  cronExpressionSchema,
  dayOfMonthField,
  dayOfWeekField,
  ianaTimezoneSchema,
  scheduleCadenceSchema,
  timeOfDayField,
} from './scheduled-reports';

const L = TASK_AUTOMATION_LIMITS;

// Same 18-token palette as account / report-schedule tags (DB CHECK mirrors it).
export const TASK_AUTOMATION_TAG_COLOR_TOKENS = ACCOUNT_TAG_COLOR_TOKENS;
export const taskAutomationTagColorTokenSchema = z.enum(TASK_AUTOMATION_TAG_COLOR_TOKENS);

export const TASK_AUTOMATION_SETTINGS_DEFAULTS = {
  automationEnabled: true,
  notifyRuleOwnerOnFailure: false,
  maxRunsPerRulePerHour: L.defaultRunsPerRulePerHour,
} as const;

const idField = z.string().trim().min(1).max(191);

// ─── Triggers ────────────────────────────────────────────────────────────────

const entityEventTriggerSchema = z
  .object({
    type: z.literal('ENTITY_EVENT'),
    eventType: z.enum(TASK_AUTOMATION_EVENT_TYPES),
    filter: z
      .object({ toStage: z.enum(TASK_AUTOMATION_OPEN_STAGES).optional() })
      .strict()
      .optional(),
  })
  .strict();

const scheduleTriggerSchema = z
  .object({
    type: z.literal('SCHEDULE'),
    cadence: scheduleCadenceSchema,
    dayOfWeek: dayOfWeekField.optional(),
    dayOfMonth: dayOfMonthField.optional(),
    timeOfDay: timeOfDayField.optional(),
    cronExpression: cronExpressionSchema.optional(),
    timezone: ianaTimezoneSchema,
  })
  .strict();

const webhookTriggerSchema = z.object({ type: z.literal('WEBHOOK') }).strict();

type TriggerInput =
  | z.infer<typeof entityEventTriggerSchema>
  | z.infer<typeof scheduleTriggerSchema>
  | z.infer<typeof webhookTriggerSchema>;

function refineTrigger(trigger: TriggerInput, ctx: z.RefinementCtx): void {
  if (trigger.type === 'ENTITY_EVENT') {
    if (trigger.filter?.toStage && trigger.eventType !== 'opportunity.stage_changed') {
      ctx.addIssue({
        code: 'custom',
        path: ['filter', 'toStage'],
        message: 'A target stage only applies to "Deal stage changed".',
      });
    }
    return;
  }
  if (trigger.type === 'SCHEDULE') checkCadenceRules(trigger, ctx);
}

export const taskAutomationTriggerSchema = z
  .discriminatedUnion('type', [
    entityEventTriggerSchema,
    scheduleTriggerSchema,
    webhookTriggerSchema,
  ])
  .superRefine(refineTrigger);
export type TaskAutomationTriggerInput = z.infer<typeof taskAutomationTriggerSchema>;

// ─── Actions ─────────────────────────────────────────────────────────────────

function noDuplicateIds(list: readonly string[], ctx: z.RefinementCtx, what: string): void {
  const seen = new Map<string, number>();
  list.forEach((id, index) => {
    const first = seen.get(id);
    if (first !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [index],
        message: `Duplicate ${what}: rows ${first + 1} and ${index + 1} are the same user.`,
      });
      return;
    }
    seen.set(id, index);
  });
}

const createTaskActionSchema = z
  .object({
    type: z.literal('CREATE_TASK'),
    titleTemplate: z.string().trim().min(1, 'Enter a task title.').max(L.titleMax),
    descriptionTemplate: z.string().trim().max(L.descriptionMax).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES),
    dueInDays: z.number().int().min(0).max(L.maxDueInDays).nullable(),
    linkToRecord: z.boolean(),
  })
  .strict();

const assignActionSchema = z
  .object({
    type: z.literal('ASSIGN_ROUND_ROBIN'),
    userIds: z
      .array(idField)
      .min(1, 'Pick at least one person.')
      .max(L.maxPoolSize, `At most ${L.maxPoolSize} people.`)
      .superRefine((list, ctx) => noDuplicateIds(list, ctx, 'member')),
  })
  .strict();

const notifyActionSchema = z
  .object({
    type: z.literal('NOTIFY'),
    recipients: z
      .object({
        assignee: z.boolean(),
        owner: z.boolean(),
        userIds: z
          .array(idField)
          .max(L.maxNotifyRecipients, `At most ${L.maxNotifyRecipients} people.`)
          .superRefine((list, ctx) => noDuplicateIds(list, ctx, 'recipient')),
      })
      .strict()
      .refine((r) => r.assignee || r.owner || r.userIds.length > 0, {
        message: 'Choose at least one recipient.',
      }),
    message: z.string().trim().max(L.messageMax).nullable().optional(),
  })
  .strict();

export const taskAutomationActionSchema = z.discriminatedUnion('type', [
  createTaskActionSchema,
  assignActionSchema,
  notifyActionSchema,
]);
export type TaskAutomationActionInput = z.infer<typeof taskAutomationActionSchema>;

const actionListSchema = z.array(taskAutomationActionSchema);

/** Stored `actions` JSON as typed actions, or null when it does not match the schema. */
export function parseTaskAutomationActions(value: unknown): TaskAutomationActionInput[] | null {
  const parsed = actionListSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const ACTION_LABELS: Record<(typeof TASK_AUTOMATION_ACTION_TYPES)[number], string> = {
  CREATE_TASK: 'Create Task',
  ASSIGN_ROUND_ROBIN: 'Assign Round-Robin',
  NOTIFY: 'Notify',
};

/**
 * DoD item 9 (playbook §6): one trigger per rule, so a duplicate (trigger,
 * action) pair is a repeated action type. Reported at the second offender as
 * "actions N and M". Actions also follow the canonical order, Create Task first.
 */
function refineActions(actions: readonly TaskAutomationActionInput[], ctx: z.RefinementCtx): void {
  if (actions.length > 0 && actions[0].type !== 'CREATE_TASK') {
    ctx.addIssue({
      code: 'custom',
      path: ['actions', 0],
      message: 'The first action must be Create Task.',
    });
  }
  const seen = new Map<string, number>();
  let lastOrder = -1;
  actions.forEach((action, index) => {
    const first = seen.get(action.type);
    if (first !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['actions', index],
        message: `Duplicate action: actions ${first + 1} and ${index + 1} are both ${ACTION_LABELS[action.type]}.`,
      });
      return;
    }
    seen.set(action.type, index);
    const order = TASK_AUTOMATION_ACTION_TYPES.indexOf(action.type);
    if (order < lastOrder) {
      ctx.addIssue({
        code: 'custom',
        path: ['actions', index],
        message: 'Actions run in this order: Create Task, Assign Round-Robin, Notify.',
      });
    }
    lastOrder = Math.max(lastOrder, order);
  });
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const tagNamesSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(L.maxTags, `At most ${L.maxTags} tags.`)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((name, index) => {
      const key = name.toLowerCase();
      if (seen.has(key))
        ctx.addIssue({ code: 'custom', path: [index], message: `Duplicate tag: ${name}.` });
      seen.add(key);
    });
  });

// Create and update are separate objects (not .partial().extend()) to avoid TS2589
// through tRPC generics (PG-200 note).
const ruleFields = {
  name: z.string().trim().min(1, 'Enter a name.').max(L.maxNameLength),
  description: z.string().trim().max(L.maxDescriptionLength).nullable().optional(),
  isActive: z.boolean().default(true),
  tags: tagNamesSchema.default([]),
  trigger: taskAutomationTriggerSchema,
  actions: z
    .array(taskAutomationActionSchema)
    .min(1, 'Add at least one action.')
    .max(L.maxActionsPerRule, `At most ${L.maxActionsPerRule} actions.`),
};

export const createTaskAutomationRuleSchema = z
  .object(ruleFields)
  .strict()
  .superRefine((rule, ctx) => refineActions(rule.actions, ctx));
export type CreateTaskAutomationRuleInput = z.infer<typeof createTaskAutomationRuleSchema>;

/** The router keeps the trigger type immutable (change = delete + create). */
export const updateTaskAutomationRuleSchema = z
  .object({ id: idField, ...ruleFields })
  .strict()
  .superRefine((rule, ctx) => refineActions(rule.actions, ctx));
export type UpdateTaskAutomationRuleInput = z.infer<typeof updateTaskAutomationRuleSchema>;

export const taskAutomationRuleIdSchema = z.object({ id: idField }).strict();
export const setTaskAutomationRuleActiveSchema = z
  .object({ id: idField, isActive: z.boolean() })
  .strict();
export const listTaskAutomationRunsSchema = z.object({ ruleId: idField }).strict();
export const rotateTaskAutomationWebhookSecretSchema = z
  .object({ id: idField, revokePrevious: z.boolean().default(false) })
  .strict();

export const reorderTaskAutomationRulesSchema = z
  .object({
    ids: z
      .array(idField)
      .min(1)
      .max(L.maxRulesPerTenant)
      .refine((ids) => new Set(ids).size === ids.length, 'Each rule may appear once.'),
  })
  .strict();

export const updateTaskAutomationSettingsSchema = z
  .object({
    automationEnabled: z.boolean().optional(),
    notifyRuleOwnerOnFailure: z.boolean().optional(),
    maxRunsPerRulePerHour: z
      .number()
      .int()
      .min(L.minRunsPerRulePerHour)
      .max(L.maxRunsPerRulePerHour)
      .optional(),
  })
  .strict();
export type UpdateTaskAutomationSettingsInput = z.infer<typeof updateTaskAutomationSettingsSchema>;

// ─── Tags (PG-201 shape) ─────────────────────────────────────────────────────

const tagNameField = z.string().trim().min(1).max(50);

export const createTaskAutomationTagSchema = z
  .object({
    name: tagNameField,
    colorToken: taskAutomationTagColorTokenSchema.optional(),
    description: z.string().trim().max(200).optional(),
  })
  .strict();

export const updateTaskAutomationTagSchema = z
  .object({
    id: idField,
    name: tagNameField.optional(),
    colorToken: taskAutomationTagColorTokenSchema.optional(),
    description: z.string().trim().max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// ─── Duplicate-rule helper (dialog feedback; the DB index is the authority) ──

export interface DuplicateRuleCandidate {
  isActive: boolean;
  trigger: TaskAutomationTriggerShape;
  actions: readonly TaskAutomationActionShape[];
}

/** Positions of the first two active rules that do the same thing, or null. */
export function findDuplicateTriggerActionRules(
  rules: readonly DuplicateRuleCandidate[]
): [number, number] | null {
  const seen = new Map<string, number>();
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    if (!rule.isActive) continue;
    const key = canonicalRuleKey(rule.trigger, rule.actions);
    if (key === null) continue;
    const first = seen.get(key);
    if (first !== undefined) return [first, index];
    seen.set(key, index);
  }
  return null;
}

// ─── Output contracts (explicit, no Prisma JsonValue through tRPC — #772) ────

export interface TaskAutomationRuleView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  tags: string[];
  trigger: TaskAutomationTriggerInput;
  actions: TaskAutomationActionInput[];
  webhookTokenPrefix: string | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunOutcome: string | null;
  suppressedCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskAutomationRunView {
  id: string;
  status: string;
  triggerType: string;
  outcome: string | null;
  errorCode: string | null;
  taskId: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface TaskAutomationSettingsView {
  automationEnabled: boolean;
  notifyRuleOwnerOnFailure: boolean;
  maxRunsPerRulePerHour: number;
}

export interface TaskAutomationTagView {
  id: string;
  name: string;
  colorToken: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Returned once for webhook rules: create (URL + secret), rotate (secret only;
 * the URL token is never stored) and regenerate (URL only).
 */
export interface TaskAutomationWebhookCredentials {
  webhookUrl: string | null;
  signingSecret: string | null;
}
