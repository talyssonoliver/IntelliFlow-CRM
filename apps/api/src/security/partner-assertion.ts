/**
 * Portal login assertion verification (ADR-071, inherited-membership contract section b).
 *
 * The Portal proves WHO is signing in and in which capacity by signing a short-lived compact JWS
 * (Ed25519) per click. A partner API key alone can no longer mint a login link once a partner
 * is enforced (`PARTNER_REQUIRE_ASSERTION`): the key proves "this is the Portal", the assertion
 * proves "the Portal vouches for this person right now".
 *
 * This file is pure (no database, no network): it checks the token's structure, signature,
 * claims and clock. The two stateful checks of the contract (the tenant resolves to the
 * partner's own tenant, and the single-use `jti`) live with the database writes in
 * `modules/partner/login-link.ts`, which runs them in the same transaction as the membership
 * write.
 *
 * Failure policy: every failure throws `AssertionError` carrying an INTERNAL `check` name. The
 * caller maps it to `FORBIDDEN ASSERTION_INVALID` and writes the check into the audit row only;
 * the response never says which check failed (no oracle for a forger).
 *
 * The schemas below mirror `@intelliflow/partner-sdk` (a devDependency of the API, so it cannot
 * be imported at runtime); `partner-assertion.test.ts` asserts the two stay identical.
 */

import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

export const ASSERTION_ALG = 'EdDSA';
export const ASSERTION_TYP = 'intelliflow-assertion+jwt';
export const ASSERTION_AUDIENCE = 'intelliflow-crm';
export const ASSERTION_MAX_TTL_SECONDS = 60;
export const ASSERTION_CLOCK_LEEWAY_SECONDS = 5;
export const ASSERTION_MAX_BYTES = 4096;

const MEMBER_ROLES = ['ADMIN', 'MEMBER'] as const;

export const assertionHeaderSchema = z
  .object({
    alg: z.literal(ASSERTION_ALG),
    typ: z.literal(ASSERTION_TYP),
  })
  .strict();

export const assertionTenantSchema = z
  .object({
    externalRef: z.string().uuid().optional(),
    tenantId: z.string().min(1).optional(),
  })
  .strict()
  .refine((t) => (t.externalRef === undefined) !== (t.tenantId === undefined), {
    message: 'Exactly one of externalRef or tenantId is required',
  });

export const assertionClaimsSchema = z
  .object({
    iss: z.string().min(1).max(60),
    aud: z.literal(ASSERTION_AUDIENCE),
    sub: z
      .string()
      .email()
      .refine((e) => e === e.toLowerCase(), { message: 'sub must be lower-case' }),
    tenant: assertionTenantSchema,
    kind: z.enum(['member', 'staff']),
    role: z.enum(MEMBER_ROLES),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    jti: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  })
  .strict()
  .refine((c) => c.exp > c.iat && c.exp - c.iat <= ASSERTION_MAX_TTL_SECONDS, {
    message: `exp must be after iat and within ${ASSERTION_MAX_TTL_SECONDS}s`,
  });

export type AssertionClaims = z.infer<typeof assertionClaimsSchema>;

/** Internal failure names. Written to the audit row; never returned to the caller. */
export type AssertionFailure =
  | 'malformed'
  | 'too_large'
  | 'bad_header'
  | 'no_public_key'
  | 'bad_public_key'
  | 'bad_signature'
  | 'bad_claims'
  | 'wrong_issuer'
  | 'issued_in_future'
  | 'expired'
  | 'ttl_too_long'
  | 'subject_mismatch'
  | 'tenant_mismatch'
  | 'replayed';

export class AssertionError extends Error {
  constructor(readonly check: AssertionFailure) {
    super(`assertion rejected: ${check}`);
    this.name = 'AssertionError';
  }
}

const B64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string): Buffer {
  // Strict: unpadded base64url only. Padding, whitespace or '+' '/' would let two different
  // strings carry the same signed bytes.
  if (!B64URL_SEGMENT.test(segment)) throw new AssertionError('malformed');
  return Buffer.from(segment, 'base64url');
}

function decodeJson(segment: string, failure: AssertionFailure): unknown {
  try {
    return JSON.parse(decodeSegment(segment).toString('utf8'));
  } catch (err) {
    if (err instanceof AssertionError) throw err;
    throw new AssertionError(failure);
  }
}

/** Parse the partner's stored public key, which must be an Ed25519 SPKI PEM. */
export function parseEd25519PublicKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new AssertionError('bad_public_key');
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new AssertionError('bad_public_key');
  return key;
}

export interface VerifyAssertionInput {
  /** The compact JWS from `issueLoginLink` input. */
  assertion: string;
  /** `partners.assertionPublicKey` of the calling partner, or null when none is registered. */
  publicKeyPem: string | null | undefined;
  /** `partners.slug` of the partner the API key belongs to. */
  partnerSlug: string;
  /** `input.email` of the call; compared after trim + lower-case. */
  email: string;
  /** Injected clock for tests. */
  nowMs?: number;
}

/**
 * Verify steps 1 to 8 of contract section b, in order. Returns the validated claims.
 * Throws `AssertionError` on the first failure. Performs no lookup by the person's identity.
 */
export function verifyAssertion(input: VerifyAssertionInput): AssertionClaims {
  const { assertion } = input;

  // 1. Present, bounded, exactly three segments.
  if (typeof assertion !== 'string' || assertion.length === 0)
    throw new AssertionError('malformed');
  if (Buffer.byteLength(assertion, 'utf8') > ASSERTION_MAX_BYTES) {
    throw new AssertionError('too_large');
  }
  const parts = assertion.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0))
    throw new AssertionError('malformed');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // 2. Header: exactly { alg: EdDSA, typ: intelliflow-assertion+jwt }. No kid/jwk/x5c, so the
  //    token cannot choose its own verification key, and `none`/HS*/RS*/ES* are all rejected.
  const header = assertionHeaderSchema.safeParse(decodeJson(headerB64, 'bad_header'));
  if (!header.success) throw new AssertionError('bad_header');

  // 3. The calling partner has a registered public key.
  if (!input.publicKeyPem) throw new AssertionError('no_public_key');
  const publicKey = parseEd25519PublicKey(input.publicKeyPem);

  // 4. Signature over the exact bytes `<header>.<payload>` as received.
  const signature = decodeSegment(signatureB64);
  if (signature.length !== 64) throw new AssertionError('bad_signature');
  let signatureOk: boolean;
  try {
    signatureOk = cryptoVerify(
      null,
      Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
      publicKey,
      signature
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) throw new AssertionError('bad_signature');

  // 5. Payload shape (strict, no extra claims).
  const parsed = assertionClaimsSchema.safeParse(decodeJson(payloadB64, 'bad_claims'));
  if (!parsed.success) throw new AssertionError('bad_claims');
  const claims = parsed.data;

  // 6. A key registered for partner A can never carry an assertion issued for partner B.
  if (claims.iss !== input.partnerSlug) throw new AssertionError('wrong_issuer');

  // 7. Clock, with a small leeway for skew between the Portal and the API.
  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  if (claims.iat > nowSeconds + ASSERTION_CLOCK_LEEWAY_SECONDS) {
    throw new AssertionError('issued_in_future');
  }
  if (claims.exp < nowSeconds - ASSERTION_CLOCK_LEEWAY_SECONDS) {
    throw new AssertionError('expired');
  }
  if (claims.exp - nowSeconds > ASSERTION_MAX_TTL_SECONDS + ASSERTION_CLOCK_LEEWAY_SECONDS) {
    throw new AssertionError('ttl_too_long');
  }

  // 8. The person the Portal vouched for is the person the link is requested for.
  if (claims.sub !== input.email.trim().toLowerCase()) throw new AssertionError('subject_mismatch');

  return claims;
}

/**
 * Whether a partner must present an assertion to mint a login link.
 * `PARTNER_REQUIRE_ASSERTION`: unset/`0`/`false` = nobody, `1`/`true` = every partner,
 * otherwise a comma-separated list of partner slugs. Anything else non-empty is read as a slug
 * list, so a typo enforces for nobody rather than silently for everybody; use `1` for all.
 */
export function isAssertionRequired(
  partnerSlug: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env.PARTNER_REQUIRE_ASSERTION ?? '').trim().toLowerCase();
  if (raw === '' || raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(partnerSlug.toLowerCase());
}

/** `INHERITED_MEMBERSHIP_ENABLED`: `1`/`true` turns the feature on; anything else is off. */
export function isInheritedMembershipEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.INHERITED_MEMBERSHIP_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true';
}
