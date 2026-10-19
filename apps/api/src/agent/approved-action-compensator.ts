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

function entityId(result: ExecutionResult): string {
  if (!result.entityId) throw new Error('The executed action recorded no entity to undo.');
  return result.entityId;
}

async function cancelCase(result: ExecutionResult, ctx: Context) {
  const { casesRouter } = await import('../modules/legal/cases.router.js');
  const caseId = entityId(result);
  await casesRouter.createCaller(ctx as CallerCtx).changeStatus({ caseId, status: 'CANCELLED' });
  return { cancelledCaseId: caseId };
}

async function cancelAppointment(result: ExecutionResult, ctx: Context) {
  const { appointmentsRouter } = await import('../modules/legal/appointments.router.js');
  const id = entityId(result);
  await appointmentsRouter.createCaller(ctx as CallerCtx).cancel({ id, reason: ROLLBACK_REASON });
  return { cancelledAppointmentId: id };
}

async function trashEmailDraft(result: ExecutionResult, ctx: Context) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new Error('No tenant on the requesting session.');
  const id = entityId(result);
  const record = await ctx.prisma.emailRecord.findFirst({
    where: { id, tenantId },
    select: { metadata: true },
  });
  if (!record) throw new Error('The email draft was not found.');
  // Archived, trashed or otherwise moved on: it is no longer the draft the agent made.
  const meta = (record.metadata as Record<string, unknown> | null) ?? {};
  if (meta.isDraft !== true) throw new Error('The email is no longer a draft.');
  const { inboundEmailRouter } = await import('../modules/email/inbound.router.js');
  await inboundEmailRouter
    .createCaller(ctx as CallerCtx)
    .processEmail({ emailId: id, action: 'delete' } as never);
  return { trashedDraftId: id };
}

type Compensator = (result: ExecutionResult, ctx: Context) => Promise<Record<string, unknown>>;

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
  const compensate = compensatorFor(toolName, result);
  if (!compensate) {
    return { success: false, error: `"${toolName}" actions cannot be rolled back.` };
  }
  if (!ctx?.user) {
    return { success: false, error: 'Rollback requested outside a signed-in request.' };
  }
  try {
    return { success: true, restoredState: await compensate(result as ExecutionResult, ctx) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Rollback failed' };
  }
}
