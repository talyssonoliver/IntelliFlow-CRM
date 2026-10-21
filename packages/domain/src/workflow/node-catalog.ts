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

/**
 * Canonical workflow flag values.
 *
 * Flags are short human-readable labels attached to a node's output (a
 * created task, an approval request, a notification) so downstream
 * automation and reports can group / route by intent. Values were chosen
 * to cover the most common CRM follow-up signals; the schema still
 * accepts free strings for forward-compat with bespoke labels but the
 * UI surfaces the canonical set as Select options first.
 */
export const WORKFLOW_FLAGS = [
  'needs_review',
  'urgent_follow_up',
  'high_value',
  'at_risk',
  'blocked',
  'archived',
] as const;
export type WorkflowFlag = (typeof WORKFLOW_FLAGS)[number];
/** Schema variant that ONLY accepts canonical flags. */
export const WorkflowFlagSchema = z.enum(WORKFLOW_FLAGS);

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
    triggerType: z.enum(['event', 'schedule', 'manual', 'webhook']).default('manual'),
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

/**
 * Custom action — points at a tenant-registered CustomActionHandler via
 * `customActionId`. The engine POSTs `params` (filtered by the handler's
 * `inputSchema`) to the handler's `endpointUrl`. See FU-012.
 */
export const ActionCustomConfigSchema = z
  .object({
    type: z.literal('action'),
    actionType: z.literal('custom'),
    customActionId: z.string().min(1),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const ActionConfigSchema = z.discriminatedUnion('actionType', [
  ActionNotifyConfigSchema,
  ActionCreateTaskConfigSchema,
  ActionUpdateFieldConfigSchema,
  ActionCallWebhookConfigSchema,
  ActionTriggerWorkflowConfigSchema,
  ActionLogConfigSchema,
  ActionCustomConfigSchema,
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

// ---------------------------------------------------------------------------
// Custom Node Types + Action Handlers (FU-011 / FU-012)
// ---------------------------------------------------------------------------

/**
 * Field descriptor — a declarative way to describe a form field without
 * committing to a runtime Zod shape. Stored in Prisma as JSONB and
 * reconstructed into a Zod schema at parse time via buildZodFromDescriptors.
 *
 * Kept intentionally narrow: only the primitives that can be safely rendered
 * by the generic form builder and round-tripped through JSON.
 */
export const FIELD_DESCRIPTOR_TYPES = ['string', 'number', 'boolean', 'entity', 'enum'] as const;
export type FieldDescriptorType = (typeof FIELD_DESCRIPTOR_TYPES)[number];

export const FieldDescriptorSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9_]*$/i, 'key must be a simple identifier'),
    label: z.string().min(1),
    type: z.enum(FIELD_DESCRIPTOR_TYPES),
    required: z.boolean().default(false),
    description: z.string().optional(),
    /** Required when type === 'enum' */
    enumValues: z.array(z.string().min(1)).optional(),
    /** Optional hint for type === 'entity' (narrows the picker). */
    entityKind: WorkflowEntityKindSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'enum' && (!v.enumValues || v.enumValues.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: "enumValues is required when type === 'enum'",
        path: ['enumValues'],
      });
    }
  });
export type FieldDescriptor = z.infer<typeof FieldDescriptorSchema>;

export const FieldDescriptorArraySchema = z.array(FieldDescriptorSchema);

/**
 * Rebuild a `z.object({...})` schema from a FieldDescriptor[] at runtime.
 *
 * The resulting schema is `.passthrough()` so unknown keys survive (matches
 * the rest of the node catalog). Each field is validated against its
 * descriptor type; unknown types fail closed.
 */
export function buildZodFromDescriptors(
  descriptors: readonly FieldDescriptor[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const d of descriptors) {
    let field: z.ZodTypeAny;
    switch (d.type) {
      case 'string':
        field = z.string();
        break;
      case 'number':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'entity':
        field = EntityRefSchema;
        break;
      case 'enum':
        if (!d.enumValues || d.enumValues.length === 0) {
          field = z.never();
        } else {
          field = z.enum([d.enumValues[0], ...d.enumValues.slice(1)] as [string, ...string[]]);
        }
        break;
      default:
        field = z.never();
    }
    shape[d.key] = d.required ? field : field.optional();
  }
  return z.object(shape).passthrough();
}

/**
 * Descriptor for a tenant-registered custom workflow node type. Mirrors
 * the Prisma `CustomNodeType` model shape (minus the db bookkeeping fields).
 */
export const CustomNodeTypeDescriptorSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  typeId: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*$/i, 'typeId must be a lowercase slug'),
  label: z.string().min(1),
  description: z.string().optional(),
  iconKey: z.string().default('extension'),
  accentClass: z.string().default('border-slate-500/60 bg-slate-500/5'),
  configSchema: FieldDescriptorArraySchema.default([]),
  isActive: z.boolean().default(true),
});
export type CustomNodeTypeDescriptor = z.infer<typeof CustomNodeTypeDescriptorSchema>;

/**
 * Descriptor for a tenant-registered custom action handler (webhook-based).
 */
export const CustomActionHandlerDescriptorSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  actionTypeId: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*$/i, 'actionTypeId must be a lowercase slug'),
  label: z.string().min(1),
  description: z.string().optional(),
  endpointUrl: z.string().url(),
  authHeader: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
  inputSchema: FieldDescriptorArraySchema.default([]),
  outputSchema: FieldDescriptorArraySchema.default([]),
  isActive: z.boolean().default(true),
});
export type CustomActionHandlerDescriptor = z.infer<typeof CustomActionHandlerDescriptorSchema>;

/** RBAC permission constants for admin-only custom-registry management. */
export const PERMISSION_MANAGE_CUSTOM_NODE_TYPES = 'workflow:manage_custom_node_types' as const;
export const PERMISSION_MANAGE_CUSTOM_ACTIONS = 'workflow:manage_custom_actions' as const;

/**
 * SSRF guard — reject URLs that target loopback, link-local, private, CGNAT,
 * multicast, or broadcast IP ranges. Webhook-based action handlers run from
 * the server so they MUST only hit public endpoints.
 *
 * NOTE — this is a static URL-string check only. A motivated attacker who
 * controls DNS for a hostname can still bypass this guard by returning a
 * private A/AAAA record at fetch time (DNS rebinding). The runtime fetch
 * path in `apps/api/src/workflow/dispatchers/custom-action-dispatcher.ts`
 * MUST also resolve the hostname and validate every returned address with
 * `isPublicIpAddress` before connecting.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // URL.hostname strips IPv6 brackets for some forms but not all; normalize.
  const rawHost = url.hostname.toLowerCase();
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '::' ||
    host.startsWith('::ffff:127.')
  ) {
    return false;
  }
  // If the host parses as an IP literal, run the same checks the runtime
  // will run on the resolved address. Otherwise the hostname is still a
  // bare DNS name — defer to runtime DNS-resolution validation.
  if (looksLikeIpLiteral(host) && !isPublicIpAddress(host)) return false;
  return true;
}

/** True if the host string parses as an IPv4 dotted-quad or IPv6 literal. */
function looksLikeIpLiteral(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
}

/**
 * Strict dotted-quad parser: four decimal octets 0-255, no leading zeros, no
 * hex/octal/integer shorthand (those forms are how SSRF filters get bypassed).
 */
function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** Parses an IPv6 literal (optionally bracketed, zone id stripped) into 16 bytes. */
function parseIpv6(raw: string): number[] | null {
  let host = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  const zone = host.indexOf('%');
  if (zone !== -1) host = host.slice(0, zone);
  if (!host.includes(':')) return null;

  // A trailing dotted IPv4 stands for the last two 16-bit groups.
  const lastColon = host.lastIndexOf(':');
  const lastPart = host.slice(lastColon + 1);
  if (lastPart.includes('.')) {
    const v4 = parseIpv4(lastPart);
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    host = `${host.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = host.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string): string[] => (s === '' ? [] : s.split(':'));
  const head = toGroups(halves[0] ?? '');
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  const explicit = head.length + rest.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null;

  const groups = [...head, ...Array<string>(8 - explicit).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

/** True when `bytes` starts with the first `bits` bits of `prefix`. */
function inPrefix(bytes: readonly number[], prefix: readonly number[], bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const byte = i >> 3;
    const mask = 0x80 >> (i & 7);
    if (((bytes[byte] ?? 0) & mask) !== ((prefix[byte] ?? 0) & mask)) return false;
  }
  return true;
}

/** IPv4 ranges that must never be connected to: private, loopback, link-local, shared, test, multicast, reserved. */
const PRIVATE_IPV4_CIDRS: ReadonlyArray<readonly [number[], number]> = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // RFC 1918
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local (cloud metadata)
  [[172, 16, 0, 0], 12], // RFC 1918
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 168, 0, 0], 16], // RFC 1918
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved + broadcast
];

function isPrivateIpv4Bytes(octets: readonly number[]): boolean {
  return PRIVATE_IPV4_CIDRS.some(([prefix, bits]) => inPrefix(octets, prefix, bits));
}

const V6 = (...groups: number[]): number[] =>
  groups.flatMap((g) => [g >> 8, g & 0xff]).concat(Array<number>(16 - groups.length * 2).fill(0));

/** IPv6 ranges refused outright (the embedded-IPv4 forms are unwrapped separately). */
const PRIVATE_IPV6_CIDRS: ReadonlyArray<readonly [number[], number]> = [
  [V6(0, 0, 0, 0, 0, 0), 96], // ::/96 — unspecified, loopback, IPv4-compatible
  [V6(0x100), 64], // discard-only
  [V6(0x2001, 0), 32], // Teredo (tunnels to arbitrary IPv4)
  [V6(0x2001, 0xdb8), 32], // documentation
  [V6(0xfc00), 7], // unique local
  [V6(0xfe80), 10], // link-local
  [V6(0xfec0), 10], // site-local (deprecated)
  [V6(0xff00), 8], // multicast
];

function isPrivateIpv6Bytes(bytes: readonly number[]): boolean {
  // IPv4-mapped ::ffff:0:0/96 and NAT64 64:ff9b::/96 carry an IPv4 in the last 4 bytes.
  if (inPrefix(bytes, V6(0, 0, 0, 0, 0, 0xffff), 96) || inPrefix(bytes, V6(0x64, 0xff9b), 96)) {
    return isPrivateIpv4Bytes(bytes.slice(12, 16));
  }
  // 6to4 2002::/16 carries an IPv4 in bytes 2-5.
  if (inPrefix(bytes, V6(0x2002), 16)) return isPrivateIpv4Bytes(bytes.slice(2, 6));
  return PRIVATE_IPV6_CIDRS.some(([prefix, bits]) => inPrefix(bytes, prefix, bits));
}

/**
 * True when the IP address is safe to connect to from the server. Mirrors
 * the URL-level `isPublicHttpUrl` guard but operates on a resolved IP
 * (string form). Use this in the runtime dispatcher AFTER DNS resolution
 * to defend against DNS-rebinding attacks.
 *
 * PG-207 (CA-4): the address is parsed into canonical bytes and checked
 * against CIDR tables, so hex/expanded/bracketed/zone-id IPv6 forms and the
 * IPv4-mapped, NAT64 and 6to4 encodings cannot slip a private IPv4 through.
 * Anything that does not parse as an IP address is refused.
 */
export function isPublicIpAddress(addr: string): boolean {
  const host = addr.trim().toLowerCase();
  const v4 = parseIpv4(host);
  if (v4) return !isPrivateIpv4Bytes(v4);
  const v6 = parseIpv6(host);
  if (v6) return !isPrivateIpv6Bytes(v6);
  return false;
}
