/**
 * Analytics Event Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the analytics event structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Environment
export const environmentSchema = z.enum(['development', 'test', 'staging', 'production']);

// Event context
export const eventContextSchema = z.object({
  environment: environmentSchema,
  app: z.string().optional(),
  sessionId: z.string().optional(),
  subjectId: z.string().optional().describe('Non-PII stable identifier (UUID). Do not use email/name.'),
}).passthrough();

// Main analytics event schema
export const analyticsEventSchema = z.object({
  eventId: z.string().describe('UUIDv4'),
  occurredAt: z.string().datetime(),
  eventName: z.string(),
  context: eventContextSchema,
  properties: z.record(z.string(), z.unknown()).optional().describe('Event-specific fields (must not include PII)'),
});

// Export TypeScript types inferred from Zod schema
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type EventContext = z.infer<typeof eventContextSchema>;
