/**
 * Webhooks Router
 *
 * Provides endpoints for managing webhook integrations:
 * - Receive webhook events from external services
 * - Register webhook sources
 * - Process retries and dead letter queue
 * - Monitor webhook metrics
 *
 * Uses WebhookServicePort from application layer.
 * Handles DuplicateWebhookError and other webhook-specific errors.
 *
 * @implements IFC-144: Webhook Infrastructure with Idempotency and Retries
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from '../../trpc';
import { mapErrorToTRPCError } from '../../shared/error-mapper';
import type { Context } from '../../context';

// ============================================================================
// Input Schemas
// ============================================================================

const webhookPayloadSchema = z.object({
  sourceName: z.string().min(1).max(100),
  rawBody: z.string(),
  headers: z.record(z.string(), z.string()),
  ip: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)
    .optional(),
});

const registerSourceSchema = z.object({
  name: z.string().min(1).max(100),
  secret: z.string().min(1),
  signatureHeader: z.string().default('x-signature'),
  signatureVerifier: z.enum(['hmac-sha256', 'stripe', 'github', 'custom']).default('hmac-sha256'),
  enabled: z.boolean().default(true),
  allowedEvents: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const reprocessDeadLetterSchema = z.object({
  eventId: z.string().min(1),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get webhook service from context
 * In production, this would be injected via DI container
 */
async function getWebhookService(ctx: Context) {
  // Lazy load to avoid circular dependencies
  const adapters = await import('@intelliflow/adapters');
  const WebhookService = (adapters as any).WebhookService;

  if (!WebhookService) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Webhook service not available',
    });
  }

  // In production, retrieve from DI container
  // For now, create instance (stateless service)
  return new WebhookService();
}

// ============================================================================
// Router Implementation
// ============================================================================

export const webhooksRouter = createTRPCRouter({
  /**
   * Handle incoming webhook request
   * Public endpoint - external services call this
   *
   * KPI: Reliability >= 99%, Idempotency >= 100%
   */
  handleWebhook: publicProcedure.input(webhookPayloadSchema).mutation(async ({ ctx, input }) => {
    const service = await getWebhookService(ctx);

    try {
      const result = await service.handleWebhook(
        input.sourceName,
        input.rawBody,
        input.headers,
        input.ip
      );

      if (result.isFailure) {
        // Map domain errors (including DuplicateWebhookError) to TRPC errors
        throw mapErrorToTRPCError(result.error);
      }

      return result.value;
    } catch (error) {
      // Catch and remap any errors
      if (error instanceof TRPCError) {
        throw error;
      }
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Register a new webhook source
   * Admin only (SEC-003): registering a webhook source configures how the
   * platform trusts inbound callers, so it must be gated by adminProcedure
   * (isAuthed + isAdmin), not merely protectedProcedure (any authed user).
   */
  registerSource: adminProcedure.input(registerSourceSchema).mutation(async ({ ctx, input }) => {
    const service = await getWebhookService(ctx);

    try {
      service.registerSource({
        name: input.name,
        secret: input.secret,
        signatureHeader: input.signatureHeader,
        signatureVerifier: input.signatureVerifier,
        enabled: input.enabled,
        allowedEvents: input.allowedEvents,
        metadata: input.metadata,
      });

      return {
        success: true,
        sourceName: input.name,
        message: 'Webhook source registered successfully',
      };
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Unregister a webhook source
   * Admin only (SEC-003): mirrors registerSource — mutating the trusted webhook
   * source registry is an admin operation, gated by adminProcedure.
   */
  unregisterSource: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const service = await getWebhookService(ctx);

      try {
        const success = service.unregisterSource(input.name);

        if (!success) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Webhook source '${input.name}' not found`,
          });
        }

        return {
          success: true,
          message: `Webhook source '${input.name}' unregistered successfully`,
        };
      } catch (error) {
        throw mapErrorToTRPCError(error);
      }
    }),

  /**
   * Get registered webhook sources
   */
  getSources: protectedProcedure.query(async ({ ctx }) => {
    const service = await getWebhookService(ctx);

    try {
      const sources = service.getSources();
      return {
        sources,
        count: sources.length,
      };
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Get webhook metrics
   */
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    const service = await getWebhookService(ctx);

    try {
      const metrics = service.getMetrics();
      return metrics;
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Process pending webhook retries
   * Manual trigger for retry processing
   */
  processRetries: protectedProcedure.mutation(async ({ ctx }) => {
    const service = await getWebhookService(ctx);

    try {
      const result = await service.processRetries();
      return {
        success: true,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      };
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Get dead letter entries
   * Returns failed webhooks that exceeded retry limit
   */
  getDeadLetterEntries: protectedProcedure.query(async ({ ctx }) => {
    const service = await getWebhookService(ctx);

    try {
      const entries = service.getDeadLetterEntries();
      return {
        entries,
        count: entries.length,
      };
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Reprocess a dead letter entry
   * Allows manual retry of failed webhooks
   */
  reprocessDeadLetter: protectedProcedure
    .input(reprocessDeadLetterSchema)
    .mutation(async ({ ctx, input }) => {
      const service = await getWebhookService(ctx);

      try {
        const success = await service.reprocessDeadLetter(input.eventId);

        if (!success) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Dead letter entry '${input.eventId}' not found or could not be reprocessed`,
          });
        }

        return {
          success: true,
          message: 'Dead letter entry reprocessed successfully',
        };
      } catch (error) {
        throw mapErrorToTRPCError(error);
      }
    }),

  /**
   * Cleanup expired idempotency entries
   * Should be called periodically via cron job
   */
  cleanup: protectedProcedure.mutation(async ({ ctx }) => {
    const service = await getWebhookService(ctx);

    try {
      const result = service.cleanup();
      return {
        success: true,
        idempotencyRemoved: result.idempotencyRemoved,
      };
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  }),
});

export type WebhooksRouter = typeof webhooksRouter;
