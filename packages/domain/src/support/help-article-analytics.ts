/**
 * Help Article analytics — pure domain helpers (IFC-304 PR A).
 *
 * Privacy-preserving normalization for search-term aggregation. No user or
 * session identity is ever handled here; these functions only shape the raw
 * search string into a safe, groupable bucket key.
 */

/** Max stored length of a normalized search term (matches the DB VarChar). */
export const SEARCH_TERM_MAX_LENGTH = 120;

/** Max accepted length of a caller-supplied idempotency key. */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

/** How long analytics daily aggregates are retained before purge. */
export const ANALYTICS_RETENTION_DAYS = 400;

/** How long an idempotency-guard row lives before it is eligible for purge. */
export const DEDUP_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Token substituted for any detected sensitive value. */
export const REDACTION_TOKEN = '[redacted]';

/**
 * A run of digits and phone-style separators. Deliberately a single character
 * class with a simple `{7,}` quantifier — linear, with no nested/overlapping
 * quantifiers, so it is not vulnerable to catastrophic backtracking (ReDoS).
 * The digit-count guard in the callback decides whether it is actually PII.
 */
const NUMERIC_RUN = /[\d\s()+.-]{7,}/g;

/** Minimum digits in a run for it to count as sensitive (phone/card/SSN-like). */
const NUMERIC_PII_MIN_DIGITS = 7;

/**
 * Normalize a raw search string into a safe aggregation key:
 * trim → collapse internal whitespace → redact PII → lowercase → truncate.
 *
 * Returns `''` when nothing meaningful remains (caller should skip recording).
 */
export function normalizeSearchTerm(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  let term = raw.trim().replace(/\s+/g, ' ');
  if (term.length === 0) return '';

  // Redact email-like tokens (any whitespace-delimited token containing '@')
  // first, using plain string ops — no regex, so no ReDoS surface.
  term = term
    .split(' ')
    .map((token) => (token.includes('@') ? REDACTION_TOKEN : token))
    .join(' ');

  // Redact long numeric sequences (phone/card/SSN-like): only when the run
  // actually contains enough digits — short numbers like "top 10" are kept.
  term = term.replace(NUMERIC_RUN, (match) => {
    const digits = (match.match(/\d/g) ?? []).length;
    return digits >= NUMERIC_PII_MIN_DIGITS ? ` ${REDACTION_TOKEN} ` : match;
  });

  term = term.replace(/\s+/g, ' ').trim().toLowerCase();

  if (term.length > SEARCH_TERM_MAX_LENGTH) {
    term = term.slice(0, SEARCH_TERM_MAX_LENGTH).trimEnd();
  }

  return term;
}

/**
 * Bucket a timestamp to its UTC date-only boundary (midnight UTC), matching the
 * `@db.Date` `day` column. Defaults to "now" only when a date is supplied by the
 * caller — callers in this codebase always pass an explicit `occurredAt`.
 */
export function toUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Compute the purge-eligibility timestamp for an idempotency-guard row. */
export function dedupExpiry(now: Date): Date {
  return new Date(now.getTime() + DEDUP_TTL_MS);
}

/**
 * Oldest UTC day still inside the retention window; aggregates with a `day`
 * strictly before this are eligible for purge.
 */
export function analyticsRetentionCutoff(now: Date): Date {
  const today = toUtcDay(now);
  return new Date(today.getTime() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
