/**
 * Public Feedback Router — PG-126
 *
 * Single tRPC mutation (`submit`) for anonymous visitor feedback on the
 * public marketing surface. Uses publicProcedure (no tenant context).
 *
 * Defence-in-depth:
 *   1. Zod validation at the procedure boundary.
 *   2. Honeypot rejection (hidden field `__honeypot` must be empty).
 *   3. Per-IP-hash rate limit (1 request / 10 min) via PublicRateLimiter.
 *   4. Service layer strips honeypot before persistence.
 */
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import { publicFeedbackInputSchema } from '@intelliflow/validators';
import type { Context } from '../../context';
import {
  publicFeedbackLimiter,
  PublicRateLimiter,
} from '../../security/public-rate-limiter';

/**
 * Best-effort client IP extraction from a fetch-style Request. Falls back to
 * 'unknown' — in which case every unknown-IP request lands in the same
 * rate-limit bucket (intentional: suspicious traffic is throttled harder,
 * not less).
 */
export function extractClientIp(req: Request | undefined): string {
  if (!req) return 'unknown';
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function getPublicFeedbackService(ctx: Context) {
  const service = (ctx.services as { publicFeedback?: unknown } | undefined)
    ?.publicFeedback;
  if (!service) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Public feedback service not available.',
    });
  }
  return service as {
    submit(
      input: import('@intelliflow/validators').PublicFeedbackInput,
      ipHash: string
    ): Promise<{ success: true; id: string }>;
  };
}

export const publicFeedbackRouter = createTRPCRouter({
  submit: publicProcedure
    .input(publicFeedbackInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Honeypot trip — reject before persistence. Schema already enforces
      // the literal empty string, but we keep this as a defence-in-depth
      // check for historical reasons / safety nets.
      if (input.__honeypot !== undefined && input.__honeypot !== '') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Honeypot tripped.',
        });
      }

      const salt = process.env.PUBLIC_FEEDBACK_IP_SALT ?? 'pg-126-default-salt';
      const ipHash = PublicRateLimiter.hashIp(
        extractClientIp(ctx.req),
        salt
      );

      publicFeedbackLimiter.check(ipHash);

      const service = getPublicFeedbackService(ctx);
      const { __honeypot: _honey, ...cleanInput } = input;
      return service.submit(cleanInput, ipHash);
    }),
});
