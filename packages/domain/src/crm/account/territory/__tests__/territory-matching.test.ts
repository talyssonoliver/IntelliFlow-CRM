import { describe, it, expect } from 'vitest';
import {
  compareTerritoryEvaluationOrder,
  isIsoCountryCode,
  normalizeCountry,
  normalizePostalCode,
  normalizeRegion,
  pickTerritoryAssignee,
  planTerritoryAssignment,
  postalMatchKey,
  regionMatchKey,
  resolveTerritory,
  territoryRuleMatches,
  type TerritoryCandidate,
  type TerritoryMemberRef,
} from '../territory-matching';

function territory(overrides: Partial<TerritoryCandidate> & { id: string }): TerritoryCandidate {
  return {
    priority: 0,
    isActive: true,
    isDefault: false,
    strategy: 'ROUND_ROBIN',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    rules: [],
    ...overrides,
  };
}

const gb = { country: 'GB' };

describe('normalisers', () => {
  it('normalises country, region and postal code (BR-1)', () => {
    expect(normalizeCountry(' gb ')).toBe('GB');
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeRegion('  North   West ')).toBe('North West');
    expect(normalizeRegion(' ')).toBeNull();
    expect(normalizeRegion(null)).toBeNull();
    expect(normalizePostalCode('sw1a  1aa')).toBe('SW1A 1AA');
    expect(normalizePostalCode('')).toBeNull();
    expect(normalizePostalCode(undefined)).toBeNull();
  });

  it('builds match keys', () => {
    expect(postalMatchKey('sw1a-1aa')).toBe('SW1A1AA');
    expect(postalMatchKey(' - ')).toBeNull();
    expect(postalMatchKey(null)).toBeNull();
    expect(regionMatchKey(' LONDON ')).toBe('london');
    expect(regionMatchKey(undefined)).toBeNull();
  });

  it('checks the ISO list', () => {
    expect(isIsoCountryCode('GB')).toBe(true);
    expect(isIsoCountryCode('UK')).toBe(false);
  });
});

describe('territoryRuleMatches (BR-5)', () => {
  it('matches on exact country only', () => {
    expect(territoryRuleMatches({ country: 'GB' }, { country: 'gb' })).toBe(true);
    expect(territoryRuleMatches({ country: 'GB' }, { country: 'US' })).toBe(false);
    expect(territoryRuleMatches({ country: 'GB' }, {})).toBe(false);
  });

  it('matches region case-insensitively; account without region does not match', () => {
    const rule = { country: 'GB', region: 'London' };
    expect(territoryRuleMatches(rule, { country: 'GB', region: ' LONDON ' })).toBe(true);
    expect(territoryRuleMatches(rule, { country: 'GB', region: 'Leeds' })).toBe(false);
    expect(territoryRuleMatches(rule, { country: 'GB' })).toBe(false);
  });

  it('matches postal prefix on the match key; account without postal code does not match', () => {
    const rule = { country: 'GB', postalPrefix: 'SW1A' };
    expect(territoryRuleMatches(rule, { country: 'GB', postalCode: 'sw1a-1aa' })).toBe(true);
    expect(territoryRuleMatches(rule, { country: 'GB', postalCode: 'EC1A 1BB' })).toBe(false);
    expect(territoryRuleMatches(rule, { country: 'GB' })).toBe(false);
  });

  it('treats blank region / prefix as wildcards', () => {
    const rule = { country: 'GB', region: ' ', postalPrefix: '' };
    expect(territoryRuleMatches(rule, { country: 'GB' })).toBe(true);
    expect(territoryRuleMatches({ country: 'GB', region: null, postalPrefix: null }, gb)).toBe(
      true
    );
  });
});

describe('resolveTerritory (BR-6/BR-7)', () => {
  const rule = [{ country: 'GB' }];

  it('picks the highest priority match', () => {
    const low = territory({ id: 'low', priority: 1, rules: rule });
    const high = territory({ id: 'high', priority: 5, rules: rule });
    expect(resolveTerritory(gb, [low, high])).toEqual({ territory: high, matchedBy: 'rule' });
  });

  it('breaks ties by oldest createdAt, then id', () => {
    const older = territory({ id: 'b', rules: rule, createdAt: new Date('2025-01-01') });
    const newer = territory({ id: 'a', rules: rule, createdAt: new Date('2026-06-01') });
    expect(resolveTerritory(gb, [newer, older])?.territory.id).toBe('b');
    const x = territory({ id: 'x', rules: rule });
    const y = territory({ id: 'y', rules: rule });
    expect(resolveTerritory(gb, [y, x])?.territory.id).toBe('x');
  });

  it('ignores inactive territories', () => {
    const inactive = territory({ id: 'off', priority: 9, isActive: false, rules: rule });
    const active = territory({ id: 'on', priority: 1, rules: rule });
    expect(resolveTerritory(gb, [inactive, active])?.territory.id).toBe('on');
  });

  it('lets the default territory compete by its rules', () => {
    const def = territory({ id: 'def', priority: 9, isDefault: true, rules: rule });
    const other = territory({ id: 'other', priority: 1, rules: rule });
    expect(resolveTerritory(gb, [other, def])).toEqual({ territory: def, matchedBy: 'rule' });
  });

  it('falls back to the default when nothing matches and when there is no geography', () => {
    const def = territory({ id: 'def', isDefault: true });
    const us = territory({ id: 'us', rules: [{ country: 'US' }] });
    expect(resolveTerritory(gb, [us, def])).toEqual({ territory: def, matchedBy: 'default' });
    expect(resolveTerritory({}, [us, def])).toEqual({ territory: def, matchedBy: 'default' });
  });

  it('ignores an inactive default and returns null when there is no default', () => {
    const def = territory({ id: 'def', isDefault: true, isActive: false });
    expect(resolveTerritory(gb, [def])).toBeNull();
    expect(resolveTerritory(gb, [])).toBeNull();
  });

  it('orders identical territories as equal', () => {
    const t = territory({ id: 't' });
    expect(compareTerritoryEvaluationOrder(t, t)).toBe(0);
  });
});

describe('planTerritoryAssignment (BR-8..BR-11)', () => {
  const members = (...ids: string[]): TerritoryMemberRef[] =>
    ids.map((userId, i) => ({ userId, sortOrder: i }));
  const eligible = (entries: Record<string, TerritoryMemberRef[]>) =>
    new Map(Object.entries(entries));

  const rr = territory({ id: 'rr', strategy: 'ROUND_ROBIN' });
  const lb = territory({ id: 'lb', strategy: 'LOAD_BALANCE' });
  const manual = territory({ id: 'manual', strategy: 'MANUAL' });
  const def = territory({ id: 'def', isDefault: true, strategy: 'LOAD_BALANCE' });

  it('returns creator/no_match without a resolution', () => {
    expect(
      planTerritoryAssignment({
        resolution: null,
        defaultTerritory: null,
        eligibleByTerritory: new Map(),
      })
    ).toEqual({ kind: 'creator', reason: 'no_match', territory: null, needsCursor: false });
  });

  it('plans a cursor for round-robin with members ordered by (sortOrder, userId)', () => {
    const plan = planTerritoryAssignment({
      resolution: { territory: rr, matchedBy: 'rule' },
      defaultTerritory: null,
      eligibleByTerritory: eligible({
        rr: [
          { userId: 'u3', sortOrder: 1 },
          { userId: 'u2', sortOrder: 0 },
          { userId: 'u1', sortOrder: 1 },
          { userId: 'u1', sortOrder: 1 },
        ],
      }),
    });
    expect(plan).toMatchObject({ kind: 'cursor', needsCursor: true, fallbackFrom: null });
    expect(plan.kind === 'cursor' && plan.eligible).toEqual(['u2', 'u1', 'u1', 'u3']);
  });

  it('plans a load lookup for load-balance', () => {
    const plan = planTerritoryAssignment({
      resolution: { territory: lb, matchedBy: 'rule' },
      defaultTerritory: null,
      eligibleByTerritory: eligible({ lb: members('a', 'b') }),
    });
    expect(plan).toMatchObject({
      kind: 'load',
      territory: lb,
      eligible: ['a', 'b'],
      needsCursor: false,
    });
  });

  it('MANUAL leaves the creator as owner, even with zero members', () => {
    expect(
      planTerritoryAssignment({
        resolution: { territory: manual, matchedBy: 'rule' },
        defaultTerritory: def,
        eligibleByTerritory: new Map(),
      })
    ).toEqual({ kind: 'creator', reason: 'manual', territory: manual, needsCursor: false });
  });

  it('falls back to a different active default with its own strategy, without a cursor', () => {
    const plan = planTerritoryAssignment({
      resolution: { territory: rr, matchedBy: 'rule' },
      defaultTerritory: def,
      eligibleByTerritory: eligible({ rr: [], def: members('d1') }),
    });
    expect(plan).toMatchObject({
      kind: 'load',
      territory: def,
      fallbackFrom: rr,
      needsCursor: false,
    });
  });

  it('falls back to a round-robin default with a cursor on the default', () => {
    const rrDefault = territory({ id: 'rrdef', isDefault: true, strategy: 'ROUND_ROBIN' });
    const plan = planTerritoryAssignment({
      resolution: { territory: lb, matchedBy: 'rule' },
      defaultTerritory: rrDefault,
      eligibleByTerritory: eligible({ rrdef: members('d1') }),
    });
    expect(plan).toMatchObject({ kind: 'cursor', territory: rrDefault, fallbackFrom: lb });
  });

  const noEligible = {
    kind: 'creator',
    reason: 'no_eligible_members',
    territory: rr,
    needsCursor: false,
  };

  it.each([
    ['the default is the winner', rr, rr],
    ['the default is MANUAL', rr, territory({ id: 'm', isDefault: true, strategy: 'MANUAL' })],
    ['the default is absent', rr, null],
    ['the default is inactive', rr, territory({ id: 'x', isDefault: true, isActive: false })],
    ['the default also has no eligible members', rr, def],
  ])('creator owns when %s', (_label, winner, defaultTerritory) => {
    expect(
      planTerritoryAssignment({
        resolution: { territory: winner, matchedBy: 'rule' },
        defaultTerritory,
        eligibleByTerritory: eligible({ rr: [], def: [] }),
      })
    ).toEqual(noEligible);
  });
});

describe('pickTerritoryAssignee', () => {
  it('round-robin picks eligible[(cursor-1) mod n] and wraps', () => {
    const eligible = ['a', 'b', 'c'];
    expect(pickTerritoryAssignee({ kind: 'cursor', eligible, cursor: 1 })).toBe('a');
    expect(pickTerritoryAssignee({ kind: 'cursor', eligible, cursor: 3 })).toBe('c');
    expect(pickTerritoryAssignee({ kind: 'cursor', eligible, cursor: 4 })).toBe('a');
    expect(pickTerritoryAssignee({ kind: 'cursor', eligible, cursor: 0 })).toBe('c');
  });

  it('load-balance picks the fewest accounts; zero-count members count 0; ties by order', () => {
    const eligible = ['a', 'b', 'c'];
    expect(
      pickTerritoryAssignee({
        kind: 'load',
        eligible,
        loadByUser: new Map([
          ['a', 3],
          ['b', 1],
          ['c', 2],
        ]),
      })
    ).toBe('b');
    expect(
      pickTerritoryAssignee({
        kind: 'load',
        eligible,
        loadByUser: new Map([
          ['a', 2],
          ['b', 2],
        ]),
      })
    ).toBe('c');
    expect(
      pickTerritoryAssignee({
        kind: 'load',
        eligible,
        loadByUser: new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      })
    ).toBe('a');
  });

  it('returns null for creator plans and empty lists', () => {
    expect(pickTerritoryAssignee({ kind: 'creator' })).toBeNull();
    expect(pickTerritoryAssignee({ kind: 'cursor', eligible: [], cursor: 1 })).toBeNull();
  });
});
