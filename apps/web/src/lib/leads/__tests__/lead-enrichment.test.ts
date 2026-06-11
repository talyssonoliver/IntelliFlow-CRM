import { describe, it, expect } from 'vitest';
import {
  deriveWebsiteFromEmail,
  normalizeWebsiteUrl,
  deriveCompanyHint,
  enrichFromEmail,
} from '../lead-enrichment';

describe('deriveWebsiteFromEmail', () => {
  it('returns https://<domain> for a corporate email', () => {
    expect(deriveWebsiteFromEmail('sarah@acme.com')).toBe('https://acme.com');
  });

  it('uses the raw domain verbatim for a subdomain corporate email', () => {
    expect(deriveWebsiteFromEmail('sarah@mail.acme.com')).toBe('https://mail.acme.com');
  });

  it('keeps the full ccSLD domain for the website', () => {
    expect(deriveWebsiteFromEmail('user@acme.co.uk')).toBe('https://acme.co.uk');
  });

  it('is case-insensitive on the domain', () => {
    expect(deriveWebsiteFromEmail('Sarah@ACME.com')).toBe('https://acme.com');
  });

  it.each([
    'x@gmail.com',
    'x@googlemail.com',
    'x@yahoo.com',
    'x@yahoo.co.uk',
    'x@hotmail.com',
    'x@outlook.com',
    'x@live.com',
    'x@msn.com',
    'x@icloud.com',
    'x@me.com',
    'x@aol.com',
    'x@protonmail.com',
    'x@proton.me',
    'x@gmx.com',
    'x@mail.com',
    'x@zoho.com',
  ])('returns null for freemail domain %s', (email) => {
    expect(deriveWebsiteFromEmail(email)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(deriveWebsiteFromEmail('')).toBeNull();
  });

  it('returns null for a string with no @', () => {
    expect(deriveWebsiteFromEmail('notanemail')).toBeNull();
  });

  it('returns null when the local part is empty', () => {
    expect(deriveWebsiteFromEmail('@acme.com')).toBeNull();
  });

  it('returns null when the domain part is empty', () => {
    expect(deriveWebsiteFromEmail('user@')).toBeNull();
  });

  it('returns null when the domain has no dot', () => {
    expect(deriveWebsiteFromEmail('user@localhost')).toBeNull();
  });

  it('trims surrounding whitespace before deriving', () => {
    expect(deriveWebsiteFromEmail('  sarah@acme.com  ')).toBe('https://acme.com');
  });

  it.each([
    'user@acme.com/path',
    'user@acme.com:8080',
    'user@acme.com?q=1',
    'user@acme.com#frag',
    'user@acme.com\\evil',
    'user@-acme.com',
    'user@acme-.com',
    'user@acme..com',
    'user@acme.123',
    'a@b@acme.com',
  ])('returns null for a malformed/URL-syntax domain in %s', (email) => {
    expect(deriveWebsiteFromEmail(email)).toBeNull();
  });

  it('does not leak URL path/port into the derived website', () => {
    // Regression: a domain carrying URL syntax must NOT become https://acme.com/evil
    expect(deriveCompanyHint('user@acme.com/evil')).toBeNull();
  });
});

describe('normalizeWebsiteUrl', () => {
  it('prefixes a bare domain with https://', () => {
    expect(normalizeWebsiteUrl('acme.com')).toBe('https://acme.com');
  });

  it('upgrades http:// to https://', () => {
    expect(normalizeWebsiteUrl('http://acme.com')).toBe('https://acme.com');
  });

  it('keeps https:// as-is', () => {
    expect(normalizeWebsiteUrl('https://acme.com')).toBe('https://acme.com');
  });

  it('strips a trailing slash on the root', () => {
    expect(normalizeWebsiteUrl('https://acme.com/')).toBe('https://acme.com');
  });

  it('preserves a path beyond the root', () => {
    expect(normalizeWebsiteUrl('https://acme.com/en')).toBe('https://acme.com/en');
  });

  it('strips a trailing slash on a subpath too', () => {
    expect(normalizeWebsiteUrl('https://acme.com/en/')).toBe('https://acme.com/en');
  });

  it(
    'strips a huge run of trailing slashes without catastrophic backtracking (ReDoS guard)',
    { timeout: 2000 },
    () => {
      // Complexity check, not a wall-clock microbenchmark: the O(n) scan returns
      // instantly on 1,000,000 trailing slashes, whereas a quadratic implementation
      // (e.g. the old /\/+$/) cannot finish within the generous per-test timeout.
      // The timeout — not a brittle elapsed-ms assertion — is what fails a regression.
      const evil = 'https://acme.com' + '/'.repeat(1_000_000);
      expect(normalizeWebsiteUrl(evil)).toBe('https://acme.com');
    }
  );

  it('returns empty string for empty input', () => {
    expect(normalizeWebsiteUrl('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeWebsiteUrl('   ')).toBe('');
  });

  it('is idempotent on an already-normalized URL', () => {
    expect(normalizeWebsiteUrl(normalizeWebsiteUrl('acme.com'))).toBe('https://acme.com');
  });

  it('upgrades http:// case-insensitively', () => {
    expect(normalizeWebsiteUrl('HTTP://acme.com')).toBe('https://acme.com');
  });
});

describe('deriveCompanyHint', () => {
  it('returns a title-cased company hint from a corporate email', () => {
    expect(deriveCompanyHint('sarah@acme.com')).toBe('Acme');
  });

  it('converts hyphenated domains to spaced title case', () => {
    expect(deriveCompanyHint('user@acme-corp.com')).toBe('Acme Corp');
  });

  it('uses the registrable label for a subdomain email', () => {
    expect(deriveCompanyHint('sarah@mail.acme.com')).toBe('Acme');
  });

  it('uses the registrable label for ccSLD domains (co.uk, com.br)', () => {
    expect(deriveCompanyHint('user@acme.co.uk')).toBe('Acme');
    expect(deriveCompanyHint('user@acme.com.br')).toBe('Acme');
    expect(deriveCompanyHint('sarah@mail.acme.co.uk')).toBe('Acme');
  });

  it('returns null for a freemail email', () => {
    expect(deriveCompanyHint('user@gmail.com')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(deriveCompanyHint('')).toBeNull();
  });

  it('returns null for a string with no @', () => {
    expect(deriveCompanyHint('notanemail')).toBeNull();
  });

  it('returns null when the domain has no dot', () => {
    expect(deriveCompanyHint('user@localhost')).toBeNull();
  });
});

describe('enrichFromEmail', () => {
  it('populates website and company from a corporate email on an empty form', () => {
    const result = enrichFromEmail('sarah@acme.com', {});
    expect(result.website).toBe('https://acme.com');
    expect(result.company).toBe('Acme');
  });

  it('does NOT overwrite a non-empty website', () => {
    const result = enrichFromEmail('sarah@acme.com', { website: 'https://custom.io' });
    expect(result.website).toBe('https://custom.io');
  });

  it('does NOT overwrite a non-empty company', () => {
    const result = enrichFromEmail('sarah@acme.com', { company: 'My Company' });
    expect(result.company).toBe('My Company');
  });

  it('overwrites a whitespace-only website (treated as empty)', () => {
    const result = enrichFromEmail('sarah@acme.com', { website: '   ' });
    expect(result.website).toBe('https://acme.com');
  });

  it('overwrites a whitespace-only company (treated as empty)', () => {
    const result = enrichFromEmail('sarah@acme.com', { company: '  ' });
    expect(result.company).toBe('Acme');
  });

  it('leaves the form unchanged for a freemail email', () => {
    const result = enrichFromEmail('x@gmail.com', {});
    expect(result.website).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  it('leaves the form unchanged for an invalid email', () => {
    const result = enrichFromEmail('notanemail', {});
    expect(result.website).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  it('leaves the form unchanged for an empty email', () => {
    const result = enrichFromEmail('', { company: 'Existing' });
    expect(result.company).toBe('Existing');
    expect(result.website).toBeUndefined();
  });

  it('derives a normalized https website (not a bare domain)', () => {
    const result = enrichFromEmail('sarah@acme.com', {});
    expect(result.website).toBe('https://acme.com');
  });

  it('preserves unrelated fields on the input object', () => {
    const result = enrichFromEmail('sarah@acme.com', { company: 'Keep', website: '' });
    expect(result.company).toBe('Keep');
    expect(result.website).toBe('https://acme.com');
  });

  it('does not mutate the input object', () => {
    const input = { website: '', company: '' };
    const result = enrichFromEmail('sarah@acme.com', input);
    expect(input.website).toBe('');
    expect(input.company).toBe('');
    expect(result).not.toBe(input);
  });
});
