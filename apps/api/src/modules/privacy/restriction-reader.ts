/**
 * The processing-restriction reader for a request (PG-203, owner Q18).
 *
 * Production contexts carry the container's adapter; a context built without it (scripts,
 * narrow tests) gets one on the request's own Prisma client, so a check is never skipped.
 */
import { PrismaProcessingRestrictionRepository } from '@intelliflow/adapters';
import type { ProcessingRestrictionPort } from '@intelliflow/application';
import type { Context } from '../../context';
import type { RestrictionReader } from '../lead/lead-scoring-enqueue';

/** IFC-315: reads which recipients objected to direct marketing. */
export type MarketingObjectionReader = Pick<ProcessingRestrictionPort, 'marketingBlocked'>;

function repository(
  ctx: Pick<Context, 'adapters' | 'prisma'>
): RestrictionReader & MarketingObjectionReader {
  return (
    ctx.adapters?.processingRestrictionRepository ??
    new PrismaProcessingRestrictionRepository(ctx.prisma)
  );
}

export function restrictionReader(ctx: Pick<Context, 'adapters' | 'prisma'>): RestrictionReader {
  return repository(ctx);
}

export function marketingObjectionReader(
  ctx: Pick<Context, 'adapters' | 'prisma'>
): MarketingObjectionReader {
  return repository(ctx);
}
