import { describe, it, expect } from 'vitest';
import {
  createTerritorySchema,
  updateTerritorySchema,
  reorderTerritoriesSchema,
  setDefaultTerritorySchema,
  territoryPreviewSchema,
  deleteTerritorySchema,
} from '../account-territories';

const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';

function idFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const valid = {
  name: 'London',
  colorToken: 'blue',
  strategy: 'ROUND_ROBIN',
  isActive: true,
  rules: [{ country: 'gb', region: '  Greater   London ', postalPrefix: 'sw1a-' }],
  memberIds: [ID_1, ID_2],
};

describe('createTerritorySchema', () => {
  it('accepts a valid payload and normalises rules', () => {
    const result = createTerritorySchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.rules[0]).toEqual({
      country: 'GB',
      region: 'Greater London',
      postalPrefix: 'SW1A',
    });
  });

  it('treats blank region and prefix as absent', () => {
    const result = createTerritorySchema.parse({
      ...valid,
      rules: [{ country: 'GB', region: '  ', postalPrefix: '' }],
    });
    expect(result.rules[0]).toEqual({ country: 'GB', region: undefined, postalPrefix: undefined });
  });

  it('reports a duplicate rule triple at the second row with "rows 1 and 3"', () => {
    const result = createTerritorySchema.safeParse({
      ...valid,
      rules: [{ country: 'GB' }, { country: 'US' }, { country: 'gb' }],
    });
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(['rules', 2]);
    expect(issue?.message).toContain('rows 1 and 3');
  });

  it('treats London and LONDON as the same region', () => {
    const result = createTerritorySchema.safeParse({
      ...valid,
      rules: [
        { country: 'GB', region: 'London' },
        { country: 'GB', region: 'LONDON' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('treats blank region as the same as no region', () => {
    const result = createTerritorySchema.safeParse({
      ...valid,
      rules: [{ country: 'GB' }, { country: 'GB', region: ' ' }],
    });
    expect(result.success).toBe(false);
  });

  it('normalises postal keys for duplicates (SW1A- ≡ sw1a)', () => {
    const result = createTerritorySchema.safeParse({
      ...valid,
      rules: [
        { country: 'GB', postalPrefix: 'SW1A-' },
        { country: 'GB', postalPrefix: 'sw1a' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate member ids', () => {
    const result = createTerritorySchema.safeParse({ ...valid, memberIds: [ID_1, ID_2, ID_1] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['memberIds', 2]);
    expect(result.error?.issues[0]?.message).toContain('rows 1 and 3');
  });

  it('rejects 51 rules and 201 members', () => {
    const rules = Array.from({ length: 51 }, (_, i) => ({ country: 'GB', postalPrefix: `P${i}` }));
    expect(createTerritorySchema.safeParse({ ...valid, rules }).success).toBe(false);
    expect(createTerritorySchema.safeParse({ ...valid, rules: rules.slice(0, 50) }).success).toBe(
      true
    );
    const memberIds = Array.from({ length: 201 }, (_, i) => idFor(i + 1));
    expect(createTerritorySchema.safeParse({ ...valid, memberIds }).success).toBe(false);
    expect(
      createTerritorySchema.safeParse({ ...valid, memberIds: memberIds.slice(0, 200) }).success
    ).toBe(true);
  });

  it('rejects a bad strategy, colour, country and empty name', () => {
    expect(createTerritorySchema.safeParse({ ...valid, strategy: 'RANDOM' }).success).toBe(false);
    expect(createTerritorySchema.safeParse({ ...valid, colorToken: 'gold' }).success).toBe(false);
    expect(createTerritorySchema.safeParse({ ...valid, rules: [{ country: 'UK' }] }).success).toBe(
      false
    );
    expect(createTerritorySchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('allows zero rules and zero members (router enforces BR-4)', () => {
    expect(createTerritorySchema.safeParse({ ...valid, rules: [], memberIds: [] }).success).toBe(
      true
    );
  });
});

describe('other territory schemas', () => {
  it('update requires an id and applies the same refinement', () => {
    expect(updateTerritorySchema.safeParse(valid).success).toBe(false);
    expect(updateTerritorySchema.safeParse({ ...valid, id: ID_1 }).success).toBe(true);
    expect(
      updateTerritorySchema.safeParse({ ...valid, id: ID_1, memberIds: [ID_1, ID_1] }).success
    ).toBe(false);
  });

  it('reorder rejects zero ids', () => {
    expect(reorderTerritoriesSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(reorderTerritoriesSchema.safeParse({ ids: [ID_1] }).success).toBe(true);
  });

  it('setDefault accepts null to clear', () => {
    expect(setDefaultTerritorySchema.safeParse({ id: null }).success).toBe(true);
    expect(setDefaultTerritorySchema.safeParse({ id: ID_1 }).success).toBe(true);
  });

  it('delete requires an id', () => {
    expect(deleteTerritorySchema.safeParse({}).success).toBe(false);
  });

  it('preview has every field optional', () => {
    expect(territoryPreviewSchema.safeParse({}).success).toBe(true);
    expect(
      territoryPreviewSchema.safeParse({ country: 'GB', region: 'London', postalCode: 'SW1A 1AA' })
        .success
    ).toBe(true);
  });
});
