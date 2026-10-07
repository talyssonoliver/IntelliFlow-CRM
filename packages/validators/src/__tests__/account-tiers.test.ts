/**
 * PG-196 — tenant-configurable account tiers: input validation.
 */
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TIER_COLOR_TOKENS,
  MAX_TIER_BENEFITS,
  accountTierDefinitionInputSchema,
  accountTierFilterKeySchema,
  accountTierKeySchema,
  generateTierKey,
  normalizeLegacyTierValue,
  tierKeyToSlug,
  tierSlugToKey,
  updateAccountTiersSchema,
  type UpdateAccountTiersInput,
} from '../account-tiers';
import { ACCOUNT_TAG_COLOR_TOKENS } from '../account-settings';
import { accountQuerySchema } from '../account';

const row = (key: string, label: string, minRevenue: number, benefits: string[] = []) => ({
  key,
  label,
  minRevenue,
  colorToken: 'slate' as const,
  benefits,
});

const validInput = (): UpdateAccountTiersInput => ({
  tiers: [
    row('ENTERPRISE', 'Enterprise', 10_000_000),
    row('MID_MARKET', 'Mid-Market', 1_000_000),
    row('SMB', 'SMB', 100_000),
    row('STARTUP', 'Startup', 0),
  ],
  defaultTierKey: null,
  notifyOwnerOnUpgrade: false,
  notifyOwnerOnDowngrade: false,
  expectedUpdatedAt: null,
});

const messages = (input: unknown): string[] => {
  const result = updateAccountTiersSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('ACCOUNT_TIER_COLOR_TOKENS', () => {
  it('is the same 18-token palette as account tags (palette drift guard)', () => {
    expect([...ACCOUNT_TIER_COLOR_TOKENS]).toEqual([...ACCOUNT_TAG_COLOR_TOKENS]);
    expect(ACCOUNT_TIER_COLOR_TOKENS).toHaveLength(18);
  });
});

describe('accountTierDefinitionInputSchema', () => {
  it('accepts a well-formed tier and trims the label', () => {
    const parsed = accountTierDefinitionInputSchema.parse(row('GOLD', '  Gold  ', 1234.56));
    expect(parsed.label).toBe('Gold');
  });

  it('accepts a new row without a key', () => {
    const { key: _key, ...rest } = row('X', 'New', 0);
    expect(accountTierDefinitionInputSchema.safeParse(rest).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'x'.repeat(41)],
    ['control character', `Gold${String.fromCharCode(7)}`],
    ['bidi override', `Gold${String.fromCharCode(0x202e)}`],
  ])('rejects a %s label', (_case, label) => {
    expect(accountTierDefinitionInputSchema.safeParse(row('GOLD', label, 0)).success).toBe(false);
  });

  it.each([
    ['negative', -1],
    ['infinite', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['three decimals', 1.001],
    ['above Decimal(15,2)', 10_000_000_000_000],
  ])('rejects a %s minimum revenue', (_case, minRevenue) => {
    expect(
      accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', minRevenue)).success
    ).toBe(false);
  });

  it('accepts the maximum Decimal(15,2) value and zero', () => {
    expect(
      accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', 9_999_999_999_999.99)).success
    ).toBe(true);
    expect(accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', 0)).success).toBe(true);
  });

  it('rejects colours outside the palette', () => {
    expect(
      accountTierDefinitionInputSchema.safeParse({
        ...row('GOLD', 'Gold', 0),
        colorToken: '#ff0000',
      }).success
    ).toBe(false);
  });

  it('caps benefits at the maximum count and length', () => {
    const many = Array.from({ length: MAX_TIER_BENEFITS + 1 }, (_, i) => `Benefit ${i}`);
    expect(MAX_TIER_BENEFITS).toBe(12);
    expect(accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', 0, many)).success).toBe(
      false
    );
    expect(
      accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', 0, ['x'.repeat(81)])).success
    ).toBe(false);
    expect(accountTierDefinitionInputSchema.safeParse(row('GOLD', 'Gold', 0, [''])).success).toBe(
      false
    );
  });
});

describe('tier key schemas', () => {
  it.each(['lower', '1ST', 'A'.repeat(41), 'WITH SPACE', 'UNKNOWN'])(
    'rejects %s as a tier key',
    (key) => {
      expect(accountTierKeySchema.safeParse(key).success).toBe(false);
    }
  );

  it('accepts UNKNOWN only as a filter key', () => {
    expect(accountTierFilterKeySchema.safeParse('UNKNOWN').success).toBe(true);
    expect(accountTierFilterKeySchema.safeParse('smb').success).toBe(false);
  });
});

describe('updateAccountTiersSchema', () => {
  it('accepts the default configuration', () => {
    expect(updateAccountTiersSchema.safeParse(validInput()).success).toBe(true);
  });

  it('accepts an ISO expectedUpdatedAt and rejects other strings', () => {
    expect(
      updateAccountTiersSchema.safeParse({
        ...validInput(),
        expectedUpdatedAt: '2026-10-07T08:00:00.000Z',
      }).success
    ).toBe(true);
    expect(
      updateAccountTiersSchema.safeParse({ ...validInput(), expectedUpdatedAt: 'yesterday' })
        .success
    ).toBe(false);
  });

  it('rejects zero and more than ten tiers', () => {
    expect(updateAccountTiersSchema.safeParse({ ...validInput(), tiers: [] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => row(`T${i}`, `Tier ${i}`, i * 10));
    expect(updateAccountTiersSchema.safeParse({ ...validInput(), tiers: eleven }).success).toBe(
      false
    );
  });

  it('names both rows for duplicate names, ignoring case', () => {
    const input = validInput();
    input.tiers[2] = row('SMB', 'enterprise', 100_000);
    expect(messages(input)).toContain(
      'Tier names must be unique: rows 1 and 3 are both "enterprise"'
    );
  });

  it('names both rows for duplicate keys', () => {
    const input = validInput();
    input.tiers[1] = row('ENTERPRISE', 'Mid-Market', 1_000_000);
    expect(messages(input)).toContain(
      'Tier keys must be unique: rows 1 and 2 are both "ENTERPRISE"'
    );
  });

  it('names both rows for the same minimum revenue', () => {
    const input = validInput();
    input.tiers[2] = row('SMB', 'SMB', 1_000_000);
    expect(messages(input)).toContain(
      'Two tiers cannot share a minimum revenue: rows 2 and 3 both start at 1000000'
    );
  });

  it('requires one tier to start at 0', () => {
    const input = validInput();
    input.tiers[3] = row('STARTUP', 'Startup', 50);
    expect(messages(input)).toContain('One tier must start at 0 so every account has a tier');
  });

  it('requires the default tier to be one of the tiers', () => {
    expect(messages({ ...validInput(), defaultTierKey: 'PLATINUM' })).toContain(
      'The default tier must be one of the tiers'
    );
  });

  it('accepts a default tier that is one of the tiers', () => {
    expect(
      updateAccountTiersSchema.safeParse({ ...validInput(), defaultTierKey: 'SMB' }).success
    ).toBe(true);
  });

  it('rejects a duplicate benefit within one tier, ignoring case', () => {
    const input = validInput();
    input.tiers[0] = row('ENTERPRISE', 'Enterprise', 10_000_000, [
      'Dedicated CSM',
      'dedicated csm',
    ]);
    expect(messages(input)).toContain('Row 1 lists the benefit "dedicated csm" twice');
  });

  it('allows the same benefit on different tiers', () => {
    const input = validInput();
    input.tiers[0] = row('ENTERPRISE', 'Enterprise', 10_000_000, ['Priority support']);
    input.tiers[1] = row('MID_MARKET', 'Mid-Market', 1_000_000, ['Priority support']);
    expect(updateAccountTiersSchema.safeParse(input).success).toBe(true);
  });

  it('does not accept tenant or row ids from the client', () => {
    const parsed = updateAccountTiersSchema.parse({ ...validInput(), tenantId: 'other', id: 'x' });
    expect(parsed).not.toHaveProperty('tenantId');
    expect(parsed).not.toHaveProperty('id');
  });
});

describe('slug and key helpers', () => {
  it.each([
    ['ENTERPRISE', 'enterprise'],
    ['MID_MARKET', 'mid-market'],
    ['SMB', 'smb'],
    ['STARTUP', 'startup'],
  ])('maps %s to %s and back', (key, slug) => {
    expect(tierKeyToSlug(key)).toBe(slug);
    expect(tierSlugToKey(slug)).toBe(key);
  });

  it('returns null for a slug that cannot be a key', () => {
    expect(tierSlugToKey('')).toBeNull();
    expect(tierSlugToKey('9-lives')).toBeNull();
    expect(tierSlugToKey('a'.repeat(41))).toBeNull();
  });

  it('normalises legacy hierarchy values', () => {
    expect(normalizeLegacyTierValue(' mid-market ')).toBe('MID_MARKET');
    expect(normalizeLegacyTierValue('Strategic Accounts')).toBe('STRATEGIC_ACCOUNTS');
    expect(normalizeLegacyTierValue('enterprise')).toBe('ENTERPRISE');
  });
});

describe('generateTierKey', () => {
  it('derives an UPPER_SNAKE key from the label', () => {
    expect(generateTierKey('Key Accounts', [])).toBe('KEY_ACCOUNTS');
  });

  it('de-duplicates against existing keys', () => {
    expect(generateTierKey('Key Accounts', ['KEY_ACCOUNTS'])).toBe('KEY_ACCOUNTS_2');
    expect(generateTierKey('Key Accounts', ['KEY_ACCOUNTS', 'KEY_ACCOUNTS_2'])).toBe(
      'KEY_ACCOUNTS_3'
    );
  });

  it('never produces the reserved UNKNOWN key', () => {
    expect(generateTierKey('Unknown', [])).toBe('UNKNOWN_2');
  });

  it('falls back to TIER when the label has no latin letters', () => {
    expect(generateTierKey('黄金', [])).toBe('TIER');
    expect(generateTierKey('2024', [])).toBe('TIER_2024');
  });

  it('keeps generated keys within 40 characters', () => {
    const key = generateTierKey('x'.repeat(60), []);
    expect(key.length).toBeLessThanOrEqual(40);
    expect(accountTierKeySchema.safeParse(key).success).toBe(true);
  });
});

describe('accountQuerySchema tier filter', () => {
  it('accepts a tier key', () => {
    expect(accountQuerySchema.parse({ tier: 'SMB' }).tier).toBe('SMB');
  });

  it('rejects a slug', () => {
    expect(accountQuerySchema.safeParse({ tier: 'smb' }).success).toBe(false);
  });
});
