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
    ...overrides,
  };
}

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

  it('omits estimatedValue when cleared to empty', () => {
    expect(
      buildLeadUpdatePayload('lead-1', fields({ estimatedValue: '' }), ['estimatedValue'])
    ).not.toHaveProperty('estimatedValue');
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

  it('omits tags when cleared to empty', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ tags: '' }), ['tags'])).not.toHaveProperty(
      'tags'
    );
  });

  it('omits a non-estimatedValue field cleared to empty (toOptional)', () => {
    expect(
      buildLeadUpdatePayload('lead-1', fields({ company: '' }), ['company'])
    ).not.toHaveProperty('company');
  });

  it('trims a changed text field', () => {
    expect(buildLeadUpdatePayload('lead-1', fields({ title: '  VP  ' }), ['title']).title).toBe(
      'VP'
    );
  });
});
