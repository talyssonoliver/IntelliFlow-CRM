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
