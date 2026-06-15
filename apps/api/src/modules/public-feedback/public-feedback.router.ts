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
import { publicFeedbackLimiter, PublicRateLimiter } from '../../security/public-rate-limiter';
import { pickTrustedForwardedIp } from '../../security/client-ip';

/**
 * Best-effort client IP extraction from a fetch-style Request. Falls back to
 * 'unknown' — in which case every unknown-IP request lands in the same
 * rate-limit bucket (intentional: suspicious traffic is throttled harder,
 * not less).
 *
 * Trust model: x-forwarded-for is a comma-separated list of IPs appended by
 * each proxy hop ("client, proxy1, proxy2, …, edge"). The RIGHTMOST value is
 * set by our platform's edge proxy (Railway / Vercel / nginx) and cannot be
 * forged by the client. Using the leftmost value would let an attacker inject
 * an arbitrary IP and bypass the per-IP rate limiter. We therefore take the
 * last (rightmost) non-empty entry. If the header is absent, we fall back to
 * x-real-ip (also set by the edge), then 'unknown'.
 */
export function extractClientIp(req: Request | undefined): string {
  if (!req) return 'unknown';
  // Take the rightmost (edge-set, trusted) x-forwarded-for hop, then x-real-ip.
  return (
    pickTrustedForwardedIp(req.headers.get('x-forwarded-for')) ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function getPublicFeedbackService(ctx: Context) {
  const service = (ctx.services as { publicFeedback?: unknown } | undefined)?.publicFeedback;
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
  submit: publicProcedure.input(publicFeedbackInputSchema).mutation(async ({ ctx, input }) => {
    // Honeypot trip — reject before persistence. Schema already enforces
    // the literal empty string, but we keep this as a defence-in-depth
    // check for historical reasons / safety nets.
    if (input.__honeypot !== undefined && input.__honeypot !== '') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Honeypot tripped.',
      });
    }

    // PG-126: IP hashing salt.
    // PROD → must be set, or the endpoint refuses to persist submissions so
    // hashed IPs can't be rainbow-tabled back to raw IPs via a
    // public-in-repo salt.
    // TEST/DEV → fall back to a local development salt so the widget is
    // runnable out of the box.
    const salt = process.env.PUBLIC_FEEDBACK_IP_SALT;
    if (!salt && process.env.NODE_ENV === 'production') {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Public feedback is disabled: PUBLIC_FEEDBACK_IP_SALT is not configured.',
      });
    }
    const ipHash = PublicRateLimiter.hashIp(
      extractClientIp(ctx.req),
      salt ?? 'pg-126-dev-salt-NEVER-USE-IN-PROD'
    );

    publicFeedbackLimiter.check(ipHash);

    const service = getPublicFeedbackService(ctx);
    const { __honeypot: _honey, ...cleanInput } = input;
    return service.submit(cleanInput, ipHash);
  }),
});
