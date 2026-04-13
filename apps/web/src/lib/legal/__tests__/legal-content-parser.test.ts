// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Stub server-only so the module can be imported in tests
vi.mock('server-only', () => ({}));

import {
  slugify,
  parseLegalFrontmatter,
  parseLegalSections,
  formatLegalDate,
  resolveLegalContentPath,
} from '../legal-content-parser';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Acceptance of Terms')).toBe('acceptance-of-terms');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---Hello World---')).toBe('hello-world');
  });

  it('collapses multiple non-alphanumeric characters', () => {
    expect(slugify('Foo & Bar / Baz')).toBe('foo-bar-baz');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('parseLegalFrontmatter', () => {
  const validFrontmatter = [
    '---',
    'title: Test Document',
    'version: v1.0.0',
    'effectiveDate: 2026-01-01',
    'contactEmail: test@example.com',
    'summary:',
    '  - First point',
    '  - Second point',
    '---',
    '',
    'Body content here.',
  ].join('\n');

  it('parses all metadata fields from valid frontmatter', () => {
    const { metadata } = parseLegalFrontmatter(validFrontmatter, 'Test');
    expect(metadata.title).toBe('Test Document');
    expect(metadata.version).toBe('v1.0.0');
    expect(metadata.effectiveDate).toBe('2026-01-01');
    expect(metadata.contactEmail).toBe('test@example.com');
    expect(metadata.summary).toEqual(['First point', 'Second point']);
  });

  it('returns the body after frontmatter closing', () => {
    const { body } = parseLegalFrontmatter(validFrontmatter, 'Test');
    expect(body).toBe('Body content here.');
  });

  it('throws when frontmatter opening delimiter is missing', () => {
    expect(() => parseLegalFrontmatter('No frontmatter', 'Test')).toThrow(
      'Test content is missing frontmatter.'
    );
  });

  it('throws when frontmatter closing delimiter is missing', () => {
    const unterminated = '---\ntitle: Broken\nNo closing delimiter';
    expect(() => parseLegalFrontmatter(unterminated, 'Test')).toThrow(
      'Test frontmatter is not terminated.'
    );
  });

  it('handles CRLF line endings', () => {
    const crlf = validFrontmatter.replace(/\n/g, '\r\n');
    const { metadata, body } = parseLegalFrontmatter(crlf, 'Test');
    expect(metadata.title).toBe('Test Document');
    expect(body).toBe('Body content here.');
  });

  it('handles frontmatter with empty summary list', () => {
    const noSummary = [
      '---',
      'title: Minimal',
      'version: v0.1',
      'effectiveDate: 2026-06-01',
      'contactEmail: a@b.com',
      '---',
      '',
      'Body.',
    ].join('\n');
    const { metadata } = parseLegalFrontmatter(noSummary, 'Test');
    expect(metadata.summary).toEqual([]);
  });

  it('concatenates YAML continuation lines onto the preceding summary bullet', () => {
    const multiLineSummary = [
      '---',
      'title: Multi',
      'version: v1.0',
      'effectiveDate: 2026-04-13',
      'contactEmail: a@b.com',
      'summary:',
      '  - We collect account, product usage, and support interaction data needed to',
      '    operate IntelliFlow CRM.',
      '  - We retain information according to contractual, security, and legal',
      '    retention requirements.',
      '---',
      '',
      'Body.',
    ].join('\n');
    const { metadata } = parseLegalFrontmatter(multiLineSummary, 'Test');
    expect(metadata.summary).toEqual([
      'We collect account, product usage, and support interaction data needed to operate IntelliFlow CRM.',
      'We retain information according to contractual, security, and legal retention requirements.',
    ]);
    for (const bullet of metadata.summary) {
      expect(bullet).toMatch(/[.!?]$/);
    }
  });

  it('preserves single-line bullets when mixed with multi-line bullets', () => {
    const mixed = [
      '---',
      'title: Mixed',
      'version: v1.0',
      'effectiveDate: 2026-04-13',
      'contactEmail: a@b.com',
      'summary:',
      '  - Single-line bullet ends here.',
      '  - Multi-line bullet starts here',
      '    and continues here.',
      '  - Another single-line bullet.',
      '---',
      '',
      'Body.',
    ].join('\n');
    const { metadata } = parseLegalFrontmatter(mixed, 'Test');
    expect(metadata.summary).toEqual([
      'Single-line bullet ends here.',
      'Multi-line bullet starts here and continues here.',
      'Another single-line bullet.',
    ]);
  });

  it('ignores blank lines inside the summary list without merging bullets', () => {
    const withBlanks = [
      '---',
      'title: Blanks',
      'version: v1.0',
      'effectiveDate: 2026-04-13',
      'contactEmail: a@b.com',
      'summary:',
      '  - First bullet.',
      '',
      '  - Second bullet.',
      '---',
      '',
      'Body.',
    ].join('\n');
    const { metadata } = parseLegalFrontmatter(withBlanks, 'Test');
    expect(metadata.summary).toEqual(['First bullet.', 'Second bullet.']);
  });
});

describe('parseLegalSections', () => {
  it('splits markdown sections by ## headings', () => {
    const body = [
      '## First Section',
      'Paragraph one.',
      '',
      'Paragraph two.',
      '',
      '## Second Section',
      'Only paragraph.',
    ].join('\n');

    const sections = parseLegalSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('First Section');
    expect(sections[0].id).toBe('first-section');
    expect(sections[0].body).toEqual(['Paragraph one.', 'Paragraph two.']);
    expect(sections[1].heading).toBe('Second Section');
    expect(sections[1].body).toEqual(['Only paragraph.']);
  });

  it('joins multi-line paragraphs into single strings', () => {
    const body = ['## Wrapped', 'Line one', 'continues here.'].join('\n');

    const sections = parseLegalSections(body);
    expect(sections[0].body).toEqual(['Line one continues here.']);
  });

  it('handles empty body', () => {
    const sections = parseLegalSections('');
    expect(sections).toEqual([]);
  });
});

describe('formatLegalDate', () => {
  it('formats an ISO date string in en-GB locale', () => {
    const result = formatLegalDate('2026-08-11');
    expect(result).toMatch(/11/);
    expect(result).toMatch(/august/i);
    expect(result).toMatch(/2026/);
  });

  it('formats a different date correctly', () => {
    const result = formatLegalDate('2025-01-15');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/january/i);
    expect(result).toMatch(/2025/);
  });
});

describe('resolveLegalContentPath', () => {
  it('throws when no candidate path exists', () => {
    expect(() => resolveLegalContentPath(['/nonexistent/a.md', '/nonexistent/b.md'])).toThrow(
      'Unable to locate legal content file'
    );
  });

  it('returns first existing candidate', () => {
    // __filename always exists in node environment
    const result = resolveLegalContentPath([__filename, '/nonexistent.md']);
    expect(result).toBe(__filename);
  });
});
