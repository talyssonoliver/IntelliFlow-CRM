import { describe, it, expect } from 'vitest';
import {
  normalizeSearchTerm,
  toUtcDay,
  dedupExpiry,
  analyticsRetentionCutoff,
  SEARCH_TERM_MAX_LENGTH,
  ANALYTICS_RETENTION_DAYS,
  DEDUP_TTL_MS,
  REDACTION_TOKEN,
} from '../help-article-analytics';

describe('normalizeSearchTerm', () => {
  it('trims, collapses whitespace, and lowercases', () => {
    expect(normalizeSearchTerm('  How   TO   Reset  ')).toBe('how to reset');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeSearchTerm(undefined)).toBe('');
    expect(normalizeSearchTerm(null)).toBe('');
    expect(normalizeSearchTerm(42)).toBe('');
    expect(normalizeSearchTerm({})).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeSearchTerm('   ')).toBe('');
    expect(normalizeSearchTerm('')).toBe('');
  });

  it('groups case/whitespace variants to the same key', () => {
    expect(normalizeSearchTerm('Billing FAQ')).toBe(normalizeSearchTerm('  billing   faq '));
  });

  it('redacts email addresses', () => {
    const out = normalizeSearchTerm('contact john.doe@example.com about refund');
    expect(out).toContain(REDACTION_TOKEN);
    expect(out).not.toContain('john.doe@example.com');
    expect(out).toContain('refund');
  });

  it('redacts long digit runs (phone / card / ssn)', () => {
    expect(normalizeSearchTerm('call 020 7946 0958')).not.toMatch(/\d{4}/);
    expect(normalizeSearchTerm('card 4111 1111 1111 1111')).toContain(REDACTION_TOKEN);
    expect(normalizeSearchTerm('4111111111111111')).toBe(REDACTION_TOKEN);
  });

  it('keeps short numbers that are not sensitive', () => {
    // "top 10" — a 2-digit number is below the 7-digit redaction threshold
    expect(normalizeSearchTerm('top 10 articles')).toBe('top 10 articles');
  });

  it('truncates to the max length', () => {
    const long = 'a'.repeat(SEARCH_TERM_MAX_LENGTH + 50);
    const out = normalizeSearchTerm(long);
    expect(out.length).toBe(SEARCH_TERM_MAX_LENGTH);
  });
});

describe('toUtcDay', () => {
  it('reduces a timestamp to midnight UTC', () => {
    const d = toUtcDay(new Date('2026-07-26T14:37:22.123Z'));
    expect(d.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });

  it('buckets two times on the same UTC day equally', () => {
    const a = toUtcDay(new Date('2026-07-26T00:00:01Z'));
    const b = toUtcDay(new Date('2026-07-26T23:59:59Z'));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe('dedupExpiry', () => {
  it('adds the TTL to now', () => {
    const now = new Date('2026-07-26T10:00:00Z');
    expect(dedupExpiry(now).getTime()).toBe(now.getTime() + DEDUP_TTL_MS);
  });
});

describe('analyticsRetentionCutoff', () => {
  it('is the retention window before today (UTC, date-only)', () => {
    const now = new Date('2026-07-26T10:00:00Z');
    const cutoff = analyticsRetentionCutoff(now);
    const expected = new Date(
      Date.UTC(2026, 6, 26) - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    expect(cutoff.getTime()).toBe(expected.getTime());
    expect(cutoff.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
  });
});
