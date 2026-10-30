/**
 * The processing-restriction reader for a request (PG-203, owner Q18).
 *
 * Production contexts carry the container's adapter; a context built without it (scripts,
 * narrow tests) gets one on the request's own Prisma client, so a check is never skipped.
 */
import { PrismaProcessingRestrictionRepository } from '@intelliflow/adapters';
import type { Context } from '../../context';
import type { RestrictionReader } from '../lead/lead-scoring-enqueue';

export function restrictionReader(ctx: Pick<Context, 'adapters' | 'prisma'>): RestrictionReader {
  return (
    ctx.adapters?.processingRestrictionRepository ??
    new PrismaProcessingRestrictionRepository(ctx.prisma)
  );
}
