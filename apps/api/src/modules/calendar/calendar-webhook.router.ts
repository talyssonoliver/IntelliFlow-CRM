/**
 * Calendar Webhook Management Router (IFC-224)
 *
 * tRPC router for authenticated calendar webhook management endpoints.
 * Provides sync status, manual sync trigger, and subscription listing.
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const providerInput = z.object({
  provider: z.enum(['google', 'microsoft']),
});

export const calendarWebhooksRouter = createTRPCRouter({
  getSyncStatus: protectedProcedure
    .input(providerInput)
    .query(async ({ input }) => {
      return {
        provider: input.provider,
        status: 'stub' as const,
        lastSyncAt: null as Date | null,
        pendingOperations: 0,
      };
    }),

  triggerSync: protectedProcedure
    .input(providerInput)
    .mutation(async ({ input }) => {
      return {
        provider: input.provider,
        triggered: true,
        message: 'Sync queued (stub — CalendarSyncService not yet implemented)',
      };
    }),

  listRegistrations: protectedProcedure
    .query(async () => {
      return {
        registrations: [] as Array<{
          id: string;
          provider: 'google' | 'microsoft';
          callbackUrl: string;
          expiresAt: Date | null;
        }>,
      };
    }),
});

export type CalendarWebhooksRouter = typeof calendarWebhooksRouter;
