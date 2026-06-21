/**
 * Pure PM-event receiver handler (CRM-PR-A). Ingestion-only: validate auth + the
 * deterministic delivery key + the minimal envelope, then persist ONE idempotent
 * ledger row. No business workflow is triggered.
 *
 * Returns aggregate/safe output only — `{ accepted, duplicate?, error? }`. Never a raw
 * payload, tenant id, secret, stack trace, or raw DB message. Status-code mapping is
 * aligned to the portal drain's retry classification (2xx=sent, 4xx≠408/425/429=dead,
 * 429/5xx=retryable). See docs/pm/crm-pm-event-receiver-contract.md.
 */
import { createHash } from 'node:crypto';
import { IDEMPOTENCY_KEY_RE, pmEventEnvelopeSchema } from './pm-event-envelope';
import type { InboundPmEventStore } from './inbound-store';

export interface ProcessPmEventInput {
  authorizationHeader: string | null;
  idempotencyKey: string | null;
  rawBody: string;
  store: InboundPmEventStore;
  /** process.env.PORTAL_INTERNAL_SECRET — the existing shared server-to-server secret. */
  secret: string | undefined;
  now?: () => Date;
}

export type SafeErrorCode = 'unauthorized' | 'malformed' | 'invalid_envelope' | 'store_unavailable';

export interface ProcessPmEventResult {
  statusCode: number;
  body: { accepted: boolean; duplicate?: boolean; error?: SafeErrorCode };
}

const ok = (statusCode: number, duplicate: boolean): ProcessPmEventResult => ({
  statusCode,
  body: { accepted: true, duplicate },
});
const err = (statusCode: number, error: SafeErrorCode): ProcessPmEventResult => ({
  statusCode,
  body: { accepted: false, error },
});

export async function processPmEvent(input: ProcessPmEventInput): Promise<ProcessPmEventResult> {
  const now = input.now ?? (() => new Date());

  // 1. Server misconfig (not the caller's fault) → retryable 503.
  const secret = input.secret?.trim();
  if (!secret || secret.length < 16) return err(503, 'store_unavailable');

  // 2. Bearer auth — non-retryable 401.
  const parts = (input.authorizationHeader ?? '').split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || parts[1] !== secret) {
    return err(401, 'unauthorized');
  }

  // 3. Deterministic delivery key — non-retryable 400 on missing/random/malformed.
  const keyMatch = (input.idempotencyKey ?? '').match(IDEMPOTENCY_KEY_RE);
  if (!keyMatch) return err(400, 'malformed');
  const keyEventId = keyMatch[1].toLowerCase();

  // 4. Parse + validate the minimal envelope.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return err(400, 'malformed');
  }
  const env = pmEventEnvelopeSchema.safeParse(parsed);
  if (!env.success) return err(422, 'invalid_envelope');
  // The key's event id MUST match the body — the delivery identity must agree.
  if (env.data.eventId.toLowerCase() !== keyEventId) return err(400, 'malformed');

  // 5. Idempotent persist (minimal envelope + payload hash; NOT the full payload).
  const idempotencyKey = input.idempotencyKey as string;
  try {
    const existing = await input.store.get(idempotencyKey);
    if (existing) return ok(200, true);

    const { created } = await input.store.put({
      idempotencyKey,
      eventId: env.data.eventId,
      category: env.data.category,
      type: env.data.type,
      occurredAt: env.data.occurredAt,
      receivedAt: now().toISOString(),
      processingStatus: 'received',
      payloadHash: createHash('sha256').update(input.rawBody).digest('hex'),
    });
    // created:false ⇒ a concurrent delivery won the unique race → treat as duplicate.
    return created ? ok(202, false) : ok(200, true);
  } catch {
    // Transient store/db failure → retryable 503 (no raw error surfaced).
    return err(503, 'store_unavailable');
  }
}
