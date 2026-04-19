/**
 * Deal Automation Enforcement - PG-184
 *
 * Loads a tenant's `DealAutomationSetting` row and exposes helpers that
 * apply the hygiene and guard toggles to Opportunity (deal) create/update/
 * delete flows. Policy rows are owned by the deal-settings router; this
 * module is the runtime consumer that turns those preferences into actual
 * behavior.
 *
 * Mirrors the shape of apps/api/src/modules/contact/contact-automation.ts.
 *
 * Category-1 toggles (wired in this task):
 *   - autoMergeOnExactNameAccount → assertCanCreateDealOrMerge
 *   - notifyOnDuplicate           → notifyDealDuplicate
 *   - restrictTagCreationToAdmins → assertCanCreateTag
 *   - normalizeCurrency           → normalizeDealValue
 *   - autoCapitalizeDealNames     → capitalizeDealName
 *   - preventDeleteWithOpenTasks  → assertCanDeleteDeal
 *   - notifyOnOwnerChange         → notifyDealReassignment
 *   - notifyOnStageChange         → notifyDealStageChange
 *   - notifyOnHighValueStageMove  → notifyHighValueStageMove
 *   - highValueThreshold          → consumed by notifyHighValueStageMove
 *
 * Category-2 toggles (follow-ups on IFC-312) read the flag for UI display
 * only; the AI chains themselves are out of scope for PG-184.
 */

import type { DealAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface DealAutomationFlags {
  autoMergeOnExactNameAccount: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  normalizeCurrency: boolean;
  autoCapitalizeDealNames: boolean;
  preventDeleteWithOpenTasks: boolean;
  notifyOnOwnerChange: boolean;
  notifyOnStageChange: boolean;
  notifyOnHighValueStageMove: boolean;
  highValueThreshold: number;
  aiDuplicateDetection: boolean;
  aiDealScoring: boolean;
  aiNextStepRecommendation: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
  aiWinLossPrediction: boolean;
}

export const AUTOMATION_FACTORY_DEFAULTS: DealAutomationFlags = {
  autoMergeOnExactNameAccount: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeCurrency: true,
  autoCapitalizeDealNames: true,
  preventDeleteWithOpenTasks: true,
  notifyOnOwnerChange: false,
  notifyOnStageChange: false,
  notifyOnHighValueStageMove: false,
  highValueThreshold: 50000,
  aiDuplicateDetection: false,
  aiDealScoring: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiWinLossPrediction: false,
};

// Intentionally loose — the real ctx is the full BaseContext (PrismaClient +
// services). This module only cares that three tables exist and expose the
// methods we call. We use `any` on the Prisma surface to avoid a structural
// clash between the generated Prisma types (where Task.status is a strict
// enum) and the test mocks (plain vi.fn()). The actual type safety comes
// from the generated Prisma client at call-sites in consumers — this
// interface is an ergonomic bound, not a shape guarantee.
export interface HasTenantContext {
  tenant: { tenantId: string };
  user?: { role?: string | null | undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaWithTenant: any;
}

/**
 * Load the tenant's automation row, falling back to factory defaults when
 * no row has been seeded yet. Read-only; safe to call in hot paths.
 */
export async function loadDealAutomation(ctx: HasTenantContext): Promise<DealAutomationFlags> {
  const row = await ctx.prismaWithTenant.dealAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });

  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };

  // Decimal → number conversion (Prisma returns Decimal for numeric columns).
  const threshold =
    typeof row.highValueThreshold === 'number'
      ? row.highValueThreshold
      : Number((row.highValueThreshold as unknown as { toString(): string }).toString());

  return {
    autoMergeOnExactNameAccount: row.autoMergeOnExactNameAccount,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    normalizeCurrency: row.normalizeCurrency,
    autoCapitalizeDealNames: row.autoCapitalizeDealNames,
    preventDeleteWithOpenTasks: row.preventDeleteWithOpenTasks,
    notifyOnOwnerChange: row.notifyOnOwnerChange,
    notifyOnStageChange: row.notifyOnStageChange,
    notifyOnHighValueStageMove: row.notifyOnHighValueStageMove,
    highValueThreshold: threshold,
    aiDuplicateDetection: row.aiDuplicateDetection,
    aiDealScoring: row.aiDealScoring,
    aiNextStepRecommendation: row.aiNextStepRecommendation,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
    aiWinLossPrediction: row.aiWinLossPrediction,
  };
}

// ─── Hygiene transforms ─────────────────────────────────────────────────────

/**
 * Title-case a deal name on whitespace-separated word boundaries. Keeps
 * punctuation like "ACME Co.'s Renewal" intact after title-casing each
 * alphabetic word.
 */
export function capitalizeDealName(
  raw: string | null | undefined,
  flags: Pick<DealAutomationFlags, 'autoCapitalizeDealNames'>
): string | null | undefined {
  if (raw == null) return raw;
  if (!flags.autoCapitalizeDealNames) return raw;

  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/(\s+)/)
    .map((chunk) => {
      if (!chunk || /^\s+$/.test(chunk)) return chunk;
      return chunk
        .split(/(['-])/)
        .map((sub) =>
          sub.length > 0 && /[a-zA-Z]/.test(sub[0])
            ? sub[0].toUpperCase() + sub.slice(1).toLowerCase()
            : sub
        )
        .join('');
    })
    .join('');
}

/**
 * Round a deal value to 2 decimal places when `normalizeCurrency` is on.
 * Accepts any numeric-ish input; returns the raw value unchanged when the
 * toggle is off or the input is not finite.
 */
export function normalizeDealValue(
  raw: number | string | null | undefined,
  flags: Pick<DealAutomationFlags, 'normalizeCurrency'>
): number | string | null | undefined {
  if (raw == null) return raw;
  if (!flags.normalizeCurrency) return raw;

  const asNumber = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(asNumber)) return raw;

  // Round half-away-from-zero to 2 decimals. Avoids floating-point drift
  // by multiplying first.
  const rounded = Math.round(asNumber * 100) / 100;
  return typeof raw === 'number' ? rounded : rounded.toFixed(2);
}

// ─── Delete-guard ───────────────────────────────────────────────────────────

interface OpenTaskCount {
  openTasks: number;
}

/**
 * Throw PRECONDITION_FAILED if the tenant has `preventDeleteWithOpenTasks`
 * enabled and the deal has ≥1 open task. Caller is responsible for
 * producing the open-task count (so this helper is not coupled to a Prisma
 * shape outside the test mock).
 */
export function assertCanDeleteDeal(
  counts: OpenTaskCount,
  flags: Pick<DealAutomationFlags, 'preventDeleteWithOpenTasks'>
): void {
  if (!flags.preventDeleteWithOpenTasks) return;
  if (counts.openTasks === 0) return;

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Deal has ${counts.openTasks} open task(s). Close them or disable "Prevent delete with open tasks" in Deal Settings.`,
  });
}

// ─── Merge-or-create for duplicate detection ───────────────────────────────

export interface DealCreatePayload {
  name: string;
  accountId: string;
  value?: number | string | null | undefined;
}

export type DealMergeDecision =
  | { action: 'CREATE'; duplicateId: null }
  | { action: 'MERGE'; duplicateId: string };

/**
 * When `autoMergeOnExactNameAccount` is on, look up any existing deal with
 * the exact same (name, accountId, tenantId) and return a MERGE decision.
 * Otherwise return CREATE. The router is responsible for performing the
 * merge write or returning the duplicate id to the caller.
 */
export async function assertCanCreateDealOrMerge(
  ctx: HasTenantContext,
  payload: DealCreatePayload,
  flags: Pick<DealAutomationFlags, 'autoMergeOnExactNameAccount'>
): Promise<DealMergeDecision> {
  if (!flags.autoMergeOnExactNameAccount) {
    return { action: 'CREATE', duplicateId: null };
  }

  const dup = await ctx.prismaWithTenant.opportunity.findFirst({
    where: {
      tenantId: ctx.tenant.tenantId,
      name: payload.name,
      accountId: payload.accountId,
    },
  });

  return dup ? { action: 'MERGE', duplicateId: dup.id } : { action: 'CREATE', duplicateId: null };
}

// ─── Admin-only tag creation ────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['ADMIN', 'OWNER', 'SUPER_ADMIN']);

/**
 * Throw FORBIDDEN when the tenant has `restrictTagCreationToAdmins` on AND
 * the caller is not in an admin-equivalent role.
 */
export function assertCanCreateTag(
  callerRole: string | null | undefined,
  flags: Pick<DealAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  if (callerRole && ADMIN_ROLES.has(callerRole)) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to administrators. Ask an admin or disable "Restrict tag creation to admins" in Deal Settings.',
  });
}

// ─── Notification payloads ──────────────────────────────────────────────────

export interface NotifyDealReassignmentInput {
  opportunityId: string;
  previousOwnerId: string;
  newOwnerId: string;
  actorId: string;
}

export interface NotifyDealStageChangeInput {
  opportunityId: string;
  ownerId: string;
  fromStage: string;
  toStage: string;
  actorId: string;
}

export interface NotifyHighValueStageMoveInput extends NotifyDealStageChangeInput {
  value: number;
  threshold: number;
}

export interface NotifyDealDuplicateInput {
  opportunityId: string;
  duplicateOpportunityId: string;
  ownerId: string;
  actorId: string;
}

/**
 * Minimal surface notifier these helpers need. Injecting the notifier keeps
 * this module easy to unit-test without bringing in the real Notification
 * service at test time.
 */
export interface DealNotifier {
  send(input: {
    type:
      | 'deal_reassigned'
      | 'deal_stage_changed'
      | 'deal_high_value_moved'
      | 'deal_duplicate_suspected';
    toUserIds: string[];
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Emit `deal_reassigned` to the previous and new owners when the toggle is
 * on. Returns a promise so callers can either await or fire-and-forget.
 */
export async function notifyDealReassignment(
  notifier: DealNotifier,
  input: NotifyDealReassignmentInput,
  flags: Pick<DealAutomationFlags, 'notifyOnOwnerChange'>
): Promise<void> {
  if (!flags.notifyOnOwnerChange) return;
  if (input.previousOwnerId === input.newOwnerId) return;

  await notifier.send({
    type: 'deal_reassigned',
    toUserIds: [input.previousOwnerId, input.newOwnerId],
    payload: {
      opportunityId: input.opportunityId,
      previousOwnerId: input.previousOwnerId,
      newOwnerId: input.newOwnerId,
      actorId: input.actorId,
    },
  });
}

/**
 * Emit `deal_stage_changed` to the owner when the toggle is on.
 */
export async function notifyDealStageChange(
  notifier: DealNotifier,
  input: NotifyDealStageChangeInput,
  flags: Pick<DealAutomationFlags, 'notifyOnStageChange'>
): Promise<void> {
  if (!flags.notifyOnStageChange) return;
  if (input.fromStage === input.toStage) return;

  await notifier.send({
    type: 'deal_stage_changed',
    toUserIds: [input.ownerId],
    payload: {
      opportunityId: input.opportunityId,
      fromStage: input.fromStage,
      toStage: input.toStage,
      actorId: input.actorId,
    },
  });
}

/**
 * Emit `deal_high_value_moved` when both the stage changes AND the deal
 * value meets the tenant's `highValueThreshold`. Call alongside
 * notifyDealStageChange — the two notifications are complementary
 * (stage-change goes to the owner; high-value goes to team leads).
 *
 * The team-lead recipients list is the caller's responsibility; this helper
 * receives the final list via `input.toUserIds`.
 */
export async function notifyHighValueStageMove(
  notifier: DealNotifier,
  input: NotifyHighValueStageMoveInput & { toUserIds: string[] },
  flags: Pick<DealAutomationFlags, 'notifyOnHighValueStageMove' | 'highValueThreshold'>
): Promise<void> {
  if (!flags.notifyOnHighValueStageMove) return;
  if (input.fromStage === input.toStage) return;
  if (input.value < flags.highValueThreshold) return;
  if (input.toUserIds.length === 0) return;

  await notifier.send({
    type: 'deal_high_value_moved',
    toUserIds: input.toUserIds,
    payload: {
      opportunityId: input.opportunityId,
      fromStage: input.fromStage,
      toStage: input.toStage,
      value: input.value,
      threshold: input.threshold,
      actorId: input.actorId,
    },
  });
}

/**
 * Emit `deal_duplicate_suspected` to the deal owner when the toggle is on
 * and a potential duplicate was detected at create time.
 */
export async function notifyDealDuplicate(
  notifier: DealNotifier,
  input: NotifyDealDuplicateInput,
  flags: Pick<DealAutomationFlags, 'notifyOnDuplicate'>
): Promise<void> {
  if (!flags.notifyOnDuplicate) return;

  await notifier.send({
    type: 'deal_duplicate_suspected',
    toUserIds: [input.ownerId],
    payload: {
      opportunityId: input.opportunityId,
      duplicateOpportunityId: input.duplicateOpportunityId,
      actorId: input.actorId,
    },
  });
}
