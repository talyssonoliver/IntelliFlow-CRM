/**
 * UUID utilities — replacement for the `uuid` npm package.
 *
 * `crypto.randomUUID()` (Web Crypto, a global in every browser and in Node >= 19) produces RFC 4122
 * v4 UUIDs. Switching off the npm `uuid` package eliminates a transitive CVE surface
 * (GHSA-w5hq-g745-h8pq for <14) AND removes the ESM/CJS interop friction that breaks tsup DTS in
 * Node16 module-resolution mode.
 *
 * It must NOT import `node:crypto`. This package is shared with the browser (the ID classes are in
 * the domain barrel the web app imports), and a `node:crypto` import makes the web bundler ship a
 * `crypto-browserify` polyfill (about 400 KB with its stream, util and vm shims, the last of which
 * calls `eval`, which a strict Content-Security-Policy reports on every page load).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{8,}$/;

/**
 * Generate a new RFC 4122 v4 UUID from the platform's secure random source (never Math.random).
 */
export function generateUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === 'function') {
    // An older runtime without randomUUID: build the v4 UUID from secure random bytes.
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('No secure random source is available to generate a UUID');
}

/**
 * Validate that a string is a well-formed RFC 4122 UUID (v1–v5 accepted to
 * match the broad behaviour of `uuid.validate`).
 */
export function isValidUuid(value: string): boolean {
  if (typeof value !== 'string') return false;
  return UUID_RE.test(value);
}

/**
 * Validate that a string is a Prisma cuid (the format produced by
 * `@default(cuid())`). Mirrors the cuid regex used by the Zod validator
 * package — keep the two in sync.
 */
export function isValidCuid(value: string): boolean {
  if (typeof value !== 'string') return false;
  return CUID_RE.test(value);
}

/**
 * Validate that a string is an acceptable persisted entity identifier.
 * Accepts either an RFC 4122 UUID (used by seed data and some seeded
 * fixtures) or a Prisma cuid (the default for `@id @default(cuid())`).
 * Mirrors `idSchema` in `@intelliflow/validators` — see the comment in
 * `packages/validators/src/common.ts` for the policy.
 */
export function isValidEntityId(value: string): boolean {
  return isValidUuid(value) || isValidCuid(value);
}
