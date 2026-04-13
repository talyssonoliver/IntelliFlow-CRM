import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const FIXTURE_PATH = resolve(__dirname, 'fixtures/aup-content.md');

describe('violation-tracker — content loading', () => {
  it('getAup returns parsed metadata and sections from canonical AUP content file', async () => {
    const { getAup } = await import('../violation-tracker');
    const policy = getAup();

    expect(policy.metadata.title).toBe('Acceptable Use Policy');
    expect(policy.metadata.version).toBe('v2026.08');
    expect(policy.metadata.effectiveDate).toBe('2026-08-15');
    expect(policy.metadata.contactEmail).toBe('legal@intelliflow-crm.com');
    expect(policy.metadata.summary.length).toBeGreaterThanOrEqual(6);
    expect(policy.sections.length).toBeGreaterThanOrEqual(9);
    expect(policy.sections[0].id).toBe('introduction');
    expect(policy.sections[0].body.length).toBeGreaterThanOrEqual(1);
  });

  it('getAup accepts a fixture path and returns deterministic parse result', async () => {
    const { getAup } = await import('../violation-tracker');
    const policy = getAup([FIXTURE_PATH]);

    expect(policy.metadata.title).toBe('Acceptable Use Policy');
    expect(policy.metadata.version).toBe('v2026.08');
    expect(policy.sections.map((s) => s.id)).toEqual([
      'introduction',
      'prohibited-activities',
      'reporting-violations',
    ]);
  });

  it('formatAupDate formats ISO dates in en-GB locale', async () => {
    const { formatAupDate } = await import('../violation-tracker');
    const result = formatAupDate('2026-08-15');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/august/i);
    expect(result).toMatch(/2026/);
  });

  it('canonical AUP summary bullets each end with terminal punctuation (anti-truncation guard)', async () => {
    const { getAup } = await import('../violation-tracker');
    const policy = getAup();

    expect(policy.metadata.summary.length).toBeGreaterThan(0);
    for (const bullet of policy.metadata.summary) {
      expect(bullet).toMatch(/[.!?]$/);
    }
  });

  it('every section has id, heading, and non-empty body array', async () => {
    const { getAup } = await import('../violation-tracker');
    const policy = getAup();

    for (const section of policy.sections) {
      expect(section.id).toMatch(/^[a-z0-9-]+$/);
      expect(section.heading.length).toBeGreaterThan(0);
      expect(Array.isArray(section.body)).toBe(true);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });
});

describe('violation-tracker — VIOLATION_REPORT_MAILTO_SUBJECT', () => {
  it('exports the AUP report subject as a URL-encoded string', async () => {
    const { VIOLATION_REPORT_MAILTO_SUBJECT } = await import('../violation-tracker');
    expect(VIOLATION_REPORT_MAILTO_SUBJECT).toBe('AUP%20violation%20report');
  });
});

describe('violation-tracker — buildViolationRecord', () => {
  const baseInput = {
    id: 'aup-2026-08-15-0001',
    sectionHeading: 'Prohibited Activities',
    category: 'abuse' as const,
    severity: 'high' as const,
    reporterEmail: 'reporter@example.com',
    notes: 'Suspected spam from account.',
  };

  it('stamps reportedAt using the injected now()', async () => {
    const { buildViolationRecord } = await import('../violation-tracker');
    const fixedNow = '2026-08-15T10:00:00.000Z';
    const record = buildViolationRecord({ ...baseInput, now: () => fixedNow });
    expect(record.reportedAt).toBe(fixedNow);
  });

  it('slugifies sectionHeading using the shared parser slugify', async () => {
    const { buildViolationRecord } = await import('../violation-tracker');
    const record = buildViolationRecord({
      ...baseInput,
      sectionHeading: 'AI / ML Misuse',
      now: () => '2026-08-15T10:00:00.000Z',
    });
    expect(record.sectionId).toBe('ai-ml-misuse');
  });

  it('preserves subjectAccountId when provided', async () => {
    const { buildViolationRecord } = await import('../violation-tracker');
    const record = buildViolationRecord({
      ...baseInput,
      subjectAccountId: 'acc_42',
      now: () => '2026-08-15T10:00:00.000Z',
    });
    expect(record.subjectAccountId).toBe('acc_42');
  });

  it('omits subjectAccountId when not provided', async () => {
    const { buildViolationRecord } = await import('../violation-tracker');
    const record = buildViolationRecord({
      ...baseInput,
      now: () => '2026-08-15T10:00:00.000Z',
    });
    expect(record.subjectAccountId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(record, 'subjectAccountId')).toBe(false);
  });

  it('throws ViolationRecordError for empty notes', async () => {
    const { buildViolationRecord, ViolationRecordError } = await import('../violation-tracker');
    expect(() => buildViolationRecord({ ...baseInput, notes: '   ', now: () => 'x' })).toThrow(
      ViolationRecordError
    );
    expect(() => buildViolationRecord({ ...baseInput, notes: '   ', now: () => 'x' })).toThrow(
      /notes-required/
    );
  });

  it('throws ViolationRecordError for empty reporterEmail', async () => {
    const { buildViolationRecord, ViolationRecordError } = await import('../violation-tracker');
    expect(() =>
      buildViolationRecord({ ...baseInput, reporterEmail: '   ', now: () => 'x' })
    ).toThrow(ViolationRecordError);
    expect(() =>
      buildViolationRecord({ ...baseInput, reporterEmail: '   ', now: () => 'x' })
    ).toThrow(/reporter-email-required/);
  });

  it('returns a frozen object with route literal "/aup"', async () => {
    const { buildViolationRecord } = await import('../violation-tracker');
    const record = buildViolationRecord({ ...baseInput, now: () => '2026-08-15T10:00:00.000Z' });
    expect(record.route).toBe('/aup');
    expect(Object.isFrozen(record)).toBe(true);
  });

  describe('exhaustive category × severity matrix', () => {
    const categories = [
      'abuse',
      'security',
      'content',
      'api_misuse',
      'ai_misuse',
      'other',
    ] as const;
    const severities = ['low', 'medium', 'high', 'critical'] as const;

    for (const category of categories) {
      for (const severity of severities) {
        it(`builds record for category=${category} severity=${severity}`, async () => {
          const { buildViolationRecord } = await import('../violation-tracker');
          const record = buildViolationRecord({
            ...baseInput,
            category,
            severity,
            now: () => '2026-08-15T10:00:00.000Z',
          });
          expect(record.category).toBe(category);
          expect(record.severity).toBe(severity);
        });
      }
    }
  });
});
