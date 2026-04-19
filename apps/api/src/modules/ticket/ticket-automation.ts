/**
 * Ticket Automation Enforcement - PG-185
 *
 * Loads a tenant's `TicketAutomationSetting` row and exposes helpers that
 * apply default-SLA selection, data hygiene, delete guards, and
 * notification gating to ticket create/update/delete/escalate flows and the
 * SLA watcher path.
 *
 * Policy rows are owned by the ticket-settings router; this module is the
 * runtime consumer that turns those preferences into actual behavior.
 *
 * Mirrors the contract of `contact-automation.ts` (PG-182).
 */

import type { TicketAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface TicketAutomationFlags {
  defaultSlaPolicyId: string | null;
  autoCloseIdleDays: number;
  autoCloseAppliesToWaitingCustomer: boolean;
  autoCloseAppliesToResolved: boolean;
  autoCloseNotifyCustomer: boolean;
  autoMergeOnExactContactSubject: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  normalizeSubjectCasing: boolean;
  trimDescriptionWhitespace: boolean;
  preventDeleteWithOpenChildren: boolean;
  notifyOnAssigneeChange: boolean;
  notifyOnSlaBreach: boolean;
  notifyOnSlaWarning: boolean;
  notifyOnStatusResolved: boolean;
  notifyOnEscalation: boolean;
  aiDuplicateDetection: boolean;
  aiAutoCategorization: boolean;
  aiSentimentAnalysis: boolean;
  aiNextStepRecommendation: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
}

export const AUTOMATION_FACTORY_DEFAULTS: TicketAutomationFlags = {
  defaultSlaPolicyId: null,
  autoCloseIdleDays: 7,
  autoCloseAppliesToWaitingCustomer: true,
  autoCloseAppliesToResolved: true,
  autoCloseNotifyCustomer: true,
  autoMergeOnExactContactSubject: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeSubjectCasing: true,
  trimDescriptionWhitespace: true,
  preventDeleteWithOpenChildren: true,
  notifyOnAssigneeChange: true,
  notifyOnSlaBreach: true, // preserves existing behavior for NULL-row tenants
  notifyOnSlaWarning: false,
  notifyOnStatusResolved: false,
  notifyOnEscalation: true,
  aiDuplicateDetection: false,
  aiAutoCategorization: false,
  aiSentimentAnalysis: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    ticketAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<TicketAutomationSetting | null>;
    };
    ticketRequiredField: {
      findMany(args: {
        where: { tenantId: string; isRequired: true };
      }): Promise<Array<{ fieldKey: string }>>;
    };
    sLAPolicy: {
      findFirst(args: {
        where: { tenantId: string; isDefault: true };
        select?: { id: true };
      }): Promise<{ id: string } | null>;
    };
  };
}

/**
 * Load the tenant's automation row, falling back to factory defaults when
 * no row has been seeded yet. Read-only — safe to call in hot paths.
 */
export async function loadTicketAutomation(ctx: HasTenantContext): Promise<TicketAutomationFlags> {
  const row = await ctx.prismaWithTenant.ticketAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });

  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };

  return {
    defaultSlaPolicyId: row.defaultSlaPolicyId,
    autoCloseIdleDays: row.autoCloseIdleDays,
    autoCloseAppliesToWaitingCustomer: row.autoCloseAppliesToWaitingCustomer,
    autoCloseAppliesToResolved: row.autoCloseAppliesToResolved,
    autoCloseNotifyCustomer: row.autoCloseNotifyCustomer,
    autoMergeOnExactContactSubject: row.autoMergeOnExactContactSubject,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    normalizeSubjectCasing: row.normalizeSubjectCasing,
    trimDescriptionWhitespace: row.trimDescriptionWhitespace,
    preventDeleteWithOpenChildren: row.preventDeleteWithOpenChildren,
    notifyOnAssigneeChange: row.notifyOnAssigneeChange,
    notifyOnSlaBreach: row.notifyOnSlaBreach,
    notifyOnSlaWarning: row.notifyOnSlaWarning,
    notifyOnStatusResolved: row.notifyOnStatusResolved,
    notifyOnEscalation: row.notifyOnEscalation,
    aiDuplicateDetection: row.aiDuplicateDetection,
    aiAutoCategorization: row.aiAutoCategorization,
    aiSentimentAnalysis: row.aiSentimentAnalysis,
    aiNextStepRecommendation: row.aiNextStepRecommendation,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
  };
}

/**
 * Resolve the tenant's effective default SLA policy id.
 * 1. If `automation.defaultSlaPolicyId` is non-null → return it.
 * 2. Otherwise fall back to the first `SLAPolicy` row where `isDefault=true`.
 * 3. Returns `null` if neither is set; caller decides how to handle.
 */
export async function resolveDefaultSlaPolicyId(
  ctx: HasTenantContext,
  flags: Pick<TicketAutomationFlags, 'defaultSlaPolicyId'>
): Promise<string | null> {
  if (flags.defaultSlaPolicyId) return flags.defaultSlaPolicyId;
  const fallback = await ctx.prismaWithTenant.sLAPolicy.findFirst({
    where: { tenantId: ctx.tenant.tenantId, isDefault: true },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

// ─── Hygiene transforms ─────────────────────────────────────────────────────

/**
 * Normalize a ticket subject — trim, collapse interior whitespace, and
 * capitalize the first letter when `normalizeSubjectCasing` is enabled.
 */
export function normalizeTicketSubject(
  raw: string | null | undefined,
  flags: Pick<TicketAutomationFlags, 'normalizeSubjectCasing'>
): string | null {
  if (!raw) return raw ?? null;
  if (!flags.normalizeSubjectCasing) return raw;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Trim leading/trailing whitespace on the ticket description when
 * `trimDescriptionWhitespace` is enabled.
 */
export function trimTicketDescription(
  raw: string | null | undefined,
  flags: Pick<TicketAutomationFlags, 'trimDescriptionWhitespace'>
): string | null {
  if (raw == null) return raw ?? null;
  if (!flags.trimDescriptionWhitespace) return raw;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

// ─── Duplicate-on-create guard ──────────────────────────────────────────────

export interface TicketCreateLikeInput {
  subject: string;
  contactEmail: string;
}

export interface TicketDuplicateCandidate {
  id: string;
  subject: string;
  contactEmail: string;
}

export type CreateOrMergeAction =
  | { action: 'CREATE'; duplicates: TicketDuplicateCandidate[] }
  | { action: 'MERGE'; targetId: string };

/**
 * When `autoMergeOnExactContactSubject` is TRUE and an exact (contactEmail,
 * subject) match exists among recent tickets, return `{ action: 'MERGE',
 * targetId }` so the router short-circuits to returning the existing
 * ticket id instead of creating a new one.
 *
 * When the flag is FALSE (default) OR no match exists, return
 * `{ action: 'CREATE', duplicates }` with any soft matches so the router
 * can emit `notifyTicketDuplicate` when `notifyOnDuplicate` is on.
 *
 * The candidate list is caller-supplied; this helper is side-effect-free
 * to stay easy to unit-test.
 */
export function assertCanCreateTicketOrMerge(
  input: TicketCreateLikeInput,
  candidates: TicketDuplicateCandidate[],
  flags: Pick<TicketAutomationFlags, 'autoMergeOnExactContactSubject'>
): CreateOrMergeAction {
  if (!flags.autoMergeOnExactContactSubject || candidates.length === 0) {
    return { action: 'CREATE', duplicates: candidates };
  }
  const exact = candidates.find(
    (c) =>
      c.contactEmail.toLowerCase() === input.contactEmail.toLowerCase() &&
      c.subject.trim() === input.subject.trim()
  );
  if (exact) return { action: 'MERGE', targetId: exact.id };
  return { action: 'CREATE', duplicates: candidates };
}

// ─── Delete-guard ───────────────────────────────────────────────────────────

export interface TicketChildCounts {
  openRelatedTickets: number;
  openActivities: number;
}

/**
 * Throw PRECONDITION_FAILED when the tenant has
 * `preventDeleteWithOpenChildren` enabled AND the ticket has any open
 * children (related tickets or activities).
 */
export function assertCanDeleteTicket(
  counts: TicketChildCounts,
  flags: Pick<TicketAutomationFlags, 'preventDeleteWithOpenChildren'>
): void {
  if (!flags.preventDeleteWithOpenChildren) return;
  const total = counts.openRelatedTickets + counts.openActivities;
  if (total === 0) return;

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Ticket has ${total} open child record(s). Disable "Prevent delete with open children" in Ticket Settings, close the children, or detach them first.`,
  });
}

// ─── Admin-only tag creation ────────────────────────────────────────────────

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Enforce the `restrictTagCreationToAdmins` toggle on the
 * ticketSettings.tags.create procedure.
 */
export function assertCanCreateTag(
  ctx: UserRoleContext,
  flags: Pick<TicketAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin to create the tag or disable "Restrict tag creation to admins" in Ticket Settings.',
  });
}

// ─── Notification helpers ───────────────────────────────────────────────────

type TicketNotificationType =
  | 'ticket_reassigned'
  | 'ticket_resolved'
  | 'ticket_escalated'
  | 'ticket_duplicate_suspected'
  | 'ticket_auto_closed';

type NotificationCreator = (args: {
  userId: string;
  tenantId: string;
  type: TicketNotificationType;
  title: string;
  body: string;
  priority?: 'high' | 'normal' | 'low';
  entityType?: string;
  entityId?: string;
  entityName?: string;
  actionUrl?: string;
}) => Promise<unknown>;

export interface TicketIdentity {
  tenantId: string;
  ticketId: string;
  ticketNumber: string;
  subject: string;
  actingUserId: string;
}

/**
 * Emit `ticket_reassigned` notifications to both the previous and the
 * next assignee when `notifyOnAssigneeChange` is on. Either side can be
 * null (unassigned) — a null userId is skipped.
 */
export async function notifyTicketReassignment(
  args: TicketIdentity & {
    previousAssigneeId: string | null;
    nextAssigneeId: string | null;
  },
  flags: Pick<TicketAutomationFlags, 'notifyOnAssigneeChange'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnAssigneeChange) return;
  if (args.previousAssigneeId === args.nextAssigneeId) return;

  const common = {
    tenantId: args.tenantId,
    type: 'ticket_reassigned' as const,
    entityType: 'ticket',
    entityId: args.ticketId,
    entityName: args.ticketNumber,
    actionUrl: `/tickets/${args.ticketId}`,
    priority: 'normal' as const,
  };

  const tasks: Promise<unknown>[] = [];
  if (args.previousAssigneeId) {
    tasks.push(
      createNotification({
        ...common,
        userId: args.previousAssigneeId,
        title: `Ticket reassigned: ${args.ticketNumber}`,
        body: `You are no longer the assignee of ${args.ticketNumber} — ${args.subject}.`,
      })
    );
  }
  if (args.nextAssigneeId) {
    tasks.push(
      createNotification({
        ...common,
        userId: args.nextAssigneeId,
        title: `Ticket assigned to you: ${args.ticketNumber}`,
        body: `You now own ${args.ticketNumber} — ${args.subject}.`,
      })
    );
  }
  await Promise.all(tasks);
}

/**
 * Emit `ticket_resolved` notification to the original reporter / watcher
 * list when `notifyOnStatusResolved` is on.
 */
export async function notifyTicketResolved(
  args: TicketIdentity & { reporterUserId: string | null },
  flags: Pick<TicketAutomationFlags, 'notifyOnStatusResolved'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnStatusResolved) return;
  if (!args.reporterUserId) return;

  await createNotification({
    userId: args.reporterUserId,
    tenantId: args.tenantId,
    type: 'ticket_resolved',
    title: `Ticket resolved: ${args.ticketNumber}`,
    body: `${args.ticketNumber} — ${args.subject} has been marked resolved.`,
    priority: 'normal',
    entityType: 'ticket',
    entityId: args.ticketId,
    entityName: args.ticketNumber,
    actionUrl: `/tickets/${args.ticketId}`,
  });
}

/**
 * Emit existing `ticket_escalated` notification (type already present in
 * NOTIFICATION_TYPES) when `notifyOnEscalation` is on.
 */
export async function notifyTicketEscalated(
  args: TicketIdentity & { recipientUserIds: string[] },
  flags: Pick<TicketAutomationFlags, 'notifyOnEscalation'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnEscalation) return;
  if (args.recipientUserIds.length === 0) return;

  await Promise.all(
    args.recipientUserIds.map((userId) =>
      createNotification({
        userId,
        tenantId: args.tenantId,
        type: 'ticket_escalated',
        title: `Ticket escalated: ${args.ticketNumber}`,
        body: `${args.ticketNumber} — ${args.subject} has been escalated.`,
        priority: 'high',
        entityType: 'ticket',
        entityId: args.ticketId,
        entityName: args.ticketNumber,
        actionUrl: `/tickets/${args.ticketId}`,
      })
    )
  );
}

/**
 * Emit `ticket_duplicate_suspected` notification when a new-ticket path
 * detects duplicates AND `notifyOnDuplicate` is on.
 */
export async function notifyTicketDuplicate(
  args: TicketIdentity & {
    reporterUserId: string | null;
    duplicates: TicketDuplicateCandidate[];
  },
  flags: Pick<TicketAutomationFlags, 'notifyOnDuplicate'>,
  createNotification: NotificationCreator
): Promise<void> {
  if (!flags.notifyOnDuplicate) return;
  if (!args.reporterUserId) return;
  if (args.duplicates.length === 0) return;

  await createNotification({
    userId: args.reporterUserId,
    tenantId: args.tenantId,
    type: 'ticket_duplicate_suspected',
    title: `Possible duplicate: ${args.ticketNumber}`,
    body: `Found ${args.duplicates.length} similar ticket(s). Review before closing.`,
    priority: 'normal',
    entityType: 'ticket',
    entityId: args.ticketId,
    entityName: args.ticketNumber,
    actionUrl: `/tickets/${args.ticketId}`,
  });
}

// ─── SLA notification gates ─────────────────────────────────────────────────

/**
 * Gate the existing `SLANotification` write on `notifyOnSlaBreach`. Default
 * TRUE so NULL-row tenants preserve current behavior.
 *
 * Caller is the existing SLA watcher path in `ticket.router.ts` (or
 * `ticket.service.ts`). This helper is a pure predicate; the watcher
 * still performs the actual DB insert.
 */
export function shouldWriteSlaBreachNotification(
  flags: Pick<TicketAutomationFlags, 'notifyOnSlaBreach'>
): boolean {
  return flags.notifyOnSlaBreach;
}

export function shouldWriteSlaWarningNotification(
  flags: Pick<TicketAutomationFlags, 'notifyOnSlaWarning'>
): boolean {
  return flags.notifyOnSlaWarning;
}

// ─── Required-fields enforcement (parity with contact-automation) ──────────

export type TicketFieldKey =
  | 'subject'
  | 'description'
  | 'contactEmail'
  | 'contactName'
  | 'priority'
  | 'category'
  | 'slaPolicy';

export interface TicketRequiredFieldPayload {
  subject?: string | null | undefined;
  description?: string | null | undefined;
  contactEmail?: string | null | undefined;
  contactName?: string | null | undefined;
  priority?: string | null | undefined;
  category?: string | null | undefined;
  slaPolicy?: string | null | undefined;
}

export async function loadRequiredTicketFields(
  ctx: HasTenantContext
): Promise<Set<TicketFieldKey>> {
  const rows =
    (await ctx.prismaWithTenant.ticketRequiredField.findMany({
      where: { tenantId: ctx.tenant.tenantId, isRequired: true },
    })) ?? [];
  const whitelist = new Set<TicketFieldKey>([
    'subject',
    'description',
    'contactEmail',
    'contactName',
    'priority',
    'category',
    'slaPolicy',
  ]);
  return new Set(
    rows
      .map((r) => r.fieldKey as TicketFieldKey)
      .filter((k): k is TicketFieldKey => whitelist.has(k))
  );
}

function isMissing(value: string | null | undefined): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

export function assertRequiredTicketFields(
  payload: TicketRequiredFieldPayload,
  required: Set<TicketFieldKey>,
  mode: 'create' | 'update'
): void {
  const missing: TicketFieldKey[] = [];
  for (const field of required) {
    const value = payload[field];
    if (mode === 'create') {
      if (isMissing(value)) missing.push(field);
      continue;
    }
    const hasOwn = Object.prototype.hasOwnProperty.call(payload, field);
    if (!hasOwn) continue;
    if (value === undefined) continue;
    if (isMissing(value)) missing.push(field);
  }
  if (missing.length === 0) return;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Required field(s) missing per tenant policy: ${missing.join(', ')}. Update the ticket, or relax the policy in Ticket Settings → Required Fields.`,
  });
}
