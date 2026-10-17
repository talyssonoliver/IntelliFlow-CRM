/**
 * PG-205 contact types validators (ADR-080).
 */
import { describe, it, expect } from 'vitest';
import {
  CONTACT_TYPE_COLOR_TOKENS,
  contactTypeColorTokenSchema,
  contactTypeNameSchema,
  contactTypeOwnerDefaultSchema,
  contactTypeRequiredFieldKeySchema,
  createContactTypeSchema,
  deleteContactTypeSchema,
  findDuplicateContactTypeName,
  setDefaultContactTypeSchema,
  updateContactTypeSchema,
} from '../contact-types';
import { contactTypeKeySchema } from '../contact';

const ID = 'clh1234567890abcdef';
const TAG_A = 'clhtaga1234567890abc';
const TAG_B = 'clhtagb1234567890abc';

function valid(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Reseller',
    colorToken: 'teal',
    isActive: true,
    defaultStatus: 'PROSPECT',
    defaultDepartment: 'Channel',
    defaultOwner: 'ACCOUNT_OWNER',
    requiredFields: ['company', 'phone'],
    defaultTagIds: [TAG_A, TAG_B],
    ...overrides,
  };
}

describe('createContactTypeSchema', () => {
  it('accepts a full type and trims the name', () => {
    const result = createContactTypeSchema.safeParse(valid({ name: '  Reseller  ' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Reseller');
  });

  it('applies defaults for the optional fields', () => {
    const result = createContactTypeSchema.safeParse({ name: 'Supplier' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: 'Supplier',
        colorToken: 'slate',
        isActive: true,
        defaultStatus: null,
        defaultDepartment: null,
        defaultOwner: 'CREATOR',
        requiredFields: [],
        defaultTagIds: [],
      });
    }
  });

  it('turns a blank department into null', () => {
    const result = createContactTypeSchema.safeParse(valid({ defaultDepartment: '   ' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultDepartment).toBeNull();
  });

  it.each([
    ['empty name', { name: '' }],
    ['whitespace name', { name: '   ' }],
    ['51-char name', { name: 'x'.repeat(51) }],
    ['unknown colour', { colorToken: 'red; background:url(x)' }],
    ['unknown status', { defaultStatus: 'VIP' }],
    ['101-char department', { defaultDepartment: 'd'.repeat(101) }],
    ['raw user id as owner', { defaultOwner: 'clhuser1234567890abc' }],
    ['jobTitle required field', { requiredFields: ['jobTitle'] }],
    ['email required field', { requiredFields: ['email'] }],
    [
      '11 default tags',
      { defaultTagIds: Array.from({ length: 11 }, (_, i) => `clhtag${i}aaaaaaaaaaaaaa`) },
    ],
    ['non-id tag', { defaultTagIds: ['not an id'] }],
  ])('rejects %s', (_label, overrides) => {
    expect(createContactTypeSchema.safeParse(valid(overrides)).success).toBe(false);
  });

  it.each([['key'], ['isSystem'], ['tenantId'], ['ownerId'], ['isDefault']])(
    'rejects the unknown key %s (strict)',
    (key) => {
      expect(createContactTypeSchema.safeParse(valid({ [key]: 'x' })).success).toBe(false);
    }
  );

  it('reports duplicate required fields at the second row', () => {
    const result = createContactTypeSchema.safeParse(
      valid({ requiredFields: ['phone', 'title', 'phone'] })
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toEqual(['requiredFields', 2]);
      expect(issue.message).toBe('Duplicate required field: items 1 and 3');
    }
  });

  it('reports duplicate default tags at the second row', () => {
    const result = createContactTypeSchema.safeParse(valid({ defaultTagIds: [TAG_A, TAG_A] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['defaultTagIds', 1]);
      expect(result.error.issues[0].message).toBe('Duplicate default tag: items 1 and 2');
    }
  });
});

describe('updateContactTypeSchema', () => {
  it('requires id and isActive', () => {
    expect(updateContactTypeSchema.safeParse(valid({ id: ID })).success).toBe(true);
    expect(updateContactTypeSchema.safeParse(valid()).success).toBe(false);
    const { isActive: _omit, ...withoutActive } = valid({ id: ID });
    expect(updateContactTypeSchema.safeParse(withoutActive).success).toBe(false);
  });

  it('never accepts a key change', () => {
    expect(updateContactTypeSchema.safeParse(valid({ id: ID, key: 'other' })).success).toBe(false);
  });

  it('keeps the duplicate checks', () => {
    expect(
      updateContactTypeSchema.safeParse(valid({ id: ID, requiredFields: ['title', 'title'] }))
        .success
    ).toBe(false);
  });
});

describe('delete / setDefault schemas', () => {
  it('delete needs an id', () => {
    expect(deleteContactTypeSchema.safeParse({ id: ID }).success).toBe(true);
    expect(deleteContactTypeSchema.safeParse({}).success).toBe(false);
  });

  it('setDefault accepts an id or null', () => {
    expect(setDefaultContactTypeSchema.safeParse({ id: ID }).success).toBe(true);
    expect(setDefaultContactTypeSchema.safeParse({ id: null }).success).toBe(true);
    expect(setDefaultContactTypeSchema.safeParse({ id: 'bad id' }).success).toBe(false);
  });
});

describe('enums', () => {
  it('colour tokens are the 18 contact tag tokens', () => {
    expect(CONTACT_TYPE_COLOR_TOKENS).toHaveLength(18);
    expect(contactTypeColorTokenSchema.options).toEqual([...CONTACT_TYPE_COLOR_TOKENS]);
  });

  it('owner defaults and required keys', () => {
    expect(contactTypeOwnerDefaultSchema.options).toEqual(['CREATOR', 'ACCOUNT_OWNER']);
    expect(contactTypeRequiredFieldKeySchema.options).toEqual([
      'phone',
      'company',
      'title',
      'department',
      'accountId',
    ]);
  });
});

describe('contactTypeKeySchema', () => {
  it.each(['customer', 'prospect', 'partner', 'vendor', 'investor', 'other', 'customer_2'])(
    'accepts %s',
    (key) => {
      expect(contactTypeKeySchema.safeParse(key).success).toBe(true);
    }
  );

  it.each(['Customer', '1vendor', 'has space', '', 'a'.repeat(41)])('rejects %j', (key) => {
    expect(contactTypeKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('duplicate type names (superRefine)', () => {
  const existing = [
    { id: 'a', name: 'Customer' },
    { id: 'b', name: 'Reseller' },
  ];

  it('finds a case-insensitive trimmed duplicate', () => {
    expect(findDuplicateContactTypeName(existing, '  customer ')).toBe('Customer');
    expect(findDuplicateContactTypeName(existing, 'Supplier')).toBeNull();
    expect(findDuplicateContactTypeName(existing, '   ')).toBeNull();
  });

  it('ignores the type being edited', () => {
    expect(findDuplicateContactTypeName(existing, 'Reseller', 'b')).toBeNull();
    expect(findDuplicateContactTypeName(existing, 'Reseller', 'a')).toBe('Reseller');
  });

  it('contactTypeNameSchema rejects a duplicate with a clear message', () => {
    const result = contactTypeNameSchema(existing).safeParse('RESELLER');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'A contact type named "Reseller" already exists.'
      );
    }
  });

  it('contactTypeNameSchema accepts a unique or self name and enforces length', () => {
    expect(contactTypeNameSchema(existing).safeParse('Supplier').success).toBe(true);
    expect(contactTypeNameSchema(existing, 'b').safeParse('Reseller').success).toBe(true);
    expect(contactTypeNameSchema(existing).safeParse('').success).toBe(false);
    expect(contactTypeNameSchema(existing).safeParse('x'.repeat(51)).success).toBe(false);
  });
});
