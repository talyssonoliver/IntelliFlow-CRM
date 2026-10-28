/**
 * PG-208 — Task automation rules (ADR-084).
 *
 * Canonical vocabulary for tenant task-automation rules: trigger types, the v1
 * entity-event catalogue, action types, run statuses and outcomes, limits, and
 * the pure helpers the API engine and the web dialog share (template rendering,
 * due dates, round-robin pick, duplicate-rule key). Zero infrastructure
 * dependencies and no Node-only APIs (the web app imports this file).
 */

import type { LeadStatus } from '../../lead/Lead';
import type { OpportunityStage } from '../../opportunity/OpportunityEvents';
import type { TaskPriority } from '../TaskEvents';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../account/territory/territory-constants';

export const TASK_AUTOMATION_TRIGGER_TYPES = ['ENTITY_EVENT', 'SCHEDULE', 'WEBHOOK'] as const;
export type TaskAutomationTriggerType = (typeof TASK_AUTOMATION_TRIGGER_TYPES)[number];

/** Canonical action order: a rule's actions must follow it (CREATE_TASK first). */
export const TASK_AUTOMATION_ACTION_TYPES = [
  'CREATE_TASK',
  'ASSIGN_ROUND_ROBIN',
  'NOTIFY',
] as const;
export type TaskAutomationActionType = (typeof TASK_AUTOMATION_ACTION_TYPES)[number];

export const TASK_AUTOMATION_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
] as const;
export type TaskAutomationRunStatus = (typeof TASK_AUTOMATION_RUN_STATUSES)[number];

export const TASK_AUTOMATION_ENTITIES = ['lead', 'contact', 'opportunity', 'account'] as const;
export type TaskAutomationEntity = (typeof TASK_AUTOMATION_ENTITIES)[number];

/**
 * v1 trigger events: only events raised through the CRM services in production
 * (owner ruling 4: no task events). Kept as a literal tuple so validators can
 * build `z.enum` from it.
 */
export const TASK_AUTOMATION_EVENT_TYPES = [
  'lead.created',
  'lead.qualified',
  'lead.converted',
  'contact.created',
  'opportunity.created',
  'opportunity.stage_changed',
  'opportunity.won',
  'opportunity.lost',
  'account.created',
] as const;
export type TaskAutomationEventType = (typeof TASK_AUTOMATION_EVENT_TYPES)[number];

/**
 * How the engine links the created task:
 * - `self`: the trigger record (falls back to unlinked when it is closed/converted)
 * - `contact`: the contact named by the event (`lead.converted`, owner ruling 5)
 * - `none`: unlinked, the record named in the description (won/lost deals, accounts)
 */
export type TaskAutomationLinkMode = 'self' | 'contact' | 'none';

export interface TaskAutomationEventDefinition {
  readonly eventType: TaskAutomationEventType;
  readonly entity: TaskAutomationEntity;
  /** Key of the record id in the event's `toPayload()`. */
  readonly idField: 'leadId' | 'contactId' | 'opportunityId' | 'accountId';
  readonly label: string;
  /** Record state the drain requires before firing (rolled-back changes never fire). */
  readonly postcondition: {
    readonly field: 'status' | 'stage';
    readonly anyOf: readonly string[];
  } | null;
  readonly link: TaskAutomationLinkMode;
  /** Records created by a lead conversion never fire these rules (owner ruling 7). */
  readonly skipWhenConversionBorn: boolean;
}

const QUALIFIED_OR_LATER: readonly LeadStatus[] = ['QUALIFIED', 'NEGOTIATING', 'CONVERTED'];

export const TASK_AUTOMATION_EVENTS: readonly TaskAutomationEventDefinition[] = [
  {
    eventType: 'lead.created',
    entity: 'lead',
    idField: 'leadId',
    label: 'Lead created',
    postcondition: null,
    link: 'self',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'lead.qualified',
    entity: 'lead',
    idField: 'leadId',
    label: 'Lead qualified',
    postcondition: { field: 'status', anyOf: QUALIFIED_OR_LATER },
    link: 'self',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'lead.converted',
    entity: 'lead',
    idField: 'leadId',
    label: 'Lead converted',
    postcondition: { field: 'status', anyOf: ['CONVERTED'] },
    link: 'contact',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'contact.created',
    entity: 'contact',
    idField: 'contactId',
    label: 'Contact created',
    postcondition: null,
    link: 'self',
    skipWhenConversionBorn: true,
  },
  {
    eventType: 'opportunity.created',
    entity: 'opportunity',
    idField: 'opportunityId',
    label: 'Deal created',
    postcondition: null,
    link: 'self',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'opportunity.stage_changed',
    entity: 'opportunity',
    idField: 'opportunityId',
    label: 'Deal stage changed',
    postcondition: null,
    link: 'self',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'opportunity.won',
    entity: 'opportunity',
    idField: 'opportunityId',
    label: 'Deal won',
    // Deal events are published after OpportunityService saves (committed), so a
    // deal reopened before the tick must not cancel its won / lost rules.
    postcondition: null,
    link: 'none',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'opportunity.lost',
    entity: 'opportunity',
    idField: 'opportunityId',
    label: 'Deal lost',
    postcondition: null,
    link: 'none',
    skipWhenConversionBorn: false,
  },
  {
    eventType: 'account.created',
    entity: 'account',
    idField: 'accountId',
    label: 'Account created',
    postcondition: null,
    link: 'none',
    skipWhenConversionBorn: true,
  },
];

const EVENT_BY_TYPE = new Map(TASK_AUTOMATION_EVENTS.map((e) => [e.eventType, e]));

export function getTaskAutomationEvent(
  eventType: string
): TaskAutomationEventDefinition | undefined {
  return EVENT_BY_TYPE.get(eventType as TaskAutomationEventType);
}

/** Stages a "stage changed" filter may target; closing stages map to won/lost. */
export const TASK_AUTOMATION_OPEN_STAGES = [
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
] as const satisfies readonly OpportunityStage[];
export type TaskAutomationOpenStage = (typeof TASK_AUTOMATION_OPEN_STAGES)[number];

export function isTaskAutomationOpenStage(value: unknown): value is TaskAutomationOpenStage {
  return (TASK_AUTOMATION_OPEN_STAGES as readonly unknown[]).includes(value);
}

/**
 * The rule event an occurrence fires. A deal closed through a stage change emits
 * only `opportunity.stage_changed`, so a CLOSED_WON / CLOSED_LOST target is the
 * won / lost event (rules on stage changes never fire for closing stages).
 */
export function effectiveTaskAutomationEvent(
  eventType: string,
  newStage?: string | null
): TaskAutomationEventType | null {
  if (!EVENT_BY_TYPE.has(eventType as TaskAutomationEventType)) return null;
  if (eventType === 'opportunity.stage_changed') {
    if (newStage === 'CLOSED_WON') return 'opportunity.won';
    if (newStage === 'CLOSED_LOST') return 'opportunity.lost';
  }
  return eventType as TaskAutomationEventType;
}

export const TASK_AUTOMATION_RECORD_TYPE_LABELS: Record<TaskAutomationEntity, string> = {
  lead: 'Lead',
  contact: 'Contact',
  opportunity: 'Deal',
  account: 'Account',
};

/** Safe run outcome / error codes with plain-language labels (shown on the page). */
export const TASK_AUTOMATION_OUTCOMES = {
  task_created: 'Task created',
  pool_empty_fallback_owner:
    'No one in the round-robin group was available, so the owner got the task',
  link_fallback_unlinked: 'The record could not be linked, so the task names it instead',
  owner_fallback_creator:
    'The record owner is no longer a member, so the rule creator owns the task',
  covered_by_lead_conversion: 'Skipped: this record came from a lead conversion',
  no_eligible_owner: 'Skipped: neither the record owner nor the rule creator is still a member',
  assign_failed: 'Task created, but it could not be assigned',
  notify_failed: 'Task created, but the notification could not be sent',
  notify_filtered_by_preference:
    'Task created; the notification was muted by the recipient’s preferences',
  rule_inactive: 'Skipped: the rule is off',
  automation_disabled: 'Skipped: task automation is turned off',
  rate_capped: 'Skipped: the rule reached its hourly limit',
  record_missing: 'Skipped: the record no longer exists',
  invalid_schedule: 'The schedule is invalid, so the rule was turned off',
  interrupted: 'Interrupted before it finished',
  task_create_failed: 'The task could not be created',
  internal_error: 'Something went wrong',
} as const;
export type TaskAutomationOutcome = keyof typeof TASK_AUTOMATION_OUTCOMES;

export const TASK_AUTOMATION_LIMITS = {
  maxRulesPerTenant: 50,
  maxActionsPerRule: 3,
  maxNameLength: 80,
  maxDescriptionLength: 500,
  maxTags: 10,
  maxPoolSize: 25,
  maxNotifyRecipients: 10,
  titleMax: 200,
  descriptionMax: 2000,
  messageMax: 500,
  maxDueInDays: 365,
  minRunsPerRulePerHour: 1,
  maxRunsPerRulePerHour: 500,
  defaultRunsPerRulePerHour: 60,
  maxRunsPerTenantPerHour: 1000,
  webhookBodyMaxBytes: 65_536,
  webhookSkewSeconds: 300,
  webhookSecretGraceHours: 24,
  webhookPerMinuteCap: 60,
  webhookVarsMax: 20,
  webhookVarValueMax: 500,
  idempotencyKeyMax: 128,
  runBatchSize: 50,
  drainBatchSize: 500,
  eventBufferCap: 5000,
  missingRecordGraceMs: 30_000,
  conversionCorrelationMs: 600_000,
  staleRunMinutes: 10,
  runRetentionDays: 30,
  recentRunsShown: 20,
  dueDateFloorMinutes: 15,
} as const;

/** Rule CRUD for event and schedule rules, tags, settings (same set as the other module settings). */
export const TASK_AUTOMATION_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES;
/** Webhook secrets: create, rotate, regenerate (no MANAGER). */
export const TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES = ['ADMIN', 'OWNER', 'SUPER_ADMIN'] as const;

export function isTaskAutomationAdminRole(role: string | null | undefined): boolean {
  return (TASK_AUTOMATION_ADMIN_ROLES as readonly string[]).includes(role ?? '');
}

export function isTaskAutomationWebhookAdminRole(role: string | null | undefined): boolean {
  return (TASK_AUTOMATION_WEBHOOK_ADMIN_ROLES as readonly string[]).includes(role ?? '');
}

/** Webhook variable keys usable as `{{webhook.<key>}}`. */
export const TASK_AUTOMATION_WEBHOOK_KEY_PATTERN = /^[a-zA-Z]\w{0,39}$/;

export const TASK_AUTOMATION_TEMPLATE_TOKENS = [
  'record.name',
  'record.type',
  'record.owner',
  'record.url',
  'rule.name',
  'event.label',
  'stage.new',
  'schedule.date',
] as const;

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z]+(?:\.[a-zA-Z]\w*)?)\s*\}\}/g;
const KEPT_WHITESPACE = new Set([9, 10, 13]); // tab, newline, carriage return

/** Invisible or direction-changing ranges that can spoof a rendered title. */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x7f, 0x9f], // DEL and C1 controls
  [0x200b, 0x200f], // zero-width space/joiners, LRM / RLM
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
];

function isStripped(code: number): boolean {
  if (code < 32) return !KEPT_WHITESPACE.has(code);
  return INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to);
}

/** Drop C0 controls (except tab / newline / CR), DEL, C1, zero-width and bidi controls. */
function stripControlCharacters(value: string): string {
  let out = '';
  for (const char of value) {
    if (!isStripped(char.codePointAt(0) ?? 0)) out += char;
  }
  return out;
}

/**
 * Render a rule template as plain text. Only tokens present in `vars` are
 * substituted (a `Map`, so prototype keys such as `constructor` never resolve);
 * unknown tokens render empty; control characters are stripped; the result is
 * trimmed and truncated to `maxLength`.
 */
export function renderTaskTemplate(
  template: string,
  vars: ReadonlyMap<string, string>,
  maxLength: number
): string {
  const rendered = template.replace(
    TOKEN_PATTERN,
    (_match, token: string) => vars.get(token) ?? ''
  );
  return stripControlCharacters(rendered).trim().slice(0, maxLength);
}

/** Token keys referenced by templates, e.g. `webhook.orderId` → `orderId` for the webhook prefix. */
export function referencedTemplateKeys(templates: readonly string[], prefix: string): string[] {
  const keys = new Set<string>();
  for (const template of templates) {
    for (const match of template.matchAll(TOKEN_PATTERN)) {
      const [scope, key] = match[1].split('.');
      if (scope === prefix && key) keys.add(key);
    }
  }
  return [...keys];
}

/** Non-empty title fallback: `<event label> – <record type>`. */
export function fallbackTaskTitle(eventLabel: string, recordTypeLabel?: string): string {
  return recordTypeLabel ? `${eventLabel} – ${recordTypeLabel}` : eventLabel;
}

/** Lead display name: first + last name, else company, else "Lead" (never the email). */
export function leadDisplayName(lead: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}): string {
  const name = [lead.firstName, lead.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  if (name) return name;
  const company = lead.company?.trim();
  return company || 'Lead';
}

function zonedParts(at: Date, timeZone: string): Record<string, number> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of 23:59:59 local time, in `timeZone`, on the calendar day `days` after `now`'s day. */
export function endOfDayInTimeZone(now: Date, days: number, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const localEnd = Date.UTC(p.year, p.month - 1, p.day + days, 23, 59, 59);
  // Two passes settle the offset across a DST change on the target day.
  let instant = localEnd - zoneOffsetMs(new Date(localEnd), timeZone);
  instant = localEnd - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/**
 * Due date for an automation task: end of the day `dueInDays` after now in the
 * rule's timezone (schedule rules) or UTC, never earlier than now + 15 minutes
 * (TaskService rejects past due dates when it saves). `null` → no due date.
 */
export function computeAutomationDueDate(
  now: Date,
  dueInDays: number | null,
  timeZone = 'UTC'
): Date | null {
  if (dueInDays === null) return null;
  const end = endOfDayInTimeZone(now, dueInDays, timeZone);
  const floor = now.getTime() + TASK_AUTOMATION_LIMITS.dueDateFloorMinutes * 60_000;
  return new Date(Math.max(end.getTime(), floor));
}

/**
 * Round-robin pick: `eligible[(cursor - 1) mod n]`, where `cursor` is the value
 * read back after the atomic increment and `eligible` keeps the pool order the
 * admin chose (ineligible members already removed). Null for an empty list.
 */
export function pickRoundRobinAssignee(eligible: readonly string[], cursor: number): string | null {
  const n = eligible.length;
  if (n === 0) return null;
  return eligible[(((cursor - 1) % n) + n) % n];
}

// ---------------------------------------------------------------------------
// Duplicate-rule key
// ---------------------------------------------------------------------------

export type TaskAutomationTriggerShape =
  | {
      type: 'ENTITY_EVENT';
      eventType: string;
      filter?: { toStage?: string | null } | null;
    }
  | {
      type: 'SCHEDULE';
      cadence: string;
      dayOfWeek?: number | null;
      dayOfMonth?: number | null;
      timeOfDay?: string | null;
      cronExpression?: string | null;
      timezone: string;
    }
  | { type: 'WEBHOOK' };

export type TaskAutomationActionShape =
  | {
      type: 'CREATE_TASK';
      titleTemplate: string;
      descriptionTemplate?: string | null;
      priority: TaskPriority;
      dueInDays: number | null;
      linkToRecord: boolean;
    }
  | { type: 'ASSIGN_ROUND_ROBIN'; userIds: readonly string[] }
  | {
      type: 'NOTIFY';
      recipients: { assignee: boolean; owner: boolean; userIds: readonly string[] };
      message?: string | null;
    };

function normaliseAction(action: TaskAutomationActionShape): unknown {
  switch (action.type) {
    case 'CREATE_TASK':
      return [
        action.type,
        action.titleTemplate.trim(),
        (action.descriptionTemplate ?? '').trim(),
        action.priority,
        action.dueInDays,
        action.linkToRecord,
      ];
    case 'ASSIGN_ROUND_ROBIN':
      return [action.type, [...action.userIds]];
    case 'NOTIFY':
      return [
        action.type,
        action.recipients.assignee,
        action.recipients.owner,
        [...action.recipients.userIds].sort(),
        (action.message ?? '').trim(),
      ];
  }
}

function normaliseTrigger(trigger: TaskAutomationTriggerShape): unknown {
  if (trigger.type === 'ENTITY_EVENT') {
    return [trigger.type, trigger.eventType, trigger.filter?.toStage ?? null];
  }
  if (trigger.type === 'SCHEDULE') return normaliseSchedule(trigger);
  return [trigger.type];
}

/**
 * Only the fields that decide when the rule runs: a custom cadence is its cron;
 * a preset is its day (if the cadence has one) and time. A preset's derived
 * cron, or a stray day on a daily rule, never makes two identical rules differ.
 */
function normaliseSchedule(
  trigger: Extract<TaskAutomationTriggerShape, { type: 'SCHEDULE' }>
): unknown {
  const { cadence, timezone } = trigger;
  if (cadence === 'custom') {
    return [trigger.type, cadence, trigger.cronExpression?.trim() ?? null, timezone];
  }
  let day: number | null = null;
  if (cadence === 'weekly') day = trigger.dayOfWeek ?? null;
  else if (cadence === 'monthly' || cadence === 'quarterly') day = trigger.dayOfMonth ?? null;
  return [trigger.type, cadence, day, trigger.timeOfDay ?? null, timezone];
}

/**
 * Canonical string for "two rules that do the same thing": the trigger key plus
 * the normalised actions. `null` for webhook rules (each has its own URL, so
 * they are never duplicates). The API stores its SHA-256 as `ruleKey`.
 */
export function canonicalRuleKey(
  trigger: TaskAutomationTriggerShape,
  actions: readonly TaskAutomationActionShape[]
): string | null {
  if (trigger.type === 'WEBHOOK') return null;
  return JSON.stringify([normaliseTrigger(trigger), actions.map(normaliseAction)]);
}
