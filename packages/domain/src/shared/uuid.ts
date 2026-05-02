/**
 * UUID utilities — Node-builtin replacement for the `uuid` npm package.
 *
 * `node:crypto.randomUUID()` produces RFC 4122 v4 UUIDs and ships in every
 * supported Node version (>= 16.7). Switching off the npm `uuid` package
 * eliminates a transitive CVE surface (GHSA-w5hq-g745-h8pq for <14) AND
 * removes the ESM/CJS interop friction that breaks tsup DTS in Node16
 * module-resolution mode.
 */
import { randomUUID } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{8,}$/;

/**
 * Generate a new RFC 4122 v4 UUID.
 */
export function generateUuid(): string {
  return randomUUID();
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
