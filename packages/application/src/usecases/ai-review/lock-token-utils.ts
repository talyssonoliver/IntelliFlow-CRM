/**
 * Lock Token Utilities (IFC-177)
 *
 * Shared utilities for generating and verifying HMAC-signed lock tokens.
 * Used across review use cases for cryptographic operation verification.
 *
 * @module lock-token-utils
 * @implements IFC-177
 */

import crypto from 'node:crypto';

/**
 * Generate a cryptographically secure lock token
 * Format: {random32bytes_hex}.{hmac_sha256_signature}
 *
 * @param secret - The HMAC secret key
 * @returns A signed lock token string
 */
export function generateLockToken(secret: string): string {
  const value = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${signature}`;
}

/**
 * Verify a lock token using HMAC with timing-safe comparison.
 * Prevents timing attacks by using constant-time comparison.
 *
 * @param providedToken - The token to verify
 * @param secret - The HMAC secret key used for signing
 * @returns true if the token is valid, false otherwise
 */
export function verifyLockToken(providedToken: string, secret: string): boolean {
  const parts = providedToken.split('.');
  if (parts.length !== 2) return false;

  const [value, providedSig] = parts;
  if (!value || !providedSig) return false;

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(value).digest('hex');

    const providedSigBuf = Buffer.from(providedSig, 'hex');
    const expectedSigBuf = Buffer.from(expectedSig, 'hex');

    if (providedSigBuf.length !== expectedSigBuf.length) return false;

    return crypto.timingSafeEqual(providedSigBuf, expectedSigBuf);
  } catch {
    return false;
  }
}
