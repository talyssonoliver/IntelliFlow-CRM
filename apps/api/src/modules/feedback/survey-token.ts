/**
 * Single-use answer link tokens for customer surveys (MVP-012).
 *
 * The token is 32 random bytes (256 bits, base64url). Only its SHA-256 hex is stored, so a database
 * read never yields a working link. Because the token has full entropy a plain SHA-256 is enough
 * (no salt or slow hash is needed against guessing).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long an answer link works. */
export const SURVEY_TOKEN_TTL_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/** 32 bytes in base64url is exactly 43 characters. */
export const SURVEY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSurveyToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSurveyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function surveyTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SURVEY_TOKEN_TTL_DAYS * MS_PER_DAY);
}

/** Constant-time comparison of a presented token with a stored hash. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashSurveyToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
