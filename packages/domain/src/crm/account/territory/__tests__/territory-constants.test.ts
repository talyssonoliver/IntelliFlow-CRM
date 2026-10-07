import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_OWNER_ADMIN_ROLES,
  ISO_COUNTRY_CODES,
  TERRITORY_LIMITS,
  TERRITORY_STRATEGIES,
} from '../territory-constants';

describe('territory constants', () => {
  it('defines the three strategies', () => {
    expect(TERRITORY_STRATEGIES).toEqual(['ROUND_ROBIN', 'LOAD_BALANCE', 'MANUAL']);
  });

  it('lists exactly the 249 assigned ISO 3166-1 alpha-2 codes', () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    expect(ISO_COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(ISO_COUNTRY_CODES).toContain('GB');
    expect(ISO_COUNTRY_CODES).toContain('US');
    expect(ISO_COUNTRY_CODES).not.toContain('UK');
    expect(ISO_COUNTRY_CODES).not.toContain('XK');
  });

  it('is sorted so the list is easy to audit', () => {
    expect([...ISO_COUNTRY_CODES].sort()).toEqual([...ISO_COUNTRY_CODES]);
  });

  it('defines the account-owner admin roles', () => {
    expect(ACCOUNT_OWNER_ADMIN_ROLES).toEqual(['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN']);
  });

  it('defines the BR-20 limits', () => {
    expect(TERRITORY_LIMITS).toMatchObject({
      maxTerritoriesPerTenant: 100,
      maxRulesPerTerritory: 50,
      maxMembersPerTerritory: 200,
      maxRegionLength: 100,
      maxPostalCodeLength: 20,
    });
  });
});
