/**
 * Event Metadata Helper
 *
 * Provides utilities for building consistent event metadata
 * across all event publishing operations.
 *
 * @task IFC-150
 * @phase Phase 3 REFACTOR - Step 3.1
 */

/**
 * Context accessors for correlation and tenant information.
 */
export interface ContextAccessors {
  getCorrelationId(): string | undefined;
  getCausationId(): string | undefined;
  getUserId(): string | undefined;
  getTenantId(): string | undefined;
}

/**
 * Event metadata structure following contracts-v1.yaml
 */
export interface EventMetadata {
  correlationId: string;
  causationId?: string;
  userId?: string;
  tenantId?: string;
  timestamp: string;
  version: string;
  idempotencyKey?: string;
}

/**
 * Default context accessors that return undefined.
 * Replace with actual implementation in production.
 */
export const defaultContextAccessors: ContextAccessors = {
  getCorrelationId: () => undefined,
  getCausationId: () => undefined,
  getUserId: () => undefined,
  getTenantId: () => undefined,
};

/**
 * Builds event metadata with consistent structure.
 *
 * @param context - Context accessors for correlation IDs
 * @param fallbackCorrelationId - Fallback if context doesn't provide one
 * @param idempotencyKey - Optional idempotency key for deduplication
 * @param version - Event schema version (default: '1.0')
 */
export function buildEventMetadata(
  context: ContextAccessors,
  fallbackCorrelationId: string,
  idempotencyKey?: string,
  version = '1.0'
): EventMetadata {
  return {
    correlationId: context.getCorrelationId() ?? fallbackCorrelationId,
    causationId: context.getCausationId(),
    userId: context.getUserId(),
    tenantId: context.getTenantId(),
    timestamp: new Date().toISOString(),
    version,
    idempotencyKey,
  };
}

/**
 * Generates an idempotency key for an event.
 *
 * Pattern from contracts-v1.yaml: "{eventType}:{aggregateId}:{eventId}"
 *
 * @param eventType - The event type (e.g., 'lead.created')
 * @param aggregateId - The aggregate ID
 * @param eventId - The unique event ID
 */
export function generateIdempotencyKey(
  eventType: string,
  aggregateId: string,
  eventId: string
): string {
  return `${eventType}:${aggregateId}:${eventId}`;
}

/**
 * Extracts aggregate type from event type.
 *
 * e.g., "lead.created" -> "Lead"
 *
 * @param eventType - The event type string
 */
export function extractAggregateType(eventType: string): string {
  const parts = eventType.split('.');
  if (parts.length === 0 || !parts[0]) {
    return 'Unknown';
  }
  // Capitalize first letter: "lead" -> "Lead"
  const type = parts[0];
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Extracts aggregate ID from event payload.
 *
 * Looks for common ID field patterns in order of preference:
 * - {aggregateType}Id (e.g., leadId, contactId)
 * - id
 * - aggregateId
 *
 * @param payload - The event payload
 * @param aggregateType - The aggregate type (lowercase)
 * @param fallbackId - Fallback ID if none found
 */
export function extractAggregateId(
  payload: Record<string, unknown>,
  aggregateType: string,
  fallbackId: string
): string {
  const aggregateIdField = `${aggregateType.toLowerCase()}Id`;
  const toAggregateId = (value: unknown): string => String(value);

  // Try aggregate-specific ID first
  if (payload[aggregateIdField] !== undefined) {
    return toAggregateId(payload[aggregateIdField]);
  }

  // Fall back to common patterns
  if (payload.id !== undefined) {
    return toAggregateId(payload.id);
  }

  if (payload.aggregateId !== undefined) {
    return toAggregateId(payload.aggregateId);
  }

  // Use fallback as last resort
  return fallbackId;
}

/**
 * Validates that required metadata fields are present.
 *
 * @param metadata - The metadata to validate
 * @returns true if valid, false otherwise
 */
export function isValidMetadata(metadata: Partial<EventMetadata>): metadata is EventMetadata {
  return (
    typeof metadata.correlationId === 'string' &&
    metadata.correlationId.length > 0 &&
    typeof metadata.timestamp === 'string' &&
    typeof metadata.version === 'string'
  );
}
