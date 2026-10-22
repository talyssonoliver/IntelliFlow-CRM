import { describe, it, expect } from 'vitest';
import {
  CONTACT_POLICY_FIELD_TO_COLUMN,
  CONTACT_TYPE_ADMIN_ROLES,
  CONTACT_TYPE_LIMITS,
  CONTACT_TYPE_OWNER_DEFAULTS,
  CONTACT_TYPE_REQUIRED_FIELD_KEYS,
  generateContactTypeKey,
  isContactTypeAdminRole,
  isReservedContactTypeKey,
  missingTypeRequiredFields,
  resolveContactCreateDefaults,
  type ResolveContactCreateDefaultsArgs,
} from '../contact-type-defaults';
import { CONTACT_TYPES, CONTACT_TYPE_KEY_PATTERN, isValidContactTypeKey } from '../Contact';

function args(
  overrides: Partial<ResolveContactCreateDefaultsArgs> = {}
): ResolveContactCreateDefaultsArgs {
  return {
    input: {},
    type: null,
    creatorId: 'user-creator',
    account: { linked: false, ownerId: null, ownerValid: false },
    defaultTagNames: [],
    ...overrides,
  };
}

const vendorType = {
  defaultStatus: 'PROSPECT' as const,
  defaultDepartment: 'Procurement',
  defaultOwner: 'CREATOR' as const,
};

describe('contact type constants', () => {
  it('pins the admin role list (CA-3)', () => {
    expect([...CONTACT_TYPE_ADMIN_ROLES]).toEqual(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);
  });

  it('isContactTypeAdminRole accepts only the admin roles', () => {
    expect(isContactTypeAdminRole('ADMIN')).toBe(true);
    expect(isContactTypeAdminRole('MANAGER')).toBe(true);
    expect(isContactTypeAdminRole('OWNER')).toBe(true);
    expect(isContactTypeAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isContactTypeAdminRole('USER')).toBe(false);
    expect(isContactTypeAdminRole(undefined)).toBe(false);
    expect(isContactTypeAdminRole(null)).toBe(false);
  });

  it('type required fields are real contact columns (no jobTitle)', () => {
    expect([...CONTACT_TYPE_REQUIRED_FIELD_KEYS]).toEqual([
      'phone',
      'company',
      'title',
      'department',
      'accountId',
    ]);
  });

  it('maps the tenant policy key jobTitle to the real title column (B14)', () => {
    expect(CONTACT_POLICY_FIELD_TO_COLUMN.jobTitle).toBe('title');
    expect(CONTACT_POLICY_FIELD_TO_COLUMN.email).toBe('email');
    expect(CONTACT_POLICY_FIELD_TO_COLUMN.phone).toBe('phone');
    expect(CONTACT_POLICY_FIELD_TO_COLUMN.company).toBe('company');
    expect(CONTACT_POLICY_FIELD_TO_COLUMN.ownerId).toBe('ownerId');
  });

  it('exposes the owner rules and limits', () => {
    expect([...CONTACT_TYPE_OWNER_DEFAULTS]).toEqual(['CREATOR', 'ACCOUNT_OWNER']);
    expect(CONTACT_TYPE_LIMITS).toEqual({
      maxTypesPerTenant: 50,
      maxNameLength: 50,
      maxDefaultTags: 10,
      maxTagsPerContact: 20,
      maxDepartmentLength: 100,
      maxKeyLength: 40,
    });
  });

  it('treats the six seed keys as reserved', () => {
    for (const key of CONTACT_TYPES) expect(isReservedContactTypeKey(key)).toBe(true);
    expect(isReservedContactTypeKey('customer_2')).toBe(false);
  });
});

describe('contact type key format', () => {
  it('accepts the six seed keys and suffixed keys', () => {
    for (const key of CONTACT_TYPES) expect(isValidContactTypeKey(key)).toBe(true);
    expect(isValidContactTypeKey('customer_2')).toBe(true);
    expect(CONTACT_TYPE_KEY_PATTERN.test('a'.repeat(40))).toBe(true);
  });

  it.each(['Customer', '1vendor', 'has space', '', 'a'.repeat(41), 'dash-key'])(
    'rejects %j',
    (key) => {
      expect(isValidContactTypeKey(key)).toBe(false);
    }
  );
});

describe('generateContactTypeKey', () => {
  it('slugifies a name', () => {
    expect(generateContactTypeKey('Channel Partner', new Set())).toBe('channel_partner');
  });

  it('never returns a reserved key', () => {
    expect(generateContactTypeKey('Customer', new Set())).toBe('customer_2');
    expect(generateContactTypeKey('  OTHER ', new Set())).toBe('other_2');
  });

  it('adds a numeric suffix on collision', () => {
    const taken = new Set(['reseller', 'reseller_2']);
    expect(generateContactTypeKey('Reseller', taken)).toBe('reseller_3');
  });

  it('falls back to "type" when the slug is empty or starts with a digit', () => {
    expect(generateContactTypeKey('!!!', new Set())).toBe('type');
    expect(generateContactTypeKey('2nd tier', new Set())).toBe('type_2nd_tier');
  });

  it('strips accents and keeps the key within 40 characters', () => {
    const key = generateContactTypeKey('Fournisseur privilégié ' + 'x'.repeat(60), new Set());
    expect(key.startsWith('fournisseur_privilegie_')).toBe(true);
    expect(key.length).toBeLessThanOrEqual(40);
    expect(isValidContactTypeKey(key)).toBe(true);
  });

  it('keeps suffixed keys within 40 characters', () => {
    const base = 'y'.repeat(40);
    const key = generateContactTypeKey(base, new Set([base]));
    expect(key.length).toBeLessThanOrEqual(40);
    expect(key.endsWith('_2')).toBe(true);
  });
});

describe('resolveContactCreateDefaults', () => {
  it('uses nothing when no type is chosen', () => {
    const r = resolveContactCreateDefaults(args({ input: { tags: ['a'] } }));
    expect(r.status).toBeUndefined();
    expect(r.department).toBeUndefined();
    expect(r.ownerId).toBe('user-creator');
    expect(r.ownerSource).toBe('creator');
    expect(r.ownerFallback).toBeNull();
    expect(r.tags).toEqual(['a']);
    expect(r.appliedDefaults).toEqual([]);
  });

  it('fills blank status and department from the type', () => {
    const r = resolveContactCreateDefaults(args({ type: vendorType }));
    expect(r.status).toBe('PROSPECT');
    expect(r.department).toBe('Procurement');
    expect(r.appliedDefaults).toEqual(['status', 'department']);
  });

  it('keeps explicit input over the type defaults', () => {
    const r = resolveContactCreateDefaults(
      args({ type: vendorType, input: { status: 'CUSTOMER', department: 'Sales' } })
    );
    expect(r.status).toBe('CUSTOMER');
    expect(r.department).toBe('Sales');
    expect(r.appliedDefaults).toEqual([]);
  });

  it('treats a blank department as not given', () => {
    const r = resolveContactCreateDefaults(
      args({ type: vendorType, input: { department: '   ' } })
    );
    expect(r.department).toBe('Procurement');
  });

  it('ACCOUNT_OWNER uses a valid same-tenant account owner', () => {
    const r = resolveContactCreateDefaults(
      args({
        type: { ...vendorType, defaultOwner: 'ACCOUNT_OWNER' },
        account: { linked: true, ownerId: 'user-account-owner', ownerValid: true },
      })
    );
    expect(r.ownerId).toBe('user-account-owner');
    expect(r.ownerSource).toBe('account_owner');
    expect(r.ownerFallback).toBeNull();
    expect(r.appliedDefaults).toContain('ownerId');
  });

  it.each([
    [{ linked: false, ownerId: null, ownerValid: false }, 'no_account'],
    [{ linked: true, ownerId: null, ownerValid: false }, 'no_account_owner'],
    [{ linked: true, ownerId: 'user-gone', ownerValid: false }, 'account_owner_invalid'],
  ] as const)('ACCOUNT_OWNER falls back to the creator: %j → %s', (account, reason) => {
    const r = resolveContactCreateDefaults(
      args({ type: { ...vendorType, defaultOwner: 'ACCOUNT_OWNER' }, account })
    );
    expect(r.ownerId).toBe('user-creator');
    expect(r.ownerSource).toBe('creator');
    expect(r.ownerFallback).toBe(reason);
    expect(r.appliedDefaults).not.toContain('ownerId');
  });

  it('CREATOR never consults the account', () => {
    const r = resolveContactCreateDefaults(
      args({ type: vendorType, account: { linked: true, ownerId: 'user-x', ownerValid: true } })
    );
    expect(r.ownerId).toBe('user-creator');
    expect(r.ownerFallback).toBeNull();
  });

  it('merges default tags with input tags, case-insensitive, first spelling wins', () => {
    const r = resolveContactCreateDefaults(
      args({
        type: vendorType,
        input: { tags: ['VIP', 'west'] },
        defaultTagNames: ['vip', 'supplier'],
      })
    );
    expect(r.tags).toEqual(['VIP', 'west', 'supplier']);
    expect(r.appliedDefaults).toContain('tags');
  });

  it('caps merged tags at 20', () => {
    const input = Array.from({ length: 18 }, (_, i) => `in-${i}`);
    const defaults = ['d1', 'd2', 'd3', 'd4'];
    const r = resolveContactCreateDefaults(
      args({ type: vendorType, input: { tags: input }, defaultTagNames: defaults })
    );
    expect(r.tags).toHaveLength(20);
    expect(r.tags.slice(18)).toEqual(['d1', 'd2']);
  });

  it('does not report tags as applied when every default was already present', () => {
    const r = resolveContactCreateDefaults(
      args({ type: vendorType, input: { tags: ['supplier'] }, defaultTagNames: ['Supplier'] })
    );
    expect(r.tags).toEqual(['supplier']);
    expect(r.appliedDefaults).not.toContain('tags');
  });

  it('returns only the allowlisted keys (no mass assignment)', () => {
    const r = resolveContactCreateDefaults(args({ type: vendorType }));
    expect(Object.keys(r).sort()).toEqual(
      [
        'appliedDefaults',
        'department',
        'ownerFallback',
        'ownerId',
        'ownerSource',
        'status',
        'tags',
      ].sort()
    );
  });
});

describe('missingTypeRequiredFields', () => {
  it('reports blank or absent required columns in key order', () => {
    expect(
      missingTypeRequiredFields(['title', 'phone', 'company'], {
        phone: '  ',
        company: 'Acme',
        title: null,
      })
    ).toEqual(['phone', 'title']);
  });

  it('ignores unknown keys stored on a type', () => {
    expect(missingTypeRequiredFields(['jobTitle', 'email'], {})).toEqual([]);
  });

  it('returns nothing when every required field is filled', () => {
    expect(
      missingTypeRequiredFields(['department', 'accountId'], {
        department: 'Ops',
        accountId: 'acc-1',
      })
    ).toEqual([]);
  });
});
