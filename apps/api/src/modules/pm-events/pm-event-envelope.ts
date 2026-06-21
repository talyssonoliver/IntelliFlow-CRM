/**
 * PM-event delivery envelope (CRM-PR-A — receiver for the leangency-portal outbox
 * drain, ADR-022). The portal sends a GOVERNED projection of a committed
 * project_events row (visibility already resolved, payload built from scalars). We
 * validate only the MINIMAL envelope the receiver needs; everything else passes
 * through untouched (and is never required).
 *
 * No exotic Zod string-format validators (kept version-robust): explicit regexes.
 */
import { z } from 'zod';

/** event id (uuid) embedded in the delivery identity header. */
export const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The deterministic delivery identity: `pm-outbox:<event_id>:crm`. */
export const IDEMPOTENCY_KEY_RE = /^pm-outbox:([0-9a-fA-F-]{36}):crm$/;

/** Permissive ISO-8601 (date-time, optional fractional seconds, optional offset/Z). */
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export const pmEventEnvelopeSchema = z.object({
  eventId: z.string().regex(UUID_RE),
  category: z.string().min(1),
  type: z.string().min(1),
  occurredAt: z.string().regex(ISO_DATETIME_RE),
  schemaVersion: z.number().int().min(1),
  // NOTE: unknown keys (sequence/tenantSlug/payload/links/…) are STRIPPED by Zod's
  // default object behaviour — we never read them here, and the full body is hashed
  // separately, so nothing is required beyond the five fields above.
});

export type PmEventEnvelope = z.infer<typeof pmEventEnvelopeSchema>;
