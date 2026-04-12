/**
 * DSAR Router — Fix #17
 *
 * Exposes GDPR Data Subject Access Request (DSAR) endpoints via tRPC.
 *
 * IMPLEMENTS: IFC-140 (GDPR Rights Workflow API)
 *
 * Endpoints:
 *   submitDSAR  — public mutation: data subject submits a rights request
 *   getDSARStatus — public query (token-gated): returns status for a request
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import { createDSARWorkflow } from '../../workflow/dsar-workflow';

// ============================================
// Input schemas
// ============================================

/**
 * DSAR request types as defined in GDPR Articles 15-22.
 * Keep aligned with dsarRequestSchema in dsar-workflow.ts.
 */
const dsarTypeSchema = z.enum(['ACCESS', 'ERASURE', 'PORTABILITY', 'RESTRICTION', 'OBJECTION']);

const submitDSARInput = z.object({
  type: dsarTypeSchema,
  email: z.email({ message: 'Valid email address required' }),
  description: z.string().max(2000).optional(),
});

const getDSARStatusInput = z.object({
  requestId: z.string().min(1, 'requestId is required'),
  verificationToken: z.string().min(1, 'verificationToken is required'),
});

// ============================================
// Workflow factory helper
// ============================================

/**
 * Create a DSAR workflow instance wired to the request context's Prisma client.
 * Email and storage services fall back to no-op stubs when adapters are absent
 * so that tests remain easy and the router compiles without optional container
 * keys.
 */
function getDSARWorkflow(ctx: {
  prisma: any;
  adapters?: {
    notificationService?: { send?: (...args: any[]) => Promise<void> };
    storageService?: { upload?: (name: string, content: string) => Promise<string> };
  };
}) {
  // Email service: prefer real adapter, fall back to console-only stub
  const emailService = {
    async send(params: { to: string; subject: string; body: string }): Promise<void> {
      if (ctx.adapters?.notificationService?.send) {
        await ctx.adapters.notificationService.send(params);
      } else {
        console.log('[DSAR] Email (stub):', params.subject, '→', params.to);
      }
    },
  };

  // Storage service: prefer real adapter, fall back to stub
  const storageService = {
    async upload(fileName: string, content: string): Promise<string> {
      if (ctx.adapters?.storageService?.upload) {
        return ctx.adapters.storageService.upload(fileName, content);
      }
      console.log('[DSAR] Storage (stub): would upload', fileName);
      return `pending://${fileName}`;
    },
  };

  return createDSARWorkflow(ctx.prisma, emailService, storageService);
}

// ============================================
// Router
// ============================================

export const dsarRouter = createTRPCRouter({
  /**
   * Submit a DSAR request (public — no auth required)
   *
   * The data subject submits their request. A verification email is sent.
   * Returns the requestId and slaDeadline so the caller can track progress.
   */
  submitDSAR: publicProcedure.input(submitDSARInput).mutation(async ({ ctx, input }) => {
    const workflow = getDSARWorkflow(ctx as any);

    try {
      const state = await workflow.initiateDSAR({
        // Map external enum value to internal workflow enum (lowercase)
        requestType: input.type.toLowerCase() as any,
        subjectId: '00000000-0000-0000-0000-000000000000', // placeholder — real ID resolved via verification
        subjectEmail: input.email,
        requestDetails: input.description,
        preferredFormat: 'json',
      });

      return {
        success: true,
        requestId: state.requestId,
        slaDeadline: state.slaDeadline,
        message: 'Your request has been received. Please check your email to verify your identity.',
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to submit DSAR request. Please try again.',
        cause: error,
      });
    }
  }),

  /**
   * Get DSAR status (public — token-gated)
   *
   * The data subject provides their requestId and the verification token from
   * the email link to check request status.
   */
  getDSARStatus: publicProcedure.input(getDSARStatusInput).query(async ({ ctx, input }) => {
    const workflow = getDSARWorkflow(ctx as any);

    try {
      // Verify the token matches the request before revealing status
      const verified = await workflow.verifyIdentity(input.requestId, input.verificationToken);

      if (!verified) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired verification token',
        });
      }

      const state = await workflow.getStatus(input.requestId);

      return {
        requestId: state.requestId,
        status: state.status,
        slaDeadline: state.slaDeadline,
        verifiedAt: state.verifiedAt ?? null,
        completedAt: state.completedAt ?? null,
        dataExportUrl: state.dataExportUrl ?? null,
        notes: state.notes,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Request not found or verification failed',
        cause: error,
      });
    }
  }),
});
