/**
 * PG-204 case types validators (ADR-076).
 */
import { describe, it, expect } from 'vitest';
import {
  caseTypeColorTokenSchema,
  caseTypeNameSchema,
  createCaseTypeSchema,
  deleteCaseTypeSchema,
  findDuplicateCaseTypeName,
  setDefaultCaseTypeSchema,
  updateCaseTypeSchema,
} from '../case-types';

const ID = 'clh1234567890abcdef';

function valid(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Litigation',
    category: 'Disputes',
    colorToken: 'blue',
    defaultPriority: 'HIGH',
    defaultSlaDays: 14,
    requiredFields: ['jurisdiction'],
    checklist: [{ title: 'Conflict check' }, { title: 'Engagement letter' }],
    isActive: true,
    ...overrides,
  };
}

function issues(result: { success: boolean; error?: { issues: unknown[] } }) {
  return (result.error?.issues ?? []) as Array<{ path: PropertyKey[]; message: string }>;
}

describe('createCaseTypeSchema', () => {
  it('accepts a full case type and trims text', () => {
    const result = createCaseTypeSchema.safeParse(
      valid({ name: '  Litigation  ', checklist: [{ title: '  Conflict check ' }] })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Litigation');
      expect(result.data.checklist).toEqual([{ title: 'Conflict check' }]);
    }
  });

  it('defaults isActive to true and normalises a blank or missing category to null', () => {
    const blank = createCaseTypeSchema.parse(valid({ isActive: undefined, category: '   ' }));
    expect(blank.isActive).toBe(true);
    expect(blank.category).toBeNull();
    const missing = createCaseTypeSchema.parse(valid({ category: undefined }));
    expect(missing.category).toBeNull();
  });

  it('accepts null default priority and SLA (defer to module defaults)', () => {
    const result = createCaseTypeSchema.safeParse(
      valid({ defaultPriority: null, defaultSlaDays: null, requiredFields: [], checklist: [] })
    );
    expect(result.success).toBe(true);
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['name over 100 chars', { name: 'x'.repeat(101) }],
    ['category over 60 chars', { category: 'x'.repeat(61) }],
    ['unknown colour', { colorToken: 'neon' }],
    ['unknown priority', { defaultPriority: 'CRITICAL' }],
    ['SLA of 0 days', { defaultSlaDays: 0 }],
    ['SLA over 3650 days', { defaultSlaDays: 3651 }],
    ['fractional SLA', { defaultSlaDays: 1.5 }],
    ['unknown required field', { requiredFields: ['ssn'] }],
    [
      'more than 20 checklist steps',
      { checklist: Array.from({ length: 21 }, (_, i) => ({ title: `Step ${i}` })) },
    ],
    ['blank checklist step', { checklist: [{ title: '  ' }] }],
    ['checklist step over 200 chars', { checklist: [{ title: 'x'.repeat(201) }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(createCaseTypeSchema.safeParse(valid(overrides)).success).toBe(false);
  });

  it('rejects duplicate required fields at the second item', () => {
    const result = createCaseTypeSchema.safeParse(
      valid({ requiredFields: ['jurisdiction', 'deadline', 'jurisdiction'] })
    );
    expect(result.success).toBe(false);
    const issue = issues(result).find((i) => i.path[0] === 'requiredFields');
    expect(issue?.path).toEqual(['requiredFields', 2]);
    expect(issue?.message).toBe('Duplicate required field: items 1 and 3');
  });

  it('rejects case-insensitive duplicate checklist steps at the second item', () => {
    const result = createCaseTypeSchema.safeParse(
      valid({
        checklist: [
          { title: 'Conflict check' },
          { title: 'Filing' },
          { title: ' conflict CHECK ' },
        ],
      })
    );
    expect(result.success).toBe(false);
    const issue = issues(result).find((i) => i.path[0] === 'checklist');
    expect(issue?.path).toEqual(['checklist', 2, 'title']);
    expect(issue?.message).toBe('Duplicate checklist step: items 1 and 3');
  });

  it('accepts all 8 case colour tokens', () => {
    for (const token of ['slate', 'blue', 'red', 'amber', 'green', 'violet', 'rose', 'teal']) {
      expect(caseTypeColorTokenSchema.safeParse(token).success).toBe(true);
    }
  });
});

describe('updateCaseTypeSchema', () => {
  it('requires an id', () => {
    expect(updateCaseTypeSchema.safeParse(valid()).success).toBe(false);
    expect(updateCaseTypeSchema.safeParse(valid({ id: ID })).success).toBe(true);
  });

  it('applies the same duplicate checks', () => {
    const result = updateCaseTypeSchema.safeParse(
      valid({ id: ID, checklist: [{ title: 'A' }, { title: 'a' }] })
    );
    expect(result.success).toBe(false);
  });
});

describe('deleteCaseTypeSchema / setDefaultCaseTypeSchema', () => {
  it('validates ids and accepts null to clear the default', () => {
    expect(deleteCaseTypeSchema.safeParse({ id: ID }).success).toBe(true);
    expect(deleteCaseTypeSchema.safeParse({ id: 'bad id' }).success).toBe(false);
    expect(setDefaultCaseTypeSchema.safeParse({ id: null }).success).toBe(true);
    expect(setDefaultCaseTypeSchema.safeParse({ id: ID }).success).toBe(true);
  });
});

describe('duplicate type names', () => {
  const existing = [
    { id: 'a', name: 'NDA' },
    { id: 'b', name: 'Litigation' },
  ];

  it('finds a case-insensitive, trimmed match', () => {
    expect(findDuplicateCaseTypeName(existing, ' nda ')).toBe('NDA');
    expect(findDuplicateCaseTypeName(existing, 'Advisory')).toBeNull();
    expect(findDuplicateCaseTypeName(existing, '   ')).toBeNull();
  });

  it('ignores the type being edited', () => {
    expect(findDuplicateCaseTypeName(existing, 'nda', 'a')).toBeNull();
    expect(findDuplicateCaseTypeName(existing, 'nda', 'b')).toBe('NDA');
  });

  it('caseTypeNameSchema rejects a duplicate type name through superRefine', () => {
    const schema = caseTypeNameSchema(existing);
    const result = schema.safeParse('litigation');
    expect(result.success).toBe(false);
    expect(issues(result)[0]?.message).toBe('A case type named "Litigation" already exists.');
    expect(schema.safeParse('Advisory').success).toBe(true);
    expect(schema.safeParse('  ').success).toBe(false);
    expect(caseTypeNameSchema(existing, 'b').safeParse('litigation').success).toBe(true);
  });
});
