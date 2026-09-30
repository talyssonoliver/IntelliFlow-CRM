import { describe, it, expect } from 'vitest';
import { LEAD_ATTRIBUTION_FIELDS, mapAttributionToLeadFields } from '../attribution';

describe('mapAttributionToLeadFields', () => {
  it('maps every attribution field to the Lead column of the same name', () => {
    const input = {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring-sale',
      utmContent: 'headline-a',
      utmTerm: 'crm software',
      clickId: 'gclid-123',
      referrer: 'https://www.google.com/',
      landingPath: '/pricing?plan=pro',
    };

    expect(mapAttributionToLeadFields(input)).toEqual(input);
    expect(Object.keys(input).sort()).toEqual([...LEAD_ATTRIBUTION_FIELDS].sort());
  });

  it('returns an empty object for a missing attribution', () => {
    expect(mapAttributionToLeadFields(undefined)).toEqual({});
    expect(mapAttributionToLeadFields(null)).toEqual({});
    expect(mapAttributionToLeadFields({})).toEqual({});
  });

  it('trims values and drops empty, whitespace-only, null and non-string ones', () => {
    const result = mapAttributionToLeadFields({
      utmSource: '  google  ',
      utmMedium: '',
      utmCampaign: '   ',
      utmContent: null,
      utmTerm: undefined,
      clickId: 42 as unknown as string,
    });

    expect(result).toEqual({ utmSource: 'google' });
    expect('utmMedium' in result).toBe(false);
  });

  it('ignores unknown keys so the result is safe to spread into a create', () => {
    const result = mapAttributionToLeadFields({
      utmSource: 'x',
      tenantId: 'evil',
      ownerId: 'evil',
    } as never);

    expect(result).toEqual({ utmSource: 'x' });
  });

  it('cuts values at the per-field length cap', () => {
    const result = mapAttributionToLeadFields({
      utmSource: 'a'.repeat(500),
      clickId: 'b'.repeat(900),
      referrer: 'c'.repeat(5000),
    });

    expect(result.utmSource).toHaveLength(200);
    expect(result.clickId).toHaveLength(500);
    expect(result.referrer).toHaveLength(2000);
  });
});
