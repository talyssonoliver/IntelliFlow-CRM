/**
 * Approved-action compensator (PG-198 RF-4, issue #856).
 *
 * Undoes an approved agent action for real, through the same tRPC procedures a
 * person would use to undo it by hand, on the requester's own request context —
 * so the target module's tenant guards, transition rules and notifications all
 * apply. Nothing is hard-deleted:
 *
 * - create_case        → the case is moved to CANCELLED
 * - create_appointment → the appointment is cancelled
 * - draft_message      → an unsent email draft is moved to the trash
 *
 * Updates and notes have no safe compensation yet (they need the before-state and
 * a delete-note procedure); they are not offered a rollback at all. Per-tool
 * design: #931.
 */

import type { Context } from '../context';
import type { ExecutionResult } from './approved-action-executor';

export interface CompensationOutcome {
  success: boolean;
  /** What was undone, for the audit log and the response. */
  restoredState?: Record<string, unknown>;
  error?: string;
}

type CallerCtx = never;

const ROLLBACK_REASON = 'Agent action rolled back';

function tenantOf(ctx: Context): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new Error('No tenant on the requesting session.');
  return tenantId;
}

/**
 * Each compensation is idempotent: `isUndone` reads the target's state in the tenant, so
 * a retry after an interrupted or half-reported rollback (the target procedure committed,
 * then a later read failed) records the undo instead of failing on an invalid transition.
 */
interface Compensator {
  isUndone(id: string, ctx: Context): Promise<boolean>;
  undo(id: string, ctx: Context): Promise<void>;
  restoredState(id: string): Record<string, unknown>;
}

const cancelCase: Compensator = {
  async isUndone(id, ctx) {
    const row = await ctx.prisma.case.findFirst({
      where: { id, tenantId: tenantOf(ctx) },
      select: { status: true },
    });
    if (!row) throw new Error('The case was not found.');
    return row.status === 'CANCELLED';
  },
  async undo(caseId, ctx) {
    const { casesRouter } = await import('../modules/legal/cases.router.js');
    await casesRouter.createCaller(ctx as CallerCtx).changeStatus({ caseId, status: 'CANCELLED' });
  },
  restoredState: (id) => ({ cancelledCaseId: id }),
};

const cancelAppointment: Compensator = {
  async isUndone(id, ctx) {
    const row = await ctx.prisma.appointment.findFirst({
      where: { id, tenantId: tenantOf(ctx) },
      select: { status: true },
    });
    if (!row) throw new Error('The appointment was not found.');
    return row.status === 'CANCELLED';
  },
  async undo(id, ctx) {
    const { appointmentsRouter } = await import('../modules/legal/appointments.router.js');
    await appointmentsRouter.createCaller(ctx as CallerCtx).cancel({ id, reason: ROLLBACK_REASON });
  },
  restoredState: (id) => ({ cancelledAppointmentId: id }),
};

async function emailMetadata(id: string, ctx: Context): Promise<Record<string, unknown>> {
  const record = await ctx.prisma.emailRecord.findFirst({
    where: { id, tenantId: tenantOf(ctx) },
    select: { metadata: true },
  });
  if (!record) throw new Error('The email draft was not found.');
  return (record.metadata as Record<string, unknown> | null) ?? {};
}

const trashEmailDraft: Compensator = {
  async isUndone(id, ctx) {
    return (await emailMetadata(id, ctx)).isTrashed === true;
  },
  async undo(id, ctx) {
    // Archived, sent on or otherwise moved: it is no longer the draft the agent made.
    if ((await emailMetadata(id, ctx)).isDraft !== true) {
      throw new Error('The email is no longer a draft.');
    }
    const { inboundEmailRouter } = await import('../modules/email/inbound.router.js');
    await inboundEmailRouter
      .createCaller(ctx as CallerCtx)
      .processEmail({ emailId: id, action: 'delete' } as never);
  },
  restoredState: (id) => ({ trashedDraftId: id }),
};

/** Keyed by tool, then by the entity type the executor recorded. */
const COMPENSATORS: Readonly<Record<string, Readonly<Record<string, Compensator>>>> = {
  create_case: { CASE: cancelCase },
  create_appointment: { APPOINTMENT: cancelAppointment },
  // A NOTE records the lead/contact it was added to; only email drafts are undoable.
  draft_message: { MESSAGE: trashEmailDraft },
};

function asExecutionResult(value: unknown): ExecutionResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { entityType, entityId: id } = value as Record<string, unknown>;
  return typeof entityType === 'string' && typeof id === 'string'
    ? (value as ExecutionResult)
    : undefined;
}

function compensatorFor(toolName: string, result: unknown): Compensator | undefined {
  const executed = asExecutionResult(result);
  return executed ? COMPENSATORS[toolName]?.[executed.entityType] : undefined;
}

/** Whether a succeeded action can be undone, and so whether to offer a rollback token. */
export function canCompensate(toolName: string, result: unknown): boolean {
  return compensatorFor(toolName, result) !== undefined;
}

/** Undo an executed action. Never throws: failures come back with the reason. */
export async function compensateApprovedAction(
  toolName: string,
  result: unknown,
  ctx: Context | undefined
): Promise<CompensationOutcome> {
  const compensator = compensatorFor(toolName, result);
  if (!compensator) {
    return { success: false, error: `"${toolName}" actions cannot be rolled back.` };
  }
  if (!ctx?.user) {
    return { success: false, error: 'Rollback requested outside a signed-in request.' };
  }
  const id = (result as ExecutionResult).entityId;
  const undone = { success: true, restoredState: compensator.restoredState(id) };
  try {
    if (await compensator.isUndone(id, ctx)) return undone;
    await compensator.undo(id, ctx);
    return undone;
  } catch (error) {
    // The target procedure may have committed before failing: reconcile from its state.
    if (await compensator.isUndone(id, ctx).catch(() => false)) return undone;
    return { success: false, error: error instanceof Error ? error.message : 'Rollback failed' };
  }
}
