/**
 * Workflow Node Catalog
 *
 * Single source of truth for the node types supported by the workflow
 * builder. Lives in the domain package so BOTH the tRPC router (server)
 * AND the React components (client) validate / render from the same spec.
 *
 * Rules (per `packages/domain/CLAUDE.md`):
 *   • No React imports — renderers live in `apps/web/.../node-registry.tsx`
 *   • No infra imports — pure TS + zod
 *   • Adding a node type MUST be a single change here plus one form file
 *     on the web side (see apps/web/src/components/workflows/config-forms/)
 *
 * The schemas defined here are intentionally permissive so Phase E can
 * extend them with CRM-aware fields (entity pickers, priority, flag,
 * interpolation) without a breaking migration of stored workflows. Every
 * variant uses `.passthrough()` on the `config` object — unknown fields
 * are preserved rather than rejected.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Node type identifiers
// ---------------------------------------------------------------------------

export const NODE_TYPE_IDS = ['start', 'action', 'decision', 'human', 'end'] as const;
export type NodeTypeId = (typeof NODE_TYPE_IDS)[number];

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Priority aligned with TaskPriority / CasePriority in the rest of the domain. */
export const WORKFLOW_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type WorkflowPriority = (typeof WORKFLOW_PRIORITIES)[number];
export const WorkflowPrioritySchema = z.enum(WORKFLOW_PRIORITIES);

/** CRM entity kinds a workflow node can reference. */
export const WORKFLOW_ENTITY_KINDS = [
  'lead',
  'contact',
  'account',
  'deal',
  'case',
  'task',
  'user',
  'team',
] as const;
export type WorkflowEntityKind = (typeof WORKFLOW_ENTITY_KINDS)[number];
export const WorkflowEntityKindSchema = z.enum(WORKFLOW_ENTITY_KINDS);

/** A reference to a record of a specific entity kind (id comes from that domain's router). */
export const EntityRefSchema = z.object({
  kind: WorkflowEntityKindSchema,
  id: z.string().min(1),
  /** Optional display name — useful for rendering cached labels in the UI. */
  label: z.string().optional(),
});
export type EntityRef = z.infer<typeof EntityRefSchema>;

// ---------------------------------------------------------------------------
// Per-type config schemas
// ---------------------------------------------------------------------------

/**
 * Start node — defines what triggers the workflow.
 *
 *   triggerType = 'event'    → fires when an event on the bound entity occurs
 *                              (e.g. new Lead, Case status change)
 *   triggerType = 'schedule' → fires on a cron schedule
 *   triggerType = 'manual'   → fires when invoked by a user / API call
 *   triggerType = 'webhook'  → fires on inbound webhook
 *
 * The bound entity kind (lead, case, etc.) scopes the variable
 * context available downstream via interpolation `{{trigger.<field>}}`.
 */
export const StartConfigSchema = z
  .object({
    type: z.literal('start'),
    triggerType: z
      .enum(['event', 'schedule', 'manual', 'webhook'])
      .default('manual'),
    triggerEntity: WorkflowEntityKindSchema.optional(),
    /** Cron string — required when triggerType === 'schedule' */
    schedule: z.string().optional(),
    /** Event name — required when triggerType === 'event' */
    eventName: z.string().optional(),
  })
  .passthrough();
export type StartConfig = z.infer<typeof StartConfigSchema>;

/**
 * Action node — performs an operation.
 *
 * Split into a discriminated union on `actionType` so each action has
 * only the fields it actually needs.
 */
/**
 * Notify action.
 *
 * `actionType: 'send_notification'` is the wire / persistence name
 * (aligned with `packages/platform` rules engine and the `workflow-types`
 * ActionType union). `'notify'` is accepted as an alias so new UI code can
 * use the shorter name without breaking existing saved workflows.
 */
export const ActionNotifyConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.union([z.literal('send_notification'), z.literal('notify')]),
    recipients: z.array(EntityRefSchema).default([]),
    priority: WorkflowPrioritySchema.optional(),
    /** Free-text body — supports {{trigger.field}} interpolation tokens. */
    message: z.string().default(''),
  })
  .passthrough();

export const ActionCreateTaskConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.literal('create_task'),
    title: z.string().default(''),
    description: z.string().default(''),
    assignee: EntityRefSchema.optional(),
    linkedEntity: EntityRefSchema.optional(),
    priority: WorkflowPrioritySchema.optional(),
    /** Optional flag label (e.g. "flagged", "needs-review"). */
    flag: z.string().optional(),
    dueInHours: z.number().int().positive().optional(),
  })
  .passthrough();

export const ActionUpdateFieldConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.literal('update_field'),
    target: EntityRefSchema.optional(),
    fieldName: z.string().default(''),
    newValue: z.string().default(''),
  })
  .passthrough();

export const ActionCallWebhookConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.literal('call_webhook'),
    url: z.string().url().or(z.literal('')).default(''),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
    /** Raw body — interpolation tokens allowed. */
    body: z.string().default(''),
  })
  .passthrough();

export const ActionTriggerWorkflowConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.literal('trigger_workflow'),
    workflowId: z.string().optional(),
  })
  .passthrough();

/**
 * Log action. `log_event` is the persisted name; `log` is the short alias.
 */
export const ActionLogConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.union([z.literal('log_event'), z.literal('log')]),
    target: EntityRefSchema.optional(),
    message: z.string().default(''),
  })
  .passthrough();

export const ActionConfigSchema = z.discriminatedUnion('actionType', [
  ActionNotifyConfigSchema,
  ActionCreateTaskConfigSchema,
  ActionUpdateFieldConfigSchema,
  ActionCallWebhookConfigSchema,
  ActionTriggerWorkflowConfigSchema,
  ActionLogConfigSchema,
]);
export type ActionConfig = z.infer<typeof ActionConfigSchema>;
/**
 * Canonical action-type identifiers.
 *
 * The `send_notification` / `log_event` forms are the on-the-wire names
 * (matching `packages/platform` and legacy saved workflows). The shorter
 * aliases (`notify` / `log`) are accepted by the schemas but new UI code
 * should emit the canonical form.
 */
export const ACTION_TYPES = [
  'send_notification',
  'create_task',
  'update_field',
  'call_webhook',
  'trigger_workflow',
  'log_event',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * Decision node — branches based on structured conditions.
 *
 * Conditions are structured (field/op/value) so the engine can evaluate
 * them without running arbitrary code. The UI in Phase E will use this
 * shape directly.
 */
export const DecisionOperators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] as const;
export type DecisionOperator = (typeof DecisionOperators)[number];
export const DecisionConditionSchema = z.object({
  field: z.string(),
  op: z.enum(DecisionOperators),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export const DecisionConfigSchema = z
  .object({
    type: z.literal('decision'),
    combinator: z.enum(['AND', 'OR', 'NOT']).default('AND'),
    conditions: z.array(DecisionConditionSchema).default([]),
  })
  .passthrough();
export type DecisionConfig = z.infer<typeof DecisionConfigSchema>;

/**
 * Human node — waits for approval.
 */
export const HumanConfigSchema = z
  .object({
    type: z.literal('human'),
    approvers: z.array(EntityRefSchema).default([]),
    priority: WorkflowPrioritySchema.optional(),
    /** Instructions shown to approvers — interpolation allowed. */
    instructions: z.string().default(''),
    /** Optional deadline in hours from node entry. */
    deadlineInHours: z.number().int().positive().optional(),
  })
  .passthrough();
export type HumanConfig = z.infer<typeof HumanConfigSchema>;

/**
 * End node — terminates a branch with an optional completion status.
 */
export const EndConfigSchema = z
  .object({
    type: z.literal('end'),
    completionStatus: z.string().optional(),
  })
  .passthrough();
export type EndConfig = z.infer<typeof EndConfigSchema>;

// ---------------------------------------------------------------------------
// Root schema — discriminated union by `type`
// ---------------------------------------------------------------------------

export const WorkflowNodeConfigSchema = z.discriminatedUnion('type', [
  StartConfigSchema,
  // Per action-variant entries are nested via ActionConfigSchema below; we
  // union via a wrapper that matches on `type: 'action'` and delegates to
  // the inner actionType discriminator at parse time.
  z
    .object({ type: z.literal('action') })
    .passthrough()
    .superRefine((val, ctx) => {
      const parsed = ActionConfigSchema.safeParse(val);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          // Re-emit each inner issue with a `custom` code so the outer
          // discriminated-union parse surfaces it cleanly. Zod 4's strict
          // issue types make direct forwarding awkward; a custom wrapper
          // preserves the message + path without type gymnastics.
          ctx.addIssue({
            code: 'custom',
            message: issue.message,
            path: issue.path,
          });
        }
      }
    }),
  DecisionConfigSchema,
  HumanConfigSchema,
  EndConfigSchema,
]);
export type WorkflowNodeConfig = z.infer<typeof WorkflowNodeConfigSchema>;

// ---------------------------------------------------------------------------
// Display metadata — label + description + icon key for palette and renderer
// ---------------------------------------------------------------------------

export interface NodeDisplayMeta {
  /** Short label shown on the node and palette */
  label: string;
  /** One-liner shown in the palette tooltip */
  description: string;
  /** Material Symbols icon name (matches existing PALETTE_ITEMS convention) */
  iconKey: string;
  /** Lucide icon name (for the new toolbar / config-form headers) */
  lucideIcon: string;
  /** Tailwind color token used for the rendered node border / accent */
  accentClass: string;
}

export const NODE_DISPLAY_META: Record<NodeTypeId, NodeDisplayMeta> = {
  start: {
    label: 'Start',
    description: 'Trigger that begins the workflow',
    iconKey: 'play_arrow',
    lucideIcon: 'Play',
    accentClass: 'border-emerald-500/60 bg-emerald-500/5',
  },
  action: {
    label: 'Action',
    description: 'Perform an automated action',
    iconKey: 'bolt',
    lucideIcon: 'Zap',
    accentClass: 'border-sky-500/60 bg-sky-500/5',
  },
  decision: {
    label: 'Decision',
    description: 'Branch based on conditions',
    iconKey: 'alt_route',
    lucideIcon: 'GitBranch',
    accentClass: 'border-amber-500/60 bg-amber-500/5',
  },
  human: {
    label: 'Human',
    description: 'Wait for manual human approval',
    iconKey: 'person',
    lucideIcon: 'UserCheck',
    accentClass: 'border-violet-500/60 bg-violet-500/5',
  },
  end: {
    label: 'End',
    description: 'Terminal node — workflow completes here',
    iconKey: 'stop_circle',
    lucideIcon: 'CircleStop',
    accentClass: 'border-rose-500/60 bg-rose-500/5',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default config payload for a freshly-dropped node of `type`. */
export function defaultConfigForType(type: NodeTypeId): WorkflowNodeConfig {
  switch (type) {
    case 'start':
      return { type: 'start', triggerType: 'manual' } as StartConfig;
    case 'action':
      return {
        type: 'action',
        actionType: 'send_notification',
        recipients: [],
        message: '',
      } as ActionConfig;
    case 'decision':
      return { type: 'decision', combinator: 'AND', conditions: [] } as DecisionConfig;
    case 'human':
      return { type: 'human', approvers: [], instructions: '' } as HumanConfig;
    case 'end':
      return { type: 'end' } as EndConfig;
  }
}

/** True if the string is a registered node type — use as a type guard. */
export function isNodeTypeId(v: string): v is NodeTypeId {
  return (NODE_TYPE_IDS as readonly string[]).includes(v);
}
