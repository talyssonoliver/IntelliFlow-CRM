/**
 * PG-203 — tenant event types and public booking (ADR-083).
 *
 * Canonical constants shared by the validators, the API and the DB CHECKs in
 * migration 20261021120100_event_types. Keep the numbers in step with the SQL.
 */
import type { LeadSource } from '../../crm/lead/Lead';

export const EVENT_LOCATION_TYPES = ['IN_PERSON', 'PHONE', 'VIDEO', 'CUSTOM'] as const;
export type EventLocationType = (typeof EVENT_LOCATION_TYPES)[number];

/** Optional booker details an event type can require (name and email are always required). */
export const EVENT_TYPE_REQUIRED_FIELDS = ['phone', 'company', 'notes'] as const;
export type EventTypeRequiredField = (typeof EVENT_TYPE_REQUIRED_FIELDS)[number];

/** Lead sources an admin may give booking-created leads (owner ruling Q8). */
export const EVENT_TYPE_LEAD_SOURCES = [
  'WEBSITE',
  'BOOKING',
] as const satisfies readonly LeadSource[];
export type EventTypeLeadSource = (typeof EVENT_TYPE_LEAD_SOURCES)[number];

export const EVENT_TYPE_LIMITS = {
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
} as const;

/** Lowercase kebab-case; the same pattern backs the slug and booking-handle CHECKs. */
export const BOOKING_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Handles that would read like an app route or a platform page. */
export const BOOKING_RESERVED_HANDLES = [
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
] as const;

export function isReservedBookingHandle(handle: string): boolean {
  return (BOOKING_RESERVED_HANDLES as readonly string[]).includes(handle.toLowerCase());
}

/** A slot must start at least this far ahead. */
export const BOOKING_NOTICE_MINUTES = 60;
/** Slots are offered up to this many days ahead. */
export const BOOKING_HORIZON_DAYS = 60;
export const BOOKING_SLOT_STEP_MINUTES = 15;
export const BOOKING_MAX_SLOTS_PER_DAY = 48;
export const BOOKING_MAX_DAYS_PER_QUERY = 14;
/** Version of the consent text shown on the booking form; stored with each booking. */
export const BOOKING_CONSENT_VERSION = '2026-10-20';

/** Abuse caps counted from booking_attempts (runner requirements R1/R6). */
export const BOOKING_CAPS = {
  perEmailPerDay: 3,
  perIpPerHour: 10,
  perEventTypePerHour: 30,
  attemptRetentionHours: 48,
} as const;

/** Split a booker's full name on the first whitespace run (the full name is kept separately). */
export function splitBookerName(name: string): { firstName?: string; lastName?: string } {
  const trimmed = name.trim();
  if (trimmed === '') return { firstName: undefined, lastName: undefined };
  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) return { firstName: trimmed, lastName: undefined };
  return {
    firstName: trimmed.slice(0, firstSpace),
    lastName: trimmed.slice(firstSpace).trimStart(),
  };
}
