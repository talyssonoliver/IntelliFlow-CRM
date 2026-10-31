/**
 * Data subject request administration (PG-203, spec Addendum A, sign-off 1-8).
 *
 * Every `privacy.admin.*` procedure is `adminTenantProcedure` (ADMIN only; managers and
 * owners are not included) and acts only on the context tenant: a foreign id is NOT_FOUND.
 * The service owns the rules; this router maps outcomes to fixed messages and writes the
 * audit trail. The erasure audit row is awaited and holds counts and the admin id only,
 * never an erased value or the requester's address. `privacy.restrictionFor` is a
 * tenant-member read for the lead/contact banner: it resolves the email server-side from a
 * record id, so staff cannot probe arbitrary addresses, and returns booleans and a date.
 */
import { TRPCError } from '@trpc/server';
import type { DsarRecord } from '@intelliflow/application';
import { effectiveDeadline, isTerminalDsarStatus } from '@intelliflow/domain';
import {
  dsarCancelErasureSchema,
  dsarCompleteAccessSchema,
  dsarCompleteSchema,
  dsarExtendSchema,
  dsarIdInputSchema,
  dsarLiftRestrictionSchema,
  dsarListSchema,
  dsarLogRequestSchema,
  dsarRejectSchema,
  restrictionForSchema,
  type DsarErasureResultDto,
  type DsarExportDto,
  type DsarRequestDto,
  type ProcessingRestrictionStatusDto,
} from '@intelliflow/validators';
import { adminTenantProcedure, createTRPCRouter, tenantProcedure } from '../../trpc';
import type { Context } from '../../context';
import { getAuditLogger } from '../../security/audit-logger';
import type { AuditAction } from '../../security/types';

const NOT_FOUND = 'Request not found';
const RESTRICTION_NOT_FOUND = 'Restriction not found';
const CHANGED = 'This request has changed. Refresh and try again.';
const UNAVAILABLE = 'Data requests are temporarily unavailable.';

const INVALID_MESSAGES: Record<string, string> = {
  receivedOn: 'The received date must be today or within the last 30 days.',
  withheld: 'Give a count and a reason for everything the export withholds.',
  receivedOnReason: 'Say why the request is logged after the day it was received.',
  noHoldConfirmed:
    'Confirm that no legal hold or retention duty (SRA, anti-money-laundering, legal claims) applies.',
  marketingStopMethod: 'Confirm marketing has stopped and say how it was stopped.',
  useCompleteAccess: 'Access and portability requests are completed with the export step.',
  resolutionNoteLength:
    'The note and the withholding reasons together are too long (2000 characters). Shorten them.',
  type: 'This action does not apply to this type of request.',
};

const REFUSED_MESSAGES: Record<string, string> = {
  EXTENSION_NOT_ALLOWED:
    'A request can be extended once, by one or two months, before its original deadline.',
  SECOND_ADMIN_REQUIRED: 'Another administrator must carry out an erasure you logged yourself.',
  WAIT_24H:
    'An erasure logged by staff can run 24 hours after the person was warned, so they can object.',
  ERASURE_NOTICE_NOT_SENT:
    'The person must be emailed about this erasure before it can run, and the email could not be sent. Try again later.',
  NOTICE_NOT_SENT:
    'The person must be told before a restriction is lifted, and the email could not be sent. Try again later.',
};

type Outcome =
  | { outcome: 'OK' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'CONFLICT' }
  | { outcome: 'INVALID'; field?: string }
  | { outcome: 'REFUSED'; reason: string };

/** Throw the fixed message for any outcome other than OK. */
function assertOk<T extends { outcome: string }>(
  result: T,
  notFound = NOT_FOUND
): asserts result is Extract<T, { outcome: 'OK' }> {
  const r = result as unknown as Outcome;
  switch (r.outcome) {
    case 'OK':
      return;
    case 'NOT_FOUND':
      throw new TRPCError({ code: 'NOT_FOUND', message: notFound });
    case 'CONFLICT':
      throw new TRPCError({ code: 'CONFLICT', message: CHANGED });
    case 'INVALID':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: INVALID_MESSAGES[r.field ?? ''] ?? 'Check the request and try again.',
      });
    case 'REFUSED':
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: REFUSED_MESSAGES[r.reason] ?? 'This action is not allowed now.',
      });
  }
}

function dsarService(ctx: Pick<Context, 'services'>) {
  const service = ctx.services?.dsar;
  if (!service) {
    console.error('[privacy] DataSubjectRequestService is not wired');
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: UNAVAILABLE });
  }
  return service;
}

export function toDsarRequestDto(record: DsarRecord, now: Date): DsarRequestDto {
  const deadline = effectiveDeadline(record);
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    source: record.source,
    subjectEmail: record.subjectEmail,
    details: record.details,
    objectionScope: record.objectionScope,
    identityMethod: record.identityMethod,
    receivedOn: record.receivedAt.toISOString().slice(0, 10),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    slaDeadline: record.slaDeadline?.toISOString() ?? null,
    extendedUntil: record.extendedUntil?.toISOString() ?? null,
    effectiveDeadline: deadline?.toISOString() ?? null,
    overdue: !isTerminalDsarStatus(record.status) && deadline !== null && deadline < now,
    exportIssuedAt: record.exportIssuedAt?.toISOString() ?? null,
    exportLinkActive:
      record.exportTokenHash !== null &&
      record.exportExpiresAt !== null &&
      record.exportExpiresAt > now,
    completedAt: record.completedAt?.toISOString() ?? null,
    resolutionNote: record.resolutionNote,
    clockBreached: record.clockBreached,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Overdue first, then the nearest deadline; closed requests last, newest first. */
function byUrgency(a: DsarRequestDto, b: DsarRequestDto): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const openA = a.effectiveDeadline !== null && !a.completedAt;
  const openB = b.effectiveDeadline !== null && !b.completedAt;
  if (openA !== openB) return openA ? -1 : 1;
  if (openA && openB) return a.effectiveDeadline!.localeCompare(b.effectiveDeadline!);
  return b.createdAt.localeCompare(a.createdAt);
}

interface AuditCtx {
  prisma: Context['prisma'];
  tenant: { tenantId: string; userId: string };
}

/** Ids, types and counts only: never the requester's address, details or erased values. */
async function audit(
  ctx: AuditCtx,
  action: AuditAction,
  id: string,
  metadata: Record<string, unknown>,
  awaited = false
): Promise<void> {
  const write = getAuditLogger(ctx.prisma).logAction(
    action,
    'dsar_request',
    id,
    ctx.tenant.tenantId,
    { actorId: ctx.tenant.userId, metadata }
  );
  if (awaited) {
    await write;
    return;
  }
  write.catch((error: unknown) =>
    console.error('[privacy] Audit log failed', {
      action,
      error: error instanceof Error ? error.name : 'unknown',
    })
  );
}

async function firmName(ctx: Pick<Context, 'prisma'>, tenantId: string): Promise<string> {
  const tenant = await ctx.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? 'the firm';
}

export const privacyAdminRouter = createTRPCRouter({
  list: adminTenantProcedure
    .input(dsarListSchema)
    .query(async ({ ctx, input }): Promise<DsarRequestDto[]> => {
      const now = new Date();
      const rows = await dsarService(ctx).list(ctx.tenant.tenantId, input.status);
      return rows.map((r) => toDsarRequestDto(r, now)).sort(byUrgency);
    }),

  restrictions: adminTenantProcedure.query(async ({ ctx }) => {
    const rows = await dsarService(ctx).listRestrictions(ctx.tenant.tenantId);
    return rows.map((r) => ({
      id: r.id,
      subjectEmail: r.subjectEmail,
      blocksMarketing: r.blocksMarketing,
      requestCount: r.dsarRequestIds.length,
      since: r.createdAt.toISOString(),
    }));
  }),

  logRequest: adminTenantProcedure
    .input(dsarLogRequestSchema)
    .mutation(async ({ ctx, input }): Promise<DsarRequestDto> => {
      const tenantId = ctx.tenant.tenantId;
      const result = await dsarService(ctx).logRequest({
        tenantId,
        actorId: ctx.tenant.userId,
        firm: { name: await firmName(ctx, tenantId) },
        type: input.type,
        email: input.email,
        details: input.details || null,
        objectionScope: input.objectionScope ?? null,
        receivedOn: input.receivedOn,
        receivedOnReason: input.receivedOnReason ?? null,
        identityMethod: input.identityMethod,
        identityNote: input.identityNote,
        now: new Date(),
      });
      assertOk(result);
      await audit(ctx, 'CREATE', result.record.id, {
        type: input.type,
        source: 'STAFF',
        identityMethod: input.identityMethod,
        backdated: input.receivedOnReason !== undefined,
      });
      return toDsarRequestDto(result.record, new Date());
    }),

  extend: adminTenantProcedure.input(dsarExtendSchema).mutation(async ({ ctx, input }) => {
    const result = await dsarService(ctx).extend({
      tenantId: ctx.tenant.tenantId,
      id: input.id,
      actorId: ctx.tenant.userId,
      months: input.months,
      reason: input.reason,
      now: new Date(),
    });
    assertOk(result);
    await audit(ctx, 'UPDATE', input.id, { change: 'EXTENDED', months: input.months });
    return { ok: true as const };
  }),

  previewErasure: adminTenantProcedure
    .input(dsarIdInputSchema)
    .query(async ({ ctx, input }): Promise<DsarErasureResultDto> => {
      const result = await dsarService(ctx).previewErasure({
        tenantId: ctx.tenant.tenantId,
        id: input.id,
      });
      assertOk(result);
      return result.preview;
    }),

  complete: adminTenantProcedure
    .input(dsarCompleteSchema)
    .mutation(async ({ ctx, input }): Promise<{ erasure: DsarErasureResultDto | null }> => {
      const result = await dsarService(ctx).complete({
        tenantId: ctx.tenant.tenantId,
        id: input.id,
        actorId: ctx.tenant.userId,
        note: input.note,
        noHoldConfirmed: input.noHoldConfirmed,
        marketingStoppedConfirmed: input.marketingStoppedConfirmed,
        marketingStopMethod: input.marketingStopMethod,
        now: new Date(),
      });
      assertOk(result);
      if (result.erasure) {
        const { counts, checklist } = result.erasure;
        const metadata = { change: 'ERASED', noHoldConfirmed: true, counts, checklist };
        // Awaited and retried once. The erasure has already committed, so a failure must not
        // throw: that would lose the admin's cleanup checklist and a retry is a CONFLICT
        // (codex). The counts go to the error log instead (no personal data).
        await audit(ctx, 'DELETE', input.id, metadata, true)
          .catch(() => audit(ctx, 'DELETE', input.id, metadata, true))
          .catch((error: unknown) => {
            console.error('[privacy] Erasure audit row not written', {
              requestId: input.id,
              tenantId: ctx.tenant.tenantId,
              counts,
              checklist,
              error: error instanceof Error ? error.name : 'unknown',
            });
          });
        return { erasure: result.erasure };
      }
      await audit(ctx, 'UPDATE', input.id, {
        change: 'COMPLETED',
        marketingStopped: input.marketingStoppedConfirmed === true,
      });
      return { erasure: null };
    }),

  completeAccess: adminTenantProcedure
    .input(dsarCompleteAccessSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await dsarService(ctx).completeAccess({
        tenantId: ctx.tenant.tenantId,
        id: input.id,
        actorId: ctx.tenant.userId,
        note: input.note,
        withheld: input.withheld,
        now: new Date(),
      });
      assertOk(result);
      await audit(ctx, 'UPDATE', input.id, {
        change: 'COMPLETED',
        withheld: input.withheld.map((w) => ({ category: w.category, count: w.count })),
      });
      return { ok: true as const };
    }),

  reject: adminTenantProcedure.input(dsarRejectSchema).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const result = await dsarService(ctx).reject({
      tenantId: ctx.tenant.tenantId,
      id: input.id,
      actorId: ctx.tenant.userId,
      reason: input.reason,
      now,
    });
    assertOk(result);
    await audit(ctx, 'UPDATE', input.id, {
      change: 'REJECTED',
      restrictionKept: result.restrictionKept,
    });
    // The UI says the restriction stays until it can be lifted with the notice sent.
    return { ok: true as const, restrictionKept: result.restrictionKept };
  }),

  cancelErasure: adminTenantProcedure
    .input(dsarCancelErasureSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await dsarService(ctx).cancelErasure({
        tenantId: ctx.tenant.tenantId,
        id: input.id,
        actorId: ctx.tenant.userId,
        reason: input.reason,
        now: new Date(),
      });
      assertOk(result);
      await audit(ctx, 'UPDATE', input.id, { change: 'ERASURE_CANCELLED' });
      return { ok: true as const };
    }),

  liftRestriction: adminTenantProcedure
    .input(dsarLiftRestrictionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await dsarService(ctx).liftRestriction({
        tenantId: ctx.tenant.tenantId,
        restrictionId: input.restrictionId,
        actorId: ctx.tenant.userId,
        note: input.note,
      });
      assertOk(result, RESTRICTION_NOT_FOUND);
      await audit(ctx, 'UPDATE', input.restrictionId, { change: 'RESTRICTION_LIFTED' });
      return { ok: true as const };
    }),

  revokeExport: adminTenantProcedure.input(dsarIdInputSchema).mutation(async ({ ctx, input }) => {
    const result = await dsarService(ctx).revokeExport({
      tenantId: ctx.tenant.tenantId,
      id: input.id,
      actorId: ctx.tenant.userId,
    });
    assertOk(result);
    await audit(ctx, 'UPDATE', input.id, { change: 'EXPORT_REVOKED' });
    return { ok: true as const };
  }),

  exportData: adminTenantProcedure
    .input(dsarIdInputSchema)
    .mutation(async ({ ctx, input }): Promise<DsarExportDto> => {
      const result = await dsarService(ctx).exportData({
        tenantId: ctx.tenant.tenantId,
        id: input.id,
        now: new Date(),
      });
      assertOk(result);
      // The data has already left, so the audit row is awaited and retried once, and a failure
      // does not throw: ids and the error class go to the log instead (same as erasure).
      const metadata = { change: 'EXPORTED_BY_STAFF' };
      await audit(ctx, 'EXPORT', input.id, metadata, true)
        .catch(() => audit(ctx, 'EXPORT', input.id, metadata, true))
        .catch((error: unknown) => {
          console.error('[privacy] Export audit row not written', {
            requestId: input.id,
            tenantId: ctx.tenant.tenantId,
            error: error instanceof Error ? error.name : 'unknown',
          });
        });
      return result.export;
    }),
});

/** Banner read for any member of the tenant: the record's own email, resolved here. */
export const restrictionForProcedure = tenantProcedure
  .input(restrictionForSchema)
  .query(async ({ ctx, input }): Promise<ProcessingRestrictionStatusDto> => {
    const tenantId = ctx.tenant.tenantId;
    const where = { id: input.id, tenantId };
    const record =
      input.entity === 'lead'
        ? await ctx.prismaWithTenant.lead.findFirst({ where, select: { email: true } })
        : await ctx.prismaWithTenant.contact.findFirst({ where, select: { email: true } });
    if (!record) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: input.entity === 'lead' ? 'Lead not found' : 'Contact not found',
      });
    }
    const status = await dsarService(ctx).restrictionStatus(tenantId, record.email);
    return {
      restricted: status.restricted,
      blocksMarketing: status.blocksMarketing,
      since: status.since?.toISOString() ?? null,
    };
  });
