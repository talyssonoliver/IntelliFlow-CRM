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

  it('returns non-empty sections array from fixture file', () => {
    const dpa = getDpa([FIXTURE_PATH]);
    expect(dpa.sections.length).toBeGreaterThan(0);
    expect(dpa.sections[0].heading).toBeTruthy();
  });

  it('throws when no candidate path resolves', () => {
    expect(() => getDpa(['/no/such/file.md', '/also/missing.md'])).toThrow();
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
