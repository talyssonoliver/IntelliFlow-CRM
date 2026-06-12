import { describe, it, expect } from 'vitest';

import { buildContactMapsHref } from './contact-detail-actions';

describe('buildContactMapsHref (IFC-257)', () => {
  it('returns null for an empty location', () => {
    expect(buildContactMapsHref('')).toBeNull();
  });

  it('returns null for whitespace-only location', () => {
    expect(buildContactMapsHref('   ')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(buildContactMapsHref(null)).toBeNull();
    expect(buildContactMapsHref(undefined)).toBeNull();
  });

  it('builds an encoded Google Maps search URL', () => {
    expect(buildContactMapsHref('London, UK')).toBe(
      'https://www.google.com/maps/search/?api=1&query=London%2C%20UK'
    );
  });

  it('trims surrounding whitespace before building', () => {
    expect(buildContactMapsHref('  Paris  ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Paris'
    );
  });
});
