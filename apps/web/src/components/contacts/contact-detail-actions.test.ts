import { describe, it, expect } from 'vitest';

import { buildContactLocation, buildContactMapsHref } from './contact-detail-actions';

describe('buildContactLocation (IFC-257)', () => {
  it('joins street, city and zip with commas', () => {
    expect(
      buildContactLocation({ streetAddress: '123 Main St', city: 'London', zipCode: 'EC1A 1BB' })
    ).toBe('123 Main St, London, EC1A 1BB');
  });

  it('drops empty/whitespace and null/undefined parts', () => {
    expect(buildContactLocation({ streetAddress: '  ', city: 'Paris', zipCode: null })).toBe(
      'Paris'
    );
    expect(buildContactLocation({ city: undefined })).toBe('');
  });

  it('returns an empty string when no part is set', () => {
    expect(buildContactLocation({})).toBe('');
  });
});

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
