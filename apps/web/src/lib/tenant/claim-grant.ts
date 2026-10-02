/**
 * `user.claimLoginGrant` for the magic-link callback (ADR-071).
 *
 * The callback runs before the app's tRPC provider has a token, and must make this its FIRST API
 * call after `verifyOtp` (an unclaimed OTP session inside a pinned grant window is blocked with
 * `PIN_PENDING`). So it is a plain fetch with an explicit bearer token, using the wire format
 * the contract fixes: `POST /api/trpc/<proc>`, body = raw input, no transformer.
 *
 * No `x-active-tenant` is sent: the claim is what decides the tenant.
 */

import { isValidTenantId } from './active-tenant';
import type { ClaimLoginGrantOutput } from './memberships';

export class ClaimLoginGrantError extends Error {
  readonly reason: string | null;

  constructor(message: string, reason: string | null) {
    super(message);
    this.name = 'ClaimLoginGrantError';
    this.reason = reason;
  }
}

/** Grant ids are cuids: same character class as tenant ids. */
const GRANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidGrantId(value: unknown): value is string {
  return typeof value === 'string' && GRANT_ID_PATTERN.test(value);
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { message?: unknown; data?: { reason?: unknown } };
}

function reasonOf(envelope: TrpcEnvelope | null): string | null {
  const fromData = envelope?.error?.data?.reason;
  if (typeof fromData === 'string') return fromData;
  const message = envelope?.error?.message;
  if (typeof message === 'string') {
    const match = /^([A-Z_]+):/.exec(message);
    if (match) return match[1];
  }
  return null;
}

/**
 * Claim the grant for the session identified by `accessToken`.
 * Throws `ClaimLoginGrantError` on any failure: the caller must fail closed (an unclaimed
 * pinned session is not allowed to work, and must not be left half signed in).
 */
export async function claimLoginGrant(
  accessToken: string,
  grant: string
): Promise<ClaimLoginGrantOutput> {
  if (!isValidGrantId(grant)) {
    throw new ClaimLoginGrantError('This sign-in link is not valid.', 'GRANT_INVALID');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/trpc/user.claimLoginGrant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ grant }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10_000) : undefined,
    });
  } catch {
    throw new ClaimLoginGrantError('Could not reach the server to finish signing in.', null);
  }

  const envelope = await response
    .json()
    .then((body: unknown) => body as TrpcEnvelope)
    .catch(() => null);

  const data = envelope?.result?.data as Partial<ClaimLoginGrantOutput> | undefined;
  if (!response.ok || !data || !isValidTenantId(data.tenantId)) {
    throw new ClaimLoginGrantError(
      'This sign-in link is invalid or has expired. Please go back to sign in and try again.',
      reasonOf(envelope)
    );
  }

  return {
    tenantId: data.tenantId,
    pinned: data.pinned === true,
    sessionExpiresAt: typeof data.sessionExpiresAt === 'string' ? data.sessionExpiresAt : null,
  };
}
