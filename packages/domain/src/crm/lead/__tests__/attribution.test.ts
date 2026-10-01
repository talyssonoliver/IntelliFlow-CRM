import { describe, it, expect } from 'vitest';
import {
  LEAD_ATTRIBUTION_FIELDS,
  deriveLeadChannel,
  mapAttributionToLeadFields,
} from '../attribution';

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

describe('deriveLeadChannel', () => {
  it('classifies a gclid value as paid-search, even over utmMedium', () => {
    expect(deriveLeadChannel({ clickId: 'Cj0KCQjw-abc', utmMedium: 'email' })).toBe('paid-search');
    expect(deriveLeadChannel({ clickId: 'EAIaIQobChMI' })).toBe('paid-search');
    expect(deriveLeadChannel({ clickId: 'gclid=abc123' })).toBe('paid-search');
  });

  it('classifies an fbclid value as paid-social', () => {
    expect(deriveLeadChannel({ clickId: 'IwAR2abcdef' })).toBe('paid-social');
    expect(deriveLeadChannel({ clickId: 'fbclid=xyz' })).toBe('paid-social');
  });

  it('falls back to utmMedium (lower-cased) when the click id is unrecognised', () => {
    expect(deriveLeadChannel({ clickId: 'zzz', utmMedium: 'Email' })).toBe('email');
  });

  it('falls back to the referrer host, for full URLs and bare hosts', () => {
    expect(deriveLeadChannel({ referrer: 'https://www.google.com/search?q=x' })).toBe('google.com');
    expect(deriveLeadChannel({ referrer: 'news.example.org' })).toBe('news.example.org');
  });

  it("returns 'direct' when nothing identifies the source", () => {
    expect(deriveLeadChannel(undefined)).toBe('direct');
    expect(deriveLeadChannel({})).toBe('direct');
    expect(deriveLeadChannel({ referrer: 'http://' })).toBe('direct');
  });
});
