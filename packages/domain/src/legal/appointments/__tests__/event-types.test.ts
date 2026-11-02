/**
 * PG-203 — event-type and public-booking domain constants and helpers.
 */
import { describe, it, expect } from 'vitest';
import { LEAD_SOURCES } from '../../../crm/lead/Lead';
import {
  BOOKING_CAPS,
  BOOKING_CONSENT_VERSION,
  BOOKING_HORIZON_DAYS,
  BOOKING_MAX_DAYS_PER_QUERY,
  BOOKING_MAX_SLOTS_PER_DAY,
  BOOKING_NOTICE_MINUTES,
  BOOKING_RESERVED_HANDLES,
  BOOKING_SLOT_STEP_MINUTES,
  BOOKING_SLUG_PATTERN,
  EVENT_LOCATION_TYPES,
  EVENT_TYPE_LEAD_SOURCES,
  EVENT_TYPE_LIMITS,
  EVENT_TYPE_REQUIRED_FIELDS,
  isReservedBookingHandle,
  splitBookerName,
} from '../event-types';

describe('event-type constants', () => {
  it('defines the location types, required fields and lead sources', () => {
    expect(EVENT_LOCATION_TYPES).toEqual(['IN_PERSON', 'PHONE', 'VIDEO', 'CUSTOM']);
    expect(EVENT_TYPE_REQUIRED_FIELDS).toEqual(['phone', 'company', 'notes']);
    expect(EVENT_TYPE_LEAD_SOURCES).toEqual(['WEBSITE', 'BOOKING']);
  });

  it('only offers lead sources the Lead aggregate accepts, including BOOKING', () => {
    expect(LEAD_SOURCES).toContain('BOOKING');
    for (const source of EVENT_TYPE_LEAD_SOURCES) expect(LEAD_SOURCES).toContain(source);
  });

  it('pins the limits the validators and DB CHECKs share', () => {
    expect(EVENT_TYPE_LIMITS).toEqual({
      maxPerTenant: 50,
      nameMax: 100,
      slugMax: 60,
      descriptionMax: 2000,
      minDurationMinutes: 5,
      maxDurationMinutes: 480,
      locationDetailsMax: 500,
      handleMin: 3,
      handleMax: 40,
      privacyUrlMax: 500,
    });
  });

  it('pins the booking window, grid and caps', () => {
    expect(BOOKING_NOTICE_MINUTES).toBe(60);
    expect(BOOKING_HORIZON_DAYS).toBe(60);
    expect(BOOKING_SLOT_STEP_MINUTES).toBe(15);
    expect(BOOKING_MAX_SLOTS_PER_DAY).toBe(48);
    expect(BOOKING_MAX_DAYS_PER_QUERY).toBe(14);
    expect(BOOKING_CAPS).toEqual({
      perEmailPerDay: 3,
      perIpPerHour: 10,
      perEventTypePerHour: 30,
      attemptRetentionHours: 48,
    });
    expect(BOOKING_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts kebab-case slugs only', () => {
    for (const ok of ['consultation', 'intro-call', 'a1-b2-c3', 'x']) {
      expect(BOOKING_SLUG_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of [
      'Intro',
      'intro_call',
      '-intro',
      'intro-',
      'intro--call',
      'intro call',
      '',
    ]) {
      expect(BOOKING_SLUG_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('isReservedBookingHandle', () => {
  it('rejects the reserved words regardless of case', () => {
    for (const word of BOOKING_RESERVED_HANDLES) {
      expect(isReservedBookingHandle(word)).toBe(true);
      expect(isReservedBookingHandle(word.toUpperCase())).toBe(true);
    }
    expect(BOOKING_RESERVED_HANDLES).toEqual(
      expect.arrayContaining([
        'admin',
        'api',
        'app',
        'book',
        'www',
        'help',
        'support',
        'login',
        'signup',
        'settings',
      ])
    );
  });

  it('allows ordinary firm handles', () => {
    expect(isReservedBookingHandle('smith-law')).toBe(false);
    expect(isReservedBookingHandle('booking')).toBe(false);
  });
});

describe('splitBookerName', () => {
  it('splits on the first whitespace run', () => {
    expect(splitBookerName('Ada Lovelace')).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(splitBookerName('Mary  Ann   Evans')).toEqual({
      firstName: 'Mary',
      lastName: 'Ann   Evans',
    });
  });

  it('keeps a single token as the first name only', () => {
    expect(splitBookerName('Cher')).toEqual({ firstName: 'Cher', lastName: undefined });
  });

  it('trims surrounding whitespace and returns undefined parts for blank input', () => {
    expect(splitBookerName('  Grace Hopper  ')).toEqual({ firstName: 'Grace', lastName: 'Hopper' });
    expect(splitBookerName('   ')).toEqual({ firstName: undefined, lastName: undefined });
  });
});
