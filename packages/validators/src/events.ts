/**
 * Event Validation Schemas
 *
 * Zod schemas for validating domain event payloads and metadata.
 * Based on contracts-v1.yaml specification.
 *
 * @task IFC-150
 * @phase Phase 3 REFACTOR - Step 3.2
 */

import { z } from 'zod';

/** Zod v4 replacement for z.SafeParseReturnType */
type SafeParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };

// ============================================================================
// Event Metadata Schema
// ============================================================================

/**
 * Event metadata schema following contracts-v1.yaml
 */
export const eventMetadataSchema = z.object({
  correlationId: z.string().min(1, 'Correlation ID is required'),
  causationId: z.string().optional(),
  userId: z.string().optional(),
  tenantId: z.string().optional(),
  timestamp: z.string().datetime({ message: 'Invalid ISO 8601 timestamp' }),
  version: z.string().default('1.0'),
  idempotencyKey: z.string().optional(),
});

export type EventMetadataInput = z.input<typeof eventMetadataSchema>;
export type EventMetadataOutput = z.output<typeof eventMetadataSchema>;

// ============================================================================
// Base Event Schema
// ============================================================================

/**
 * Base domain event schema
 */
export const baseDomainEventSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]{8,}$/)
    .optional(),
  eventType: z
    .string()
    .min(1)
    .regex(/^[a-z]+\.[a-z_]+$/, {
      message: 'Event type must follow pattern: aggregate.action (e.g., lead.created)',
    }),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  metadata: eventMetadataSchema,
  occurredAt: z.coerce.date(),
  status: z
    .enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'])
    .default('PENDING'),
});

export type BaseDomainEventInput = z.input<typeof baseDomainEventSchema>;
export type BaseDomainEventOutput = z.output<typeof baseDomainEventSchema>;

// ============================================================================
// Outbox Event Schema
// ============================================================================

/**
 * Outbox event schema with retry fields
 */
export const outboxEventSchema = baseDomainEventSchema.extend({
  retryCount: z.number().int().min(0).default(0),
  nextRetryAt: z.coerce.date().optional(),
  lastError: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
});

export type OutboxEventInput = z.input<typeof outboxEventSchema>;
export type OutboxEventOutput = z.output<typeof outboxEventSchema>;

// ============================================================================
// Lead Event Payloads
// ============================================================================

/**
 * LeadCreatedEvent payload schema
 */
export const leadCreatedPayloadSchema = z.object({
  leadId: z.string().min(1),
  email: z.string().email(),
  source: z.string().optional(),
  tenantId: z.string().min(1),
  createdAt: z.coerce.date().optional(),
});

/**
 * LeadScoredEvent payload schema
 */
export const leadScoredPayloadSchema = z.object({
  leadId: z.string().min(1),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1).optional(),
  scoredBy: z.string().optional(),
  scoredAt: z.coerce.date().optional(),
});

/**
 * LeadQualifiedEvent payload schema
 */
export const leadQualifiedPayloadSchema = z.object({
  leadId: z.string().min(1),
  qualifiedBy: z.string().optional(),
  qualifiedAt: z.coerce.date().optional(),
  previousStatus: z.string().optional(),
});

/**
 * LeadConvertedEvent payload schema
 */
export const leadConvertedPayloadSchema = z.object({
  leadId: z.string().min(1),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  convertedBy: z.string().optional(),
  convertedAt: z.coerce.date().optional(),
});

// ============================================================================
// Contact Event Payloads
// ============================================================================

/**
 * ContactCreatedEvent payload schema
 */
export const contactCreatedPayloadSchema = z.object({
  contactId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  tenantId: z.string().min(1),
  createdAt: z.coerce.date().optional(),
});

// ============================================================================
// Event Type Registry
// ============================================================================

/**
 * Registry of event types and their payload schemas
 */
export const eventPayloadSchemas = {
  'lead.created': leadCreatedPayloadSchema,
  'lead.scored': leadScoredPayloadSchema,
  'lead.qualified': leadQualifiedPayloadSchema,
  'lead.converted': leadConvertedPayloadSchema,
  'contact.created': contactCreatedPayloadSchema,
} as const;

export type RegisteredEventType = keyof typeof eventPayloadSchemas;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates event metadata
 *
 * @param metadata - The metadata to validate
 * @returns Validation result with parsed data or errors
 */
export function validateEventMetadata(metadata: unknown): SafeParseResult<EventMetadataOutput> {
  return eventMetadataSchema.safeParse(metadata);
}

/**
 * Validates an event payload based on event type
 *
 * @param eventType - The event type
 * @param payload - The payload to validate
 * @returns Validation result with parsed data or errors
 */
export function validateEventPayload(
  eventType: string,
  payload: unknown
): SafeParseResult<unknown> {
  const schema = eventPayloadSchemas[eventType as RegisteredEventType];

  if (!schema) {
    // Unknown event type - validate as generic record
    return z.record(z.string(), z.unknown()).safeParse(payload);
  }

  return schema.safeParse(payload);
}

/**
 * Validates a complete outbox event
 *
 * @param event - The event to validate
 * @returns Validation result with parsed data or errors
 */
export function validateOutboxEvent(event: unknown): SafeParseResult<OutboxEventOutput> {
  return outboxEventSchema.safeParse(event);
}

/**
 * Type guard for checking if an event type is registered
 *
 * @param eventType - The event type to check
 */
export function isRegisteredEventType(eventType: string): eventType is RegisteredEventType {
  return eventType in eventPayloadSchemas;
}
