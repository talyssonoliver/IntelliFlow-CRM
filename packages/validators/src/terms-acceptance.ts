/**
 * Terms Acceptance Validator Schemas — IFC-309
 *
 * IMPORTANT: acceptedAt, ipAddress, tenantId, userId are NEVER accepted
 * as client input — they are server-set only (AC-003, AC-004, AC-005).
 */

import { z } from 'zod';

/**
 * Input schema for the `termsAcceptance.accept` mutation.
 *
 * NOTE: acceptedAt, ipAddress, userAgent, tenantId, and userId are ALL
 * server-set only — they are NEVER accepted from client input.
 * - acceptedAt: set by DB @default(now())
 * - ipAddress: extracted server-side from x-forwarded-for header
 * - userAgent: extracted server-side from user-agent request header
 * - tenantId/userId: taken from the session context (ctx.tenant/ctx.user)
 */
export const acceptTermsInputSchema = z.object({
  termsVersion: z.string().min(1).max(32),
  route: z.string().min(1).max(255),
});

/**
 * Input schema for the `termsAcceptance.getAcceptance` query.
 */
export const getAcceptanceInputSchema = z.object({
  termsVersion: z.string().min(1).max(32),
});

/**
 * Output schema for `termsAcceptance.accept` (mutation success).
 */
export const acceptTermsOutputSchema = z.object({
  accepted: z.literal(true),
  acceptedAt: z.date(),
});

/**
 * Output schema for `termsAcceptance.getAcceptance` (query response).
 */
export const getAcceptanceOutputSchema = z.object({
  accepted: z.boolean(),
  acceptedAt: z.date().nullable(),
});

export type AcceptTermsInput = z.infer<typeof acceptTermsInputSchema>;
export type GetAcceptanceInput = z.infer<typeof getAcceptanceInputSchema>;
export type AcceptTermsOutput = z.infer<typeof acceptTermsOutputSchema>;
export type GetAcceptanceOutput = z.infer<typeof getAcceptanceOutputSchema>;
