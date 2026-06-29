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
 * NOTE: ipAddress is extracted server-side from x-forwarded-for.
 * tenantId and userId are taken from the session context.
 * acceptedAt is set by the DB @default(now()).
 * None of these may be submitted by the client.
 */
export const acceptTermsInputSchema = z.object({
  termsVersion: z.string().min(1).max(32),
  route: z.string().min(1).max(255),
  // userAgent is the ONLY field the client may optionally provide
  // (from navigator.userAgent on the browser — the server cannot reliably
  // read it from a tRPC JSON body request; headers carry it but the schema
  // allows explicit passing as a belt-and-suspenders approach).
  userAgent: z.string().max(512).optional(),
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
