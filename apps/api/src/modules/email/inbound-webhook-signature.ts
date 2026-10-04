/**
 * Inbound-email webhook signing (SEC-004).
 *
 * Kept free of tRPC/Prisma/adapter imports so every party that must agree on
 * the signature — the router's verify path, the router unit tests and the E2E
 * spec that calls the live endpoint — imports this one implementation and the
 * sign/verify logic can never drift (the QUAL-015 failure mode).
 *
 * @module api/modules/email
 */

import { createHmac } from 'node:crypto';

/** Request header that carries the hex HMAC-SHA256 signature. */
export const INBOUND_EMAIL_SIGNATURE_HEADER = 'x-inbound-email-signature';

/**
 * Deterministic (key-sorted) JSON serialization used as the HMAC signing
 * payload. Sorting keys means the signature does not depend on the field
 * order the calling webhook provider happens to serialize in.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonStringify(v)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Deterministic, locale-INDEPENDENT key ordering (UTF-16 code-unit order,
    // identical to a bare .sort() on strings). A canonical wire form must not
    // depend on the runtime locale, so we do NOT use localeCompare here — an
    // explicit comparator also satisfies sonar typescript:S2871.
    const keys = Object.keys(record).sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compute the hex HMAC-SHA256 signature for an inbound-email webhook payload.
 * Single source of truth for the signing algorithm.
 */
export function computeInboundEmailWebhookSignature(
  input: Record<string, unknown>,
  secret: string
): string {
  return createHmac('sha256', secret).update(canonicalJsonStringify(input)).digest('hex');
}
