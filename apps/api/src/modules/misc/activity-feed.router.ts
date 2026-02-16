/**
 * Activity Feed Router
 * IFC-069: Unified Activity Feed Service
 *
 * Provides unified activity feed across all CRM entities:
 * - Lead activities, contact activities, opportunity events
 * - Ticket activities, emails, calls, chat messages
 *
 * Uses cursor-based pagination with virtual scrolling support.
 * KPIs: Response <500ms for 100+ items, <250ms for cached first page.
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { unifiedFeedQuerySchema, entityFeedQuerySchema } from '@intelliflow/validators';

/**
 * Extract tenantId from context user session.
 */
function getTenantId(ctx: { user?: { tenantId?: string } | null }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Tenant context required for activity feed',
    });
  }
  return tenantId;
}

export const activityFeedRouter = createTRPCRouter({
  /**
   * Get unified activity feed across all CRM entity types.
   * Supports cursor-based infinite scrolling with optional type/source filters.
   */
  getUnifiedFeed: protectedProcedure.input(unifiedFeedQuerySchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const result = await activityFeedService.getUnifiedFeed(tenantId, input.limit, input.cursor, {
      types: input.types,
      sources: input.sources,
      entityType: input.entityType,
      entityId: input.entityId,
      after: input.after,
      before: input.before,
    });

    const duration = performance.now() - startTime;
    if (duration > 500) {
      console.warn(`[activityFeed.getUnifiedFeed] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
    }

    return result;
  }),

  /**
   * Get activity feed for a specific entity (lead, contact, opportunity, ticket).
   * Queries only the relevant source tables for that entity type.
   */
  getEntityFeed: protectedProcedure.input(entityFeedQuerySchema).query(async ({ ctx, input }) => {
    const startTime = performance.now();
    const tenantId = getTenantId(ctx);

    const activityFeedService = ctx.container?.activityFeedService;
    if (!activityFeedService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ActivityFeedService not available in container',
      });
    }

    const result = await activityFeedService.getEntityFeed(
      tenantId,
      input.entityType,
      input.entityId,
      input.limit,
      input.cursor,
      input.types
    );

    const duration = performance.now() - startTime;
    if (duration > 500) {
      console.warn(`[activityFeed.getEntityFeed] SLOW: ${duration.toFixed(2)}ms (target: <500ms)`);
    }

    return result;
  }),
});
