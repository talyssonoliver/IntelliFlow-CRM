/**
 * Approved-action executor (PG-198 RF-1, issue #853).
 *
 * Runs an approved agent action for real, through the same tRPC procedures a
 * person would use, on the approver's own request context — so the target
 * module's validation, tenant guards, entitlements and notifications all apply,
 * and approving never grants more than the approver could do directly.
 *
 * Routers are imported lazily: importing them eagerly would cycle back through
 * agent.router → approval-workflow → this file.
 *
 * Drafted messages are never sent: an EMAIL becomes a draft in the email
 * module, a NOTE is added to the lead/contact, and SMS fails explicitly
 * because no SMS channel exists.
 */

import { tenantUserWhere } from '@intelliflow/db';
import type { Context } from '../context';
import type { ExecutionStatus } from './types';

export type { ExecutionStatus } from './types';

export interface ExecutionOutcome {
  status: Exclude<ExecutionStatus, 'EXECUTING'>;
  result?: ExecutionResult;
  error?: string;
}

export interface ExecutionResult {
  entityType: string;
  entityId: string;
  detail?: string;
}

/** lead.addNote / contact.addNote content limit. */
const NOTE_MAX_LENGTH = 5000;

/** Fields an approver may not change: they identify what the action targets. */
export const IMMUTABLE_INPUT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  create_case: ['clientId'],
  update_case: ['id'],
  update_appointment: ['id'],
  draft_message: ['recipientType', 'recipientId'],
};

export class ApprovalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalInputError';
  }
}

interface InputSchema {
  safeParse(value: unknown): { success: boolean; data?: unknown; error?: { message: string } };
}

/**
 * The input that will actually run: the approver's modifications (if any)
 * merged over the original, re-validated with the tool's own schema.
 */
export function prepareExecutionInput(
  toolName: string,
  schema: InputSchema,
  original: Record<string, unknown>,
  modified?: Record<string, unknown>
): Record<string, unknown> {
  if (modified) {
    for (const field of IMMUTABLE_INPUT_FIELDS[toolName] ?? []) {
      if (field in modified && modified[field] !== original[field]) {
        throw new ApprovalInputError(`"${field}" cannot be changed when approving ${toolName}.`);
      }
    }
  }
  const parsed = schema.safeParse(modified ? { ...original, ...modified } : original);
  if (!parsed.success) {
    throw new ApprovalInputError(
      `The approved input is not valid for ${toolName}: ${parsed.error?.message ?? 'invalid input'}`
    );
  }
  const data = parsed.data as Record<string, unknown>;
  // The note procedures accept less than the tool does; refuse before claiming, so the
  // action stays pending and can be shortened.
  if (
    toolName === 'draft_message' &&
    data.type === 'NOTE' &&
    typeof data.body === 'string' &&
    data.body.length > NOTE_MAX_LENGTH
  ) {
    throw new ApprovalInputError(`A note can be at most ${NOTE_MAX_LENGTH} characters.`);
  }
  return data;
}

type Input = Record<string, unknown>;
type CallerCtx = never;

export interface ExecutionOptions {
  /** Who asked for the action; the preview showed them as the default assignee. */
  requesterId?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Copy only the keys that are present, so absent fields stay untouched on update. */
function pick(input: Input, keys: readonly string[]): Input {
  const out: Input = {};
  for (const key of keys) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

/**
 * Ids an agent proposed must belong to the approving tenant. Several target procedures
 * look related records up by id only (#880, #890), so an approved action is checked here
 * before it runs, whoever (or whichever policy) approved it.
 */
function approvingTenant(ctx: Context): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new Error('No tenant on the approving session.');
  return tenantId;
}

async function assertUsersInTenant(ctx: Context, ids: readonly string[], label: string) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await ctx.prisma.user.count({
    where: { id: { in: unique }, ...tenantUserWhere(approvingTenant(ctx)) },
  });
  if (found !== unique.length) throw new Error(`The ${label} must be users of this workspace.`);
}

async function assertCasesInTenant(ctx: Context, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await ctx.prisma.case.count({
    where: { id: { in: unique }, tenantId: approvingTenant(ctx) },
  });
  if (found !== unique.length) throw new Error('A linked case was not found.');
}

async function assertAppointmentInTenant(ctx: Context, id: string) {
  const row = await ctx.prisma.appointment.findFirst({
    where: { id, tenantId: approvingTenant(ctx) },
    select: { id: true },
  });
  if (!row) throw new Error('The appointment was not found.');
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function createCase(
  input: Input,
  ctx: Context,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const { casesRouter } = await import('../modules/legal/cases.router.js');
  // Explicit assignee — the requester, as the approval preview showed it — because
  // cases.create cannot default one itself (#872).
  const assignedTo = input.assignedTo ?? options.requesterId ?? ctx.user?.userId;
  const created = await casesRouter.createCaller(ctx as CallerCtx).create({
    ...pick(input, ['title', 'description', 'priority', 'deadline', 'clientId']),
    assignedTo,
  } as never);
  return { entityType: 'CASE', entityId: (created as { id: string }).id };
}

/**
 * Run a second write after a first one succeeded. The two procedures cannot share a
 * transaction, so a failure here is reported as exactly what was and was not applied.
 */
async function thenApply(applied: string | null, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (error) {
    if (!applied) throw error;
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`${applied}, but the other changes were not applied: ${reason}`, {
      cause: error,
    });
  }
}

async function updateCase(input: Input, ctx: Context): Promise<ExecutionResult> {
  const { casesRouter } = await import('../modules/legal/cases.router.js');
  const caller = casesRouter.createCaller(ctx as CallerCtx);
  const id = String(input.id);
  const fields = pick(input, ['title', 'description', 'priority', 'deadline', 'assignedTo']);
  if (input.status === undefined && Object.keys(fields).length === 0) {
    throw new Error('The approved update has no changes to apply.');
  }
  // cases.update writes assignedTo without a workspace check (#880).
  if (typeof fields.assignedTo === 'string') {
    await assertUsersInTenant(ctx, [fields.assignedTo], 'assignee');
  }
  // The status change is the step that can be refused (invalid transition), so it runs first.
  let applied: string | null = null;
  if (input.status !== undefined) {
    await caller.changeStatus({ caseId: id, status: input.status } as never);
    applied = `Status changed to ${String(input.status)}`;
  }
  if (Object.keys(fields).length > 0) {
    await thenApply(applied, () => caller.update({ id, ...fields } as never));
  }
  return { entityType: 'CASE', entityId: id };
}

async function createAppointment(
  input: Input,
  ctx: Context,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const { appointmentsRouter } = await import('../modules/legal/appointments.router.js');
  // The approver becomes the organizer; the requester stays an attendee, as the
  // approval preview showed them.
  const proposed = Array.isArray(input.attendeeIds) ? (input.attendeeIds as string[]) : [];
  const attendeeIds = options.requesterId
    ? [...new Set([options.requesterId, ...proposed])]
    : proposed;
  await assertUsersInTenant(ctx, attendeeIds, 'attendees');
  await assertCasesInTenant(ctx, strings(input.linkedCaseIds));
  const created = await appointmentsRouter.createCaller(ctx as CallerCtx).create({
    ...pick(input, [
      'title',
      'description',
      'startTime',
      'endTime',
      'appointmentType',
      'location',
      'linkedCaseIds',
      'reminderMinutes',
    ]),
    attendeeIds,
  } as never);
  return { entityType: 'APPOINTMENT', entityId: (created as { id: string }).id };
}

async function updateAppointment(input: Input, ctx: Context): Promise<ExecutionResult> {
  const { appointmentsRouter } = await import('../modules/legal/appointments.router.js');
  const caller = appointmentsRouter.createCaller(ctx as CallerCtx);
  const id = String(input.id);
  const hasStart = input.startTime !== undefined;
  const hasEnd = input.endTime !== undefined;
  if (hasStart !== hasEnd) {
    throw new Error('Rescheduling needs both a start and an end time.');
  }
  const fields = pick(input, ['title', 'description', 'location', 'appointmentType', 'notes']);
  if (!hasStart && Object.keys(fields).length === 0) {
    throw new Error('The approved update has no changes to apply.');
  }
  // appointments.update reads and writes by id only: prove the appointment is this tenant's.
  await assertAppointmentInTenant(ctx, id);
  // Rescheduling is the step that can be refused (conflicts), so it runs first.
  let applied: string | null = null;
  if (hasStart) {
    await caller.reschedule({
      id,
      newStartTime: input.startTime,
      newEndTime: input.endTime,
    } as never);
    applied = 'Rescheduled';
  }
  if (Object.keys(fields).length > 0) {
    await thenApply(applied, () => caller.update({ id, ...fields } as never));
  }
  return { entityType: 'APPOINTMENT', entityId: id };
}

function toHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '<br>');
}

async function recipientEmail(input: Input, ctx: Context): Promise<string> {
  const tenantId = ctx.user?.tenantId;
  const id = String(input.recipientId);
  if (!tenantId) throw new Error('No tenant on the approving session.');
  const row =
    input.recipientType === 'LEAD'
      ? await ctx.prisma.lead.findFirst({ where: { id, tenantId }, select: { email: true } })
      : await ctx.prisma.contact.findFirst({ where: { id, tenantId }, select: { email: true } });
  const email = str(row?.email);
  if (!email)
    throw new Error(`The ${String(input.recipientType).toLowerCase()} has no email address.`);
  return email;
}

async function draftEmail(input: Input, ctx: Context): Promise<ExecutionResult> {
  if (input.recipientType === 'ACCOUNT') {
    throw new Error('Accounts have no email address; draft the email to a contact instead.');
  }
  const to = await recipientEmail(input, ctx);
  const { inboundEmailRouter } = await import('../modules/email/inbound.router.js');
  const body = String(input.body);
  const draft = await inboundEmailRouter.createCaller(ctx as CallerCtx).saveDraft({
    to: [to],
    subject: str(input.subject),
    textBody: body,
    htmlBody: toHtml(body),
  });
  return {
    entityType: 'MESSAGE',
    entityId: draft.id,
    detail: 'Saved as an email draft; not sent.',
  };
}

/**
 * The note procedures look recipients up by id only, so ownership is proven here:
 * the lead/contact must belong to the approving session's tenant.
 */
async function assertRecipientInTenant(input: Input, ctx: Context): Promise<void> {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new Error('No tenant on the approving session.');
  const where = { where: { id: String(input.recipientId), tenantId }, select: { id: true } };
  const row =
    input.recipientType === 'LEAD'
      ? await ctx.prisma.lead.findFirst(where)
      : await ctx.prisma.contact.findFirst(where);
  if (!row) {
    throw new Error(`The ${String(input.recipientType).toLowerCase()} was not found.`);
  }
}

async function addNote(input: Input, ctx: Context): Promise<ExecutionResult> {
  const content = String(input.body);
  const id = String(input.recipientId);
  if (input.recipientType !== 'LEAD' && input.recipientType !== 'CONTACT') {
    throw new Error('Notes can be added to leads and contacts only.');
  }
  await assertRecipientInTenant(input, ctx);
  if (input.recipientType === 'LEAD') {
    const { leadRouter } = await import('../modules/lead/lead.router.js');
    await leadRouter.createCaller(ctx as CallerCtx).addNote({ leadId: id, content } as never);
    return { entityType: 'LEAD', entityId: id, detail: 'Note added.' };
  }
  const { contactRouter } = await import('../modules/contact/contact.router.js');
  await contactRouter.createCaller(ctx as CallerCtx).addNote({ contactId: id, content } as never);
  return { entityType: 'CONTACT', entityId: id, detail: 'Note added.' };
}

async function draftMessage(input: Input, ctx: Context): Promise<ExecutionResult> {
  if (input.type === 'EMAIL') return draftEmail(input, ctx);
  const scheduledFor = input.scheduledFor instanceof Date ? input.scheduledFor : null;
  if (input.type === 'NOTE' && scheduledFor && scheduledFor.getTime() > Date.now()) {
    // Not applied early: scheduled notes are not supported, so nothing is written.
    throw new Error('Scheduled notes are not supported; nothing was written.');
  }
  if (input.type === 'NOTE') return addNote(input, ctx);
  throw new Error('No SMS channel is configured; nothing was sent.');
}

type Handler = (input: Input, ctx: Context, options: ExecutionOptions) => Promise<ExecutionResult>;

const HANDLERS: Readonly<Record<string, Handler>> = {
  create_case: createCase,
  update_case: updateCase,
  create_appointment: createAppointment,
  update_appointment: updateAppointment,
  draft_message: draftMessage,
};

/** Run an approved action. Never throws: failures come back as FAILED with the reason. */
export async function executeApprovedAction(
  toolName: string,
  input: Input,
  ctx: Context | undefined,
  options: ExecutionOptions = {}
): Promise<ExecutionOutcome> {
  const handler = HANDLERS[toolName];
  if (!handler) {
    return { status: 'FAILED', error: `No executor exists for "${toolName}".` };
  }
  if (!ctx?.user) {
    return {
      status: 'FAILED',
      error: 'Approved outside a signed-in request; nothing was executed.',
    };
  }
  try {
    return { status: 'SUCCEEDED', result: await handler(input, ctx, options) };
  } catch (error) {
    return {
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}
