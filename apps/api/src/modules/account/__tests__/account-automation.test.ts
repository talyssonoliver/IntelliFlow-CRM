/**
 * Account Automation Helper Tests - PG-183 hardening
 *
 * Unit-level coverage for the pure helpers that turn AccountAutomationSetting
 * rows into actual behaviour on the Account create/update/delete flows.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  type AccountAutomationFlags,
  assertCanCreateTag,
  assertCanDeleteAccount,
  assertRequiredAccountFields,
  capitalizeAccountName,
  loadAccountAutomation,
  loadRequiredAccountFields,
  normalizeWebsite,
  notifyAccountReassignment,
} from '../account-automation';

const ALL_OFF: AccountAutomationFlags = {
  autoAssignOwner: false,
  autoLinkContactsByDomain: false,
  preventDeleteWithOpenOpportunities: false,
  notifyOnOwnerChange: false,
  normalizeWebsiteDomain: false,
  autoCapitalizeAccountNames: false,
  notifyOnDuplicate: false,
  restrictTagCreationToAdmins: false,
  aiIndustryInference: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAccountScoring: false,
};

describe('normalizeWebsite', () => {
  const on = { normalizeWebsiteDomain: true };
  const off = { normalizeWebsiteDomain: false };

  it('passes through when flag is off', () => {
    expect(normalizeWebsite('HTTPS://WWW.Example.COM/', off)).toBe('HTTPS://WWW.Example.COM/');
  });

  it('strips scheme, www, trailing slash, lowercases host', () => {
    expect(normalizeWebsite('HTTPS://WWW.Example.COM/', on)).toBe('example.com');
  });

  it('preserves path case after normalizing host', () => {
    expect(normalizeWebsite('http://www.example.com/Blog/Post', on)).toBe('example.com/Blog/Post');
  });

  it('returns null for blank string when flag on', () => {
    expect(normalizeWebsite('   ', on)).toBeNull();
  });

  it('returns undefined/null passthrough', () => {
    expect(normalizeWebsite(null, on)).toBeNull();
    expect(normalizeWebsite(undefined, on)).toBeUndefined();
  });
});

describe('capitalizeAccountName', () => {
  const on = { autoCapitalizeAccountNames: true };
  const off = { autoCapitalizeAccountNames: false };

  it('passes through when flag off', () => {
    expect(capitalizeAccountName('acme corp', off)).toBe('acme corp');
  });

  it('title-cases each word', () => {
    expect(capitalizeAccountName('acme corp', on)).toBe('Acme Corp');
  });

  it("preserves apostrophe boundary (L'Oréal)", () => {
    expect(capitalizeAccountName("l'oréal", on)).toBe("L'Oréal");
  });

  it('preserves hyphen boundary (Jean-Luc Inc)', () => {
    expect(capitalizeAccountName('jean-luc inc', on)).toBe('Jean-Luc Inc');
  });

  it('returns null/undefined passthrough', () => {
    expect(capitalizeAccountName(null, on)).toBeNull();
    expect(capitalizeAccountName(undefined, on)).toBeUndefined();
  });
});

describe('assertCanDeleteAccount', () => {
  it('no-op when flag off', () => {
    expect(() => assertCanDeleteAccount({ activeOpportunities: 5 }, ALL_OFF)).not.toThrow();
  });

  it('no-op when zero active opportunities', () => {
    expect(() =>
      assertCanDeleteAccount(
        { activeOpportunities: 0 },
        { ...ALL_OFF, preventDeleteWithOpenOpportunities: true }
      )
    ).not.toThrow();
  });

  it('throws PRECONDITION_FAILED when flag on and opps exist', () => {
    expect(() =>
      assertCanDeleteAccount(
        { activeOpportunities: 3 },
        { ...ALL_OFF, preventDeleteWithOpenOpportunities: true }
      )
    ).toThrow(/open opportunities/i);
  });
});

describe('assertRequiredAccountFields', () => {
  it('no-op when required set is empty', () => {
    expect(() => assertRequiredAccountFields({ name: '' }, new Set(), 'create')).not.toThrow();
  });

  it('create mode — throws on missing required fields', () => {
    expect(() =>
      assertRequiredAccountFields(
        { name: '', industry: null },
        new Set(['name', 'industry']),
        'create'
      )
    ).toThrow(/required field/i);
  });

  it('create mode — passes when all required fields supplied', () => {
    expect(() =>
      assertRequiredAccountFields(
        { name: 'Acme', industry: 'Retail' },
        new Set(['name', 'industry']),
        'create'
      )
    ).not.toThrow();
  });

  it('update mode — skips fields not present in payload', () => {
    expect(() =>
      assertRequiredAccountFields({ name: 'Acme' }, new Set(['name', 'industry']), 'update')
    ).not.toThrow();
  });

  it('update mode — throws when explicitly clearing a required field', () => {
    expect(() =>
      assertRequiredAccountFields({ industry: '' }, new Set(['industry']), 'update')
    ).toThrow(/required field/i);
  });
});

describe('assertCanCreateTag', () => {
  it('no-op when flag off', () => {
    expect(() => assertCanCreateTag({ user: { role: 'MEMBER' } }, ALL_OFF)).not.toThrow();
  });

  it('allows ADMIN', () => {
    expect(() =>
      assertCanCreateTag(
        { user: { role: 'ADMIN' } },
        { ...ALL_OFF, restrictTagCreationToAdmins: true }
      )
    ).not.toThrow();
  });

  it('allows OWNER', () => {
    expect(() =>
      assertCanCreateTag(
        { user: { role: 'OWNER' } },
        { ...ALL_OFF, restrictTagCreationToAdmins: true }
      )
    ).not.toThrow();
  });

  it('FORBIDDEN for non-admin when flag on', () => {
    expect(() =>
      assertCanCreateTag(
        { user: { role: 'MEMBER' } },
        { ...ALL_OFF, restrictTagCreationToAdmins: true }
      )
    ).toThrow(/restricted/i);
  });
});

describe('loadAccountAutomation', () => {
  it('returns factory defaults when no row exists', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        accountAutomationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
        accountRequiredField: { findMany: vi.fn() },
      },
    };
    const flags = await loadAccountAutomation(ctx);
    // Opt-in AI stance — none of the AI flags should default to true.
    expect(flags.aiIndustryInference).toBe(false);
    expect(flags.aiTagSuggestions).toBe(false);
    expect(flags.aiInsightGeneration).toBe(false);
    expect(flags.autoLinkContactsByDomain).toBe(true);
    expect(flags.preventDeleteWithOpenOpportunities).toBe(true);
  });

  it('maps row values when row exists', async () => {
    const row = {
      autoAssignOwner: true,
      autoLinkContactsByDomain: false,
      preventDeleteWithOpenOpportunities: false,
      notifyOnOwnerChange: true,
      normalizeWebsiteDomain: false,
      autoCapitalizeAccountNames: false,
      notifyOnDuplicate: false,
      restrictTagCreationToAdmins: true,
      aiIndustryInference: true,
      aiEnrichment: true,
      aiTagSuggestions: true,
      aiInsightGeneration: true,
      aiAccountScoring: true,
    };
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        accountAutomationSetting: { findUnique: vi.fn().mockResolvedValue(row) },
        accountRequiredField: { findMany: vi.fn() },
      },
    };
    const flags = await loadAccountAutomation(ctx);
    expect(flags.autoAssignOwner).toBe(true);
    expect(flags.aiAccountScoring).toBe(true);
    expect(flags.autoLinkContactsByDomain).toBe(false);
  });
});

describe('loadRequiredAccountFields', () => {
  it('returns Set of required field keys, filtering unknown keys', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        accountAutomationSetting: { findUnique: vi.fn() },
        accountRequiredField: {
          findMany: vi.fn().mockResolvedValue([
            { fieldKey: 'name' },
            { fieldKey: 'ownerId' },
            { fieldKey: 'not_a_known_key' }, // should be filtered
          ]),
        },
      },
    };
    const set = await loadRequiredAccountFields(ctx);
    expect(set.has('name')).toBe(true);
    expect(set.has('ownerId')).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('notifyAccountReassignment', () => {
  it('no-op when flag off', async () => {
    const createNotification = vi.fn();
    await notifyAccountReassignment(
      {
        tenantId: 't1',
        accountId: 'a1',
        accountName: 'Acme',
        previousOwnerId: 'u1',
        nextOwnerId: 'u2',
        actingUserId: 'u1',
      },
      ALL_OFF,
      createNotification
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('no-op when owner did not actually change', async () => {
    const createNotification = vi.fn();
    await notifyAccountReassignment(
      {
        tenantId: 't1',
        accountId: 'a1',
        accountName: 'Acme',
        previousOwnerId: 'u1',
        nextOwnerId: 'u1',
        actingUserId: 'u1',
      },
      { ...ALL_OFF, notifyOnOwnerChange: true },
      createNotification
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifies both previous and next owners', async () => {
    const createNotification = vi.fn().mockResolvedValue(undefined);
    await notifyAccountReassignment(
      {
        tenantId: 't1',
        accountId: 'a1',
        accountName: 'Acme',
        previousOwnerId: 'u1',
        nextOwnerId: 'u2',
        actingUserId: 'u3',
      },
      { ...ALL_OFF, notifyOnOwnerChange: true },
      createNotification
    );
    expect(createNotification).toHaveBeenCalledTimes(2);
  });
});
