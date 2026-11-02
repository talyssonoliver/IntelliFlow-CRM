/**
 * Public data subject request procedures (PG-203, spec Addendum A; owner rulings Q16/Q17).
 *
 * A person asks a firm (found by its booking handle) to act on their personal data. Every
 * procedure is throttled per client IP hash before its first read, as the public booking
 * procedures are. `getFirm` makes one handle read whatever the outcome; `submit` answers the
 * same thing whether or not the email matches anything, and a filled honeypot gets that
 * answer with no database work. Tokens arrive in the body (the page reads them from the URL
 * fragment) and never return to the browser. Errors carry fixed messages, never causes.
 */
import { TRPCError } from '@trpc/server';
import {
  dsarFirmLookupSchema,
  dsarSubmitSchema,
  dsarTokenInputSchema,
  type DsarExportDto,
  type DsarFirmDto,
  type DsarSubmitResultDto,
  type DsarVerifyResultDto,
} from '@intelliflow/validators';
import { DSAR_SUBMIT_MESSAGE } from '@intelliflow/application';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import { getAuditLogger } from '../../security/audit-logger';
import type { Context } from '../../context';
import {
  bookingLookupLimiter,
  bookingSubmitLimiter,
  getBookingSalt,
  ipHashOf,
} from '../calendar/booking-abuse';

const NOT_AVAILABLE = 'This page is not available.';
const TOO_MANY = 'Too many requests. Please try again later.';
const INVALID_LINK = 'This link is invalid or has expired.';
const DOWNLOAD_LIMIT = 'This download link has been used too many times. Contact the firm.';
const UNAVAILABLE = 'Data requests are temporarily unavailable.';

interface PublicFirm {
  tenantId: string;
  name: string;
  handle: string;
  privacyUrl: string | null;
}

function dsarService(ctx: Context) {
  const service = ctx.services?.dsar;
  if (!service) {
    console.error('[privacy] DataSubjectRequestService is not wired');
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: UNAVAILABLE });
  }
  return service;
}

/**
 * Every public handler runs inside this: our own fixed-message errors pass through, anything
 * else (a database or service failure) reaches the anonymous caller as one fixed message, and
 * only its code is logged, since driver text can carry query arguments (codex).
 */
async function publicly<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    console.error('[privacy] public request failed', {
      code: (err as { code?: string } | null)?.code ?? 'unknown',
    });
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: UNAVAILABLE });
  }
}

function clientIpHash(ctx: Context, salt: string): string {
  return ipHashOf(ctx.req as Request | undefined, salt);
}

/**
 * Compliance #6: a download of personal data is recorded. The service answers with the export
 * only, so the firm comes from the request row. The actor is the system: the person is known
 * by the link alone, and no address, token or IP reaches the row. Never fails the download
 * that has already happened; the log carries the error class only.
 */
async function auditExportDownload(ctx: Context, requestId: string): Promise<void> {
  try {
    const row = await ctx.prisma.dsarRequest.findUnique({
      where: { id: requestId },
      select: { tenantId: true },
    });
    if (!row) throw new Error('Request not found');
    await getAuditLogger(ctx.prisma).logAction('EXPORT', 'dsar_request', requestId, row.tenantId, {
      actorType: 'SYSTEM',
      metadata: { change: 'EXPORT_DOWNLOADED_BY_SUBJECT' },
    });
  } catch (error) {
    console.error('[privacy] Export download audit row not written', {
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** The single public lookup: one read by handle; unknown handle and no page look the same. */
async function findFirm(ctx: Context, handle: string): Promise<PublicFirm> {
  const tenant = await ctx.prisma.tenant.findUnique({
    where: { bookingHandle: handle },
    select: { id: true, name: true, bookingHandle: true, bookingPrivacyUrl: true },
  });
  if (!tenant?.bookingHandle) {
    throw new TRPCError({ code: 'NOT_FOUND', message: NOT_AVAILABLE });
  }
  return {
    tenantId: tenant.id,
    name: tenant.name,
    handle: tenant.bookingHandle,
    privacyUrl: tenant.bookingPrivacyUrl,
  };
}

export const privacyPublicProcedures = {
  getFirm: publicProcedure.input(dsarFirmLookupSchema).query(
    ({ ctx, input }): Promise<DsarFirmDto> =>
      publicly(async () => {
        bookingLookupLimiter.check(clientIpHash(ctx, getBookingSalt()));
        const firm = await findFirm(ctx, input.handle);
        return { firmName: firm.name, privacyUrl: firm.privacyUrl };
      })
  ),

  submit: publicProcedure.input(dsarSubmitSchema).mutation(
    ({ ctx, input }): Promise<DsarSubmitResultDto> =>
      publicly(async () => {
        // Bots get the same answer and no database work.
        if (input.__honeypot) return { message: DSAR_SUBMIT_MESSAGE };
        const salt = getBookingSalt();
        const ipHash = clientIpHash(ctx, salt);
        bookingSubmitLimiter.check(ipHash);
        const service = dsarService(ctx);
        const firm = await findFirm(ctx, input.handle);
        const result = await service.submit({
          firm: { tenantId: firm.tenantId, name: firm.name, handle: firm.handle },
          type: input.type,
          email: input.email,
          details: input.details || null,
          objectionScope: input.objectionScope ?? null,
          ipHash,
          now: new Date(),
        });
        if (result.outcome === 'TOO_MANY') {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: TOO_MANY });
        }
        return { message: result.message };
      })
  ),

  verify: publicProcedure.input(dsarTokenInputSchema).mutation(
    ({ ctx, input }): Promise<DsarVerifyResultDto> =>
      publicly(async () => {
        bookingSubmitLimiter.check(clientIpHash(ctx, getBookingSalt()));
        const result = await dsarService(ctx).verify({
          requestId: input.requestId,
          token: input.token,
          now: new Date(),
        });
        if (result.outcome !== 'VERIFIED') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
        }
        return {
          type: result.type,
          dueDate: result.dueDate.toISOString(),
          exportEmailed: result.exportEmailed,
        };
      })
  ),

  downloadExport: publicProcedure.input(dsarTokenInputSchema).mutation(
    ({ ctx, input }): Promise<DsarExportDto> =>
      publicly(async () => {
        bookingLookupLimiter.check(clientIpHash(ctx, getBookingSalt()));
        const result = await dsarService(ctx).downloadExport({
          requestId: input.requestId,
          token: input.token,
          now: new Date(),
        });
        if (result.outcome === 'LIMIT') {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: DOWNLOAD_LIMIT });
        }
        if (result.outcome !== 'OK') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: INVALID_LINK });
        }
        await auditExportDownload(ctx, input.requestId);
        return result.export;
      })
  ),
};

export const privacyPublicRouter = createTRPCRouter(privacyPublicProcedures);
