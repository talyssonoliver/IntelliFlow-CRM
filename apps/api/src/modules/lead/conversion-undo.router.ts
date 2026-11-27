/**
 * Undo a lead-to-deal conversion (MVP-003).
 *
 * `status` says whether the deal's conversion can still be undone (and why not); `undo` puts
 * the lead back to QUALIFIED and removes the deal, and the contact when the conversion created
 * it, while nothing has happened to them since. Kept apart from lead.router.ts, which may only
 * shrink; the use case is built per request from the container's shared adapters.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { UndoLeadConversionUseCase } from '@intelliflow/application';
import { PrismaConversionUndoAdapter } from '@intelliflow/adapters';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { getTenantContext } from '../../security/tenant-context';
import type { Context } from '../../context';

const dealInput = z.object({ opportunityId: z.string().min(1).max(64) });

function buildUseCase(ctx: Context): UndoLeadConversionUseCase {
  const adapters = ctx.container?.adapters;
  if (!adapters) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Undo service not available' });
  }
  return new UndoLeadConversionUseCase(
    adapters.leadRepository,
    // Reads outside the transaction go through the tenant-scoped client.
    new PrismaConversionUndoAdapter(getTenantContext(ctx).prismaWithTenant),
    adapters.eventBus,
    adapters.transactionManager
  );
}

function toTrpcError(error: { message: string; name?: string }): TRPCError {
  const message = error.message;
  if (message.includes('not found')) return new TRPCError({ code: 'NOT_FOUND', message });
  if (message.startsWith('Failed to undo')) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'The conversion could not be undone. Try again.',
    });
  }
  return new TRPCError({ code: 'BAD_REQUEST', message });
}

export const conversionUndoRouter = createTRPCRouter({
  status: tenantProcedure.input(dealInput).query(async ({ ctx, input }) => {
    const { tenant } = getTenantContext(ctx);
    const result = await buildUseCase(ctx).check({
      opportunityId: input.opportunityId,
      tenantId: tenant.tenantId,
    });
    if (result.isFailure) throw toTrpcError(result.error);
    return result.value;
  }),

  undo: tenantProcedure.input(dealInput).mutation(async ({ ctx, input }) => {
    const { tenant } = getTenantContext(ctx);
    const result = await buildUseCase(ctx).execute({
      opportunityId: input.opportunityId,
      tenantId: tenant.tenantId,
      undoneBy: tenant.userId,
    });
    if (result.isFailure) throw toTrpcError(result.error);
    return result.value;
  }),
});
