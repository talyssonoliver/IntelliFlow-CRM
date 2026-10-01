/**
 * Test fixtures for Portal login assertions (ADR-071): a throwaway Ed25519 key pair and a signer
 * that can also produce deliberately broken tokens (wrong algorithm, extra header fields,
 * tampered payload) for the verification tests.
 */

import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import type { AssertionClaims } from '../security/partner-assertion';

export const EXTERNAL_REF = '3f2b8c1e-5a7d-4e29-9b64-0c1d2e3f4a5b';

export interface TestKeyPair {
  publicKeyPem: string;
  privateKey: KeyObject;
}

export function newKeyPair(): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privateKey,
  };
}

export function newRsaPublicKeyPem(): string {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return publicKey.export({ type: 'spki', format: 'pem' }) as string;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export const VALID_HEADER = { alg: 'EdDSA', typ: 'intelliflow-assertion+jwt' } as const;

export function randomJti(): string {
  return b64url(randomBytes(18));
}

/** Valid member claims for `alice@client.test`, issued now, valid 30 s. */
export function claimsFor(
  overrides: Partial<Record<keyof AssertionClaims, unknown>> = {},
  nowMs: number = Date.now()
): AssertionClaims {
  const iat = Math.floor(nowMs / 1000);
  return {
    iss: 'leangency',
    aud: 'intelliflow-crm',
    sub: 'alice@client.test',
    tenant: { externalRef: EXTERNAL_REF },
    kind: 'member',
    role: 'MEMBER',
    iat,
    exp: iat + 30,
    jti: randomJti(),
    ...overrides,
  } as AssertionClaims;
}

export interface SignOptions {
  header?: Record<string, unknown>;
  /** Replace the payload segment AFTER signing (tamper). */
  tamperPayload?: Record<string, unknown>;
  /** Raw signature bytes instead of a real one. */
  signature?: Buffer;
  /** Raw payload segment text instead of JSON. */
  rawPayload?: string;
  /** Raw header segment text instead of JSON. */
  rawHeader?: string;
}

export function signAssertion(
  claims: unknown,
  privateKey: KeyObject,
  options: SignOptions = {}
): string {
  const headerSeg = options.rawHeader ?? b64url(JSON.stringify(options.header ?? VALID_HEADER));
  const payloadSeg = options.rawPayload ?? b64url(JSON.stringify(claims));
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const signature = options.signature ?? sign(null, Buffer.from(signingInput), privateKey);
  const finalPayload = options.tamperPayload
    ? b64url(JSON.stringify(options.tamperPayload))
    : payloadSeg;
  return `${headerSeg}.${finalPayload}.${b64url(signature)}`;
}

/** Re-import a PEM private key (used to prove PKCS8 round-trips as the Portal stores it). */
export function privateKeyFromPem(pem: string): KeyObject {
  return createPrivateKey(pem);
}
