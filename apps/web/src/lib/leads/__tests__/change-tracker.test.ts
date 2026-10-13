import { describe, it, expect } from 'vitest';
import {
  computeLeadChangeset,
  buildLeadUpdatePayload,
  type LeadEditFields,
} from '../change-tracker';

function fields(overrides: Partial<LeadEditFields> = {}): LeadEditFields {
  return {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    title: 'CTO',
    company: 'ACME',
    location: 'NYC',
    website: 'https://acme.com',
    estimatedValue: '50',
    tags: 'enterprise, saas',
    budget: '',
    authority: '',
    need: '',
    timeline: '',
    annualRevenue: '',
    ...overrides,
  };
}

describe('change-tracker · BANT fields (IFC-230)', () => {
  it('sends changed budget/authority/need as trimmed strings', () => {
    const payload = buildLeadUpdatePayload(
      'lead-1',
      fields({ budget: ' $50k-$100k ', authority: 'Decision maker', need: 'CRM' }),
      ['budget', 'authority', 'need']
    );
    expect(payload).toMatchObject({
      id: 'lead-1',
      budget: '$50k-$100k',
      authority: 'Decision maker',
      need: 'CRM',
    });
  });

  it('omits a BANT text field cleared to empty', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ budget: '' }), ['budget'])).not.toHaveProperty(
      'budget'
    );
  });

  it('sends timeline/annualRevenue as narrowed enum values', () => {
    const payload = buildLeadUpdatePayload(
      'lead-1',
      fields({ timeline: 'immediate', annualRevenue: '1M-10M' }),
      ['timeline', 'annualRevenue']
    );
    expect(payload.timeline).toBe('immediate');
    expect(payload.annualRevenue).toBe('1M-10M');
  });

  it('omits an invalid/cleared timeline or annualRevenue (never sends a bad enum)', () => {
    const payload = buildLeadUpdatePayload(
      'lead-1',
      fields({ timeline: 'someday', annualRevenue: '' }),
      ['timeline', 'annualRevenue']
    );
    expect(payload).not.toHaveProperty('timeline');
    expect(payload).not.toHaveProperty('annualRevenue');
  });

  it('detects BANT changes in computeLeadChangeset', () => {
    const r = computeLeadChangeset(fields(), fields({ budget: 'X', timeline: 'short' }));
    expect(r.isDirty).toBe(true);
    expect(r.changedFields).toEqual(expect.arrayContaining(['budget', 'timeline']));
  });
});

describe('change-tracker · computeLeadChangeset', () => {
  it('returns not-dirty + empty when nothing changed', () => {
    expect(computeLeadChangeset(fields(), fields())).toEqual({ changedFields: [], isDirty: false });
  });

  it('detects a single changed field', () => {
    const r = computeLeadChangeset(fields(), fields({ firstName: 'Jane' }));
    expect(r.isDirty).toBe(true);
    expect(r.changedFields).toEqual(['firstName']);
  });

  it('detects multiple changed fields in field order', () => {
    const r = computeLeadChangeset(fields(), fields({ firstName: 'Jane', company: 'Globex' }));
    expect(r.changedFields).toEqual(['firstName', 'company']);
    expect(r.isDirty).toBe(true);
  });
});

describe('change-tracker · buildLeadUpdatePayload', () => {
  it('always includes id and only the changed fields', () => {
    const current = fields({ firstName: 'Jane' });
    const { changedFields } = computeLeadChangeset(fields(), current);
    expect(buildLeadUpdatePayload('lead-1', current, changedFields)).toEqual({
      id: 'lead-1',
      firstName: 'Jane',
    });
  });

  it('omits an unchanged estimatedValue (no spurious cents multiply)', () => {
    const current = fields({ firstName: 'Jane' }); // estimatedValue unchanged "50"
    const { changedFields } = computeLeadChangeset(fields(), current);
    expect(buildLeadUpdatePayload('lead-1', current, changedFields)).not.toHaveProperty(
      'estimatedValue'
    );
  });

  it('converts a changed estimatedValue from dollars to cents', () => {
    expect(
      buildLeadUpdatePayload('lead-1', fields({ estimatedValue: '75' }), ['estimatedValue'])
    ).toEqual({ id: 'lead-1', estimatedValue: 7500 });
  });

  it('sends null when a changed estimatedValue is cleared to empty (IFC-412)', () => {
    expect(
      buildLeadUpdatePayload('lead-1', fields({ estimatedValue: '' }), ['estimatedValue'])
    ).toEqual({ id: 'lead-1', estimatedValue: null });
  });

  it('omits a negative or non-numeric estimatedValue', () => {
    expect(
      buildLeadUpdatePayload('lead-1', fields({ estimatedValue: '-5' }), ['estimatedValue'])
    ).not.toHaveProperty('estimatedValue');
    expect(
      buildLeadUpdatePayload('lead-1', fields({ estimatedValue: 'abc' }), ['estimatedValue'])
    ).not.toHaveProperty('estimatedValue');
  });

  it('splits changed tags into a trimmed, empty-filtered array', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ tags: 'a, b ,, c' }), ['tags']).tags).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('sends an empty array when changed tags are cleared (so they actually clear)', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ tags: '' }), ['tags'])).toEqual({
      id: 'lead-1',
      tags: [],
    });
  });

  it('omits a cleared field outside IFC-412 scope (toOptional)', () => {
    // title is NOT one of #412's nullable-on-clear fields — a clear there
    // stays the pre-existing no-op (omitted), unlike company/phone/etc. below.
    expect(buildLeadUpdatePayload('lead-1', fields({ title: '' }), ['title'])).not.toHaveProperty(
      'title'
    );
  });

  it('trims a changed text field', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ title: '  VP  ' }), ['title']).title).toBe(
      'VP'
    );
  });
});

describe('change-tracker · clearable fields (IFC-412)', () => {
  // Owner ruling 2026-10-12: company, phone, name (first/last), estimatedValue,
  // location and website must be clearable from the edit form, including the
  // "required-looking" ones. A changed field in this set that is cleared to
  // empty must send an explicit `null`, never be silently omitted.
  it.each(['firstName', 'lastName', 'phone', 'company', 'location', 'website'] as const)(
    'sends null when %s is changed and cleared to empty',
    (field) => {
      const payload = buildLeadUpdatePayload('lead-1', fields({ [field]: '' }), [field]);
      expect(payload).toEqual({ id: 'lead-1', [field]: null });
    }
  );

  it('sends null when estimatedValue is changed and cleared to empty', () => {
    const payload = buildLeadUpdatePayload('lead-1', fields({ estimatedValue: '' }), [
      'estimatedValue',
    ]);
    expect(payload).toEqual({ id: 'lead-1', estimatedValue: null });
  });

  it('leaves an untouched clearable field out of the payload entirely', () => {
    // Only firstName changed; phone/company/location/website/estimatedValue
    // are untouched and must not appear in the payload at all (not even as
    // null) — "untouched" must never be confused with "cleared".
    const current = fields({ firstName: 'Jane' });
    const { changedFields } = computeLeadChangeset(fields(), current);
    const payload = buildLeadUpdatePayload('lead-1', current, changedFields);
    expect(payload).toEqual({ id: 'lead-1', firstName: 'Jane' });
    for (const untouched of ['phone', 'company', 'location', 'website', 'estimatedValue']) {
      expect(payload).not.toHaveProperty(untouched);
    }
  });

  it('sends a real value (not null) for a changed clearable field that is not cleared', () => {
    const payload = buildLeadUpdatePayload('lead-1', fields({ company: 'Globex' }), ['company']);
    expect(payload).toEqual({ id: 'lead-1', company: 'Globex' });
  });
});
