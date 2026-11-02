/**
 * DSAR single-use tokens and keyed hashes (PG-203, spec security should-fix 1).
 *
 * Tokens are 32 random bytes (43 base64url characters). Only their HMAC-SHA256 is stored,
 * under a key derived from the booking salt: HMAC(BOOKING_IP_SALT, 'dsar-token-v1').
 * Rotating the salt therefore invalidates every outstanding link and resets the caps.
 * Comparisons are constant time, and an unknown or cleared stored hash is compared against
 * a dummy so a miss costs the same as a hit.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DsarTokenPort } from '@intelliflow/application';
import { getBookingSalt, normalizeEmailForCap } from '../calendar/booking-abuse';

const KEY_LABEL = 'dsar-token-v1';
const CAP_PREFIX = 'cap:';
const TOKEN_BYTES = 32;

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** The salt is read per call: a missing production salt fails that request, never startup. */
export function createDsarTokenPort(salt: () => string = getBookingSalt): DsarTokenPort {
  const key = () => createHmac('sha256', salt()).update(KEY_LABEL, 'utf8').digest();

  return {
    issue() {
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      return { token, hash: hmacHex(key(), token) };
    },

    matches(token: string, storedHash: string | null): boolean {
      const k = key();
      const presented = Buffer.from(hmacHex(k, token), 'hex');
      const expected = Buffer.from(storedHash ?? hmacHex(k, `dummy:${token}`), 'hex');
      if (expected.length !== presented.length) return false;
      return timingSafeEqual(presented, expected) && storedHash !== null;
    },

    capEmailHash(email: string): string {
      return hmacHex(key(), CAP_PREFIX + normalizeEmailForCap(email));
    },
  };
}
