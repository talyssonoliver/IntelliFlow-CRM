// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

// Stub server-only so the module can be imported in tests
vi.mock('server-only', () => ({}));

import { getDpa, formatDpaDate } from '../signature-handler';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/dpa-content.md');

describe('getDpa', () => {
  it('returns ParsedDpa with expected metadata from fixture', () => {
    const dpa = getDpa([FIXTURE_PATH]);
    expect(dpa.metadata.title).toBe('Data Processing Addendum');
    expect(dpa.metadata.version).toBe('v2026.08');
    expect(dpa.metadata.effectiveDate).toBe('2026-08-13');
    expect(dpa.metadata.contactEmail).toBe('legal@intelliflow-crm.com');
    expect(dpa.metadata.summary).toHaveLength(2);
  });

  it('concatenates multi-line YAML continuation bullets from fixture without truncation', () => {
    const dpa = getDpa([FIXTURE_PATH]);
    for (const bullet of dpa.metadata.summary) {
      expect(bullet).toMatch(/[.!?]$/);
    }
    expect(dpa.metadata.summary[0]).toMatch(/customer as controller\.$/);
    expect(dpa.metadata.summary[1]).toMatch(/duration of the service agreement\.$/);
  });

  it('returns non-empty sections array from fixture file', () => {
    const dpa = getDpa([FIXTURE_PATH]);
    expect(dpa.sections.length).toBeGreaterThan(0);
    expect(dpa.sections[0].heading).toBeTruthy();
  });

  it('throws when no candidate path resolves', () => {
    expect(() => getDpa(['/no/such/file.md', '/also/missing.md'])).toThrow();
  });

  it('parses the canonical docs/shared/dpa-content.md with all bullets complete', () => {
    const dpa = getDpa();
    expect(dpa.metadata.title).toBe('Data Processing Addendum');
    expect(dpa.metadata.summary.length).toBeGreaterThanOrEqual(6);
    for (const bullet of dpa.metadata.summary) {
      expect(bullet).toMatch(/[.!?]$/);
    }
    expect(dpa.metadata.summary[0]).toMatch(/customer as controller\.$/);
  });
});

describe('formatDpaDate', () => {
  it('returns a human-readable en-GB date containing "13", "August", "2026"', () => {
    const result = formatDpaDate('2026-08-13');
    expect(result).toContain('13');
    expect(result).toContain('August');
    expect(result).toContain('2026');
  });
});
