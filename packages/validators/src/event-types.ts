/**
 * PG-203: Module Settings — Event Types and public booking validators (ADR-083).
 *
 * Limits, location types, required-field keys and lead sources derive from the
 * domain (DRY rule); colour tokens are the 18-token tag palette so the swatches,
 * the validator and the `event_types_colorToken_check` CHECK agree. Inputs are
 * strict: `tenantId`, `hostId` and `leadId` are never client-supplied, and the
 * public booking schemas take the firm only from its booking handle.
 */
import { z } from 'zod';
import {
  BOOKING_HORIZON_DAYS,
  BOOKING_MAX_DAYS_PER_QUERY,
  BOOKING_SLUG_PATTERN,
  EVENT_LOCATION_TYPES,
  EVENT_TYPE_LEAD_SOURCES,
  EVENT_TYPE_LIMITS,
  EVENT_TYPE_REQUIRED_FIELDS,
  isReservedBookingHandle,
  type AppointmentType,
  type EventLocationType,
  type EventTypeLeadSource,
  type EventTypeRequiredField,
} from '@intelliflow/domain';
import { appointmentTypeSchema } from './appointment';
import { idSchema } from './common';
import { TAG_COLOR_TOKENS, tagColorTokenSchema } from './contact-settings';

/** How far ahead a public booking may be made; the booking page pages through it. */
export { BOOKING_HORIZON_DAYS };

export const EVENT_TYPE_COLOR_TOKENS = TAG_COLOR_TOKENS;
export const eventTypeColorTokenSchema = tagColorTokenSchema;
export const eventLocationTypeSchema = z.enum(EVENT_LOCATION_TYPES);
export const eventTypeRequiredFieldSchema = z.enum(EVENT_TYPE_REQUIRED_FIELDS);
export const eventTypeLeadSourceSchema = z.enum(EVENT_TYPE_LEAD_SOURCES);

/**
 * Strips C0/C1 control characters, DEL and the Unicode line/paragraph separators (incl. CR/LF
 * and NEL), which have no place in a name or subject.
 */
export function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const lineBreak = code === 0x2028 || code === 0x2029;
    if (code >= 0x20 && !(code >= 0x7f && code <= 0x9f) && !lineBreak) out += ch;
  }
  return out;
}

const blankToNull = (value: string | null | undefined) => (value ? value : null);

export const eventTypeSlugSchema = z
  .string()
  .min(1, 'Booking slug is required')
  .max(EVENT_TYPE_LIMITS.slugMax)
  .regex(BOOKING_SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens');

/**
 * A parseable https URL written with the literal lowercase `https://` prefix, which is
 * exactly what `tenants_bookingPrivacyUrl_check` (`LIKE 'https://%'`) accepts; `HTTPS://x`
 * and `https:x` parse as https but would fail that CHECK.
 */
/** An https URL with no embedded credentials and no control characters (tabs, line breaks). */
function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://') || stripControlChars(value) !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const requiredFieldsSchema = z
  .array(eventTypeRequiredFieldSchema)
  .max(EVENT_TYPE_REQUIRED_FIELDS.length);

const eventTypeFieldsSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(EVENT_TYPE_LIMITS.nameMax),
    slug: eventTypeSlugSchema,
    description: z
      .string()
      .trim()
      .max(EVENT_TYPE_LIMITS.descriptionMax)
      .nullish()
      .transform(blankToNull),
    durationMinutes: z
      .number()
      .int()
      .min(EVENT_TYPE_LIMITS.minDurationMinutes)
      .max(EVENT_TYPE_LIMITS.maxDurationMinutes),
    colorToken: eventTypeColorTokenSchema.default('blue'),
    locationType: eventLocationTypeSchema.default('VIDEO'),
    locationDetails: z
      .string()
      .trim()
      .max(EVENT_TYPE_LIMITS.locationDetailsMax)
      .nullish()
      .transform(blankToNull),
    appointmentType: appointmentTypeSchema.default('MEETING'),
    hostUserId: idSchema,
    requiredFields: requiredFieldsSchema.default([]),
    leadSource: eventTypeLeadSourceSchema.default('BOOKING'),
    isActive: z.boolean().default(true),
  })
  .strict();

type EventTypeFields = z.infer<typeof eventTypeFieldsSchema>;

/** Location rules and duplicate required fields (reported at the second row). */
function refineEventType(data: EventTypeFields, ctx: z.RefinementCtx): void {
  if (data.locationType === 'VIDEO' && data.locationDetails && !isHttpsUrl(data.locationDetails)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter an https:// meeting link',
      path: ['locationDetails'],
    });
  }
  if (data.locationType === 'IN_PERSON' && !data.locationDetails) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter the meeting address',
      path: ['locationDetails'],
    });
  }
  const seen = new Set<string>();
  data.requiredFields.forEach((field, index) => {
    if (seen.has(field)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate required field: ${field}`,
        path: ['requiredFields', index],
      });
    }
    seen.add(field);
  });
}

export const createEventTypeSchema = eventTypeFieldsSchema.superRefine(refineEventType);
export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;

// No defaults on update: a field an update omits must fail validation, never reset the stored
// value (isActive must not reactivate a type; requiredFields must not stop asking for a phone).
export const updateEventTypeSchema = eventTypeFieldsSchema
  .extend({
    id: idSchema,
    colorToken: eventTypeColorTokenSchema,
    locationType: eventLocationTypeSchema,
    appointmentType: appointmentTypeSchema,
    requiredFields: requiredFieldsSchema,
    leadSource: eventTypeLeadSourceSchema,
    isActive: z.boolean(),
  })
  .strict()
  .superRefine(refineEventType);
export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

export const deleteEventTypeSchema = z.object({ id: idSchema }).strict();

// ─── Duplicate booking slugs / names (row DoD: "Zod superRefine for duplicate booking slugs") ──

const catalogEntrySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  slug: z.string(),
});

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * A tenant's catalogue: slugs and names must be unique (case-insensitive). The
 * DB `(tenantId, slug)` unique and `lower(name)` index are authoritative; the
 * router checks a candidate against the stored rows with this before writing.
 */
export const eventTypeCatalogSchema = z.array(catalogEntrySchema).superRefine((entries, ctx) => {
  const slugs = new Map<string, string>();
  const names = new Map<string, string>();
  entries.forEach((entry, index) => {
    const slugKey = normalise(entry.slug);
    const nameKey = normalise(entry.name);
    const slugOwner = slugs.get(slugKey);
    if (slugOwner !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `Booking slug “${entry.slug}” is already used by “${slugOwner}”.`,
        path: [index, 'slug'],
      });
    } else {
      slugs.set(slugKey, entry.name);
    }
    const nameOwner = names.get(nameKey);
    if (nameOwner !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `An event type named “${nameOwner}” already exists.`,
        path: [index, 'name'],
      });
    } else {
      names.set(nameKey, entry.name);
    }
  });
});

/** The first clash between `candidate` and the stored types (excluding the one being edited). */
export function findDuplicateEventTypeField(
  existing: readonly { id: string; name: string; slug: string }[],
  candidate: { name: string; slug: string },
  excludeId?: string | null
): { field: 'slug' | 'name'; clashWith: string } | null {
  const others = existing.filter((t) => t.id !== excludeId);
  const catalog = eventTypeCatalogSchema.safeParse([...others, candidate]);
  if (catalog.success) return null;
  const issue = catalog.error.issues.find((i) => i.path[0] === others.length);
  if (!issue) return null;
  const field = issue.path[1] === 'slug' ? 'slug' : 'name';
  const clash = others.find((t) =>
    field === 'slug'
      ? normalise(t.slug) === normalise(candidate.slug)
      : normalise(t.name) === normalise(candidate.name)
  );
  return clash ? { field, clashWith: clash.name } : null;
}

// ─── Booking link (firm handle + privacy notice) ─────────────────────────────

export const bookingHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(EVENT_TYPE_LIMITS.handleMin, `Use at least ${EVENT_TYPE_LIMITS.handleMin} characters`)
  .max(EVENT_TYPE_LIMITS.handleMax)
  .regex(BOOKING_SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens')
  .refine((handle) => !isReservedBookingHandle(handle), 'That handle is reserved. Choose another.');

export const bookingPrivacyUrlSchema = z
  .string()
  .trim()
  .max(EVENT_TYPE_LIMITS.privacyUrlMax)
  .refine(isHttpsUrl, 'Enter an https:// link to your privacy policy');

export const bookingLinkSchema = z
  .object({
    handle: bookingHandleSchema.nullable(),
    privacyUrl: bookingPrivacyUrlSchema.nullable(),
  })
  .strict();
export type BookingLinkInput = z.infer<typeof bookingLinkSchema>;

// ─── Public booking (unauthenticated; tenant scope comes only from the handle) ──

const publicHandleSchema = z.string().trim().toLowerCase().min(1).max(EVENT_TYPE_LIMITS.handleMax);
const publicSlugSchema = z.string().trim().toLowerCase().min(1).max(EVENT_TYPE_LIMITS.slugMax);

export const publicBookingLookupSchema = z
  .object({ handle: publicHandleSchema, slug: publicSlugSchema })
  .strict();
export type PublicBookingLookupInput = z.infer<typeof publicBookingLookupSchema>;

const isoDateSchema = z.iso.date();

export const publicSlotsInputSchema = z
  .object({
    handle: publicHandleSchema,
    slug: publicSlugSchema,
    fromDate: isoDateSchema,
    days: z.number().int().min(1).max(BOOKING_MAX_DAYS_PER_QUERY),
  })
  .strict();
export type PublicSlotsInput = z.infer<typeof publicSlotsInputSchema>;

export const publicBookAnswersSchema = z
  .object({
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export type PublicBookAnswers = z.infer<typeof publicBookAnswersSchema>;

export const publicBookInputSchema = z
  .object({
    handle: publicHandleSchema,
    slug: publicSlugSchema,
    start: z.iso.datetime({ offset: true }),
    name: z
      .string()
      .max(400)
      .transform((value) => stripControlChars(value).trim())
      .pipe(z.string().min(1, 'Enter your name').max(200)),
    email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
    answers: publicBookAnswersSchema.default({}),
    consent: z.literal(true),
    // Any short value is accepted so the router can return a fake success to bots.
    __honeypot: z.string().max(200).optional(),
  })
  .strict();
export type PublicBookInput = z.infer<typeof publicBookInputSchema>;

// ─── Output contracts (explicit DTOs; no Prisma shapes leak to the web, #772) ──

export interface EventTypeDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  colorToken: string;
  locationType: EventLocationType;
  locationDetails: string | null;
  appointmentType: AppointmentType;
  hostUserId: string;
  hostName: string | null;
  hostAvailable: boolean;
  requiredFields: EventTypeRequiredField[];
  leadSource: EventTypeLeadSource;
  isActive: boolean;
}

export interface BookingLinkDto {
  handle: string | null;
  privacyUrl: string | null;
  availabilityConfigured: boolean;
}

export interface EventTypeListDto {
  items: EventTypeDto[];
  canEdit: boolean;
  bookingLink: BookingLinkDto;
  limits: typeof EVENT_TYPE_LIMITS;
}

/** Slim shape for the New Appointment picker. */
export interface EventTypeOptionDto {
  id: string;
  name: string;
  durationMinutes: number;
  colorToken: string;
  description: string | null;
  locationType: EventLocationType;
  locationDetails: string | null;
  appointmentType: AppointmentType;
}

/** What an anonymous visitor may see about an event type (allowlist). */
export interface PublicEventTypeDto {
  firmName: string;
  eventName: string;
  durationMinutes: number;
  description: string | null;
  locationType: EventLocationType;
  requiredFields: EventTypeRequiredField[];
  timezone: string;
  colorToken: string;
  privacyUrl: string | null;
}

export interface PublicSlotsDto {
  timezone: string;
  days: Array<{ date: string; slots: Array<{ start: string; end: string }> }>;
}

export interface PublicBookResultDto {
  startsAt: string;
  endsAt: string;
  timezone: string;
}
