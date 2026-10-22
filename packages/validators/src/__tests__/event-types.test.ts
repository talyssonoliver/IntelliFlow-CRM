/**
 * PG-203 — event types + public booking validators (ADR-083).
 */
import { describe, it, expect } from 'vitest';
import { TAG_COLOR_TOKENS } from '../contact-settings';
import {
  EVENT_TYPE_COLOR_TOKENS,
  bookingHandleSchema,
  bookingLinkSchema,
  createEventTypeSchema,
  deleteEventTypeSchema,
  eventTypeCatalogSchema,
  findDuplicateEventTypeField,
  publicBookInputSchema,
  publicBookingLookupSchema,
  publicSlotsInputSchema,
  updateEventTypeSchema,
} from '../event-types';

const ID = 'clh1234567890abcdef';
const HOST = 'clh0987654321fedcba';

function valid(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Initial consultation',
    slug: 'initial-consultation',
    description: 'A first 30-minute call.',
    durationMinutes: 30,
    colorToken: 'blue',
    locationType: 'VIDEO',
    locationDetails: 'https://meet.example.invalid/firm',
    appointmentType: 'CONSULTATION',
    hostUserId: HOST,
    requiredFields: ['phone'],
    leadSource: 'BOOKING',
    isActive: true,
    ...overrides,
  };
}

const issuePaths = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
}) => (result.success ? [] : result.error!.issues.map((i) => i.path.join('.')));

describe('createEventTypeSchema', () => {
  it('accepts a full valid event type and applies defaults', () => {
    const parsed = createEventTypeSchema.parse({
      name: 'Call',
      slug: 'call',
      durationMinutes: 15,
      hostUserId: HOST,
    });
    expect(parsed).toMatchObject({
      colorToken: 'blue',
      locationType: 'VIDEO',
      locationDetails: null,
      description: null,
      appointmentType: 'MEETING',
      requiredFields: [],
      leadSource: 'BOOKING',
      isActive: true,
    });
    expect(createEventTypeSchema.safeParse(valid()).success).toBe(true);
  });

  it('trims the name and bounds it to 1..100', () => {
    expect(createEventTypeSchema.parse(valid({ name: '  Intro  ' })).name).toBe('Intro');
    expect(createEventTypeSchema.safeParse(valid({ name: '   ' })).success).toBe(false);
    expect(createEventTypeSchema.safeParse(valid({ name: 'x'.repeat(101) })).success).toBe(false);
  });

  it('requires a kebab-case slug of at most 60 characters', () => {
    for (const slug of ['Intro', 'intro_call', '-intro', 'intro--call', '', 'x'.repeat(61)]) {
      expect(createEventTypeSchema.safeParse(valid({ slug })).success).toBe(false);
    }
    expect(createEventTypeSchema.safeParse(valid({ slug: 'x'.repeat(60) })).success).toBe(true);
  });

  it('bounds the duration to whole minutes in 5..480', () => {
    for (const durationMinutes of [4, 481, 30.5, 0]) {
      expect(createEventTypeSchema.safeParse(valid({ durationMinutes })).success).toBe(false);
    }
    for (const durationMinutes of [5, 480]) {
      expect(createEventTypeSchema.safeParse(valid({ durationMinutes })).success).toBe(true);
    }
  });

  it('accepts exactly the 18 tag colour tokens', () => {
    expect(EVENT_TYPE_COLOR_TOKENS).toEqual(TAG_COLOR_TOKENS);
    for (const colorToken of TAG_COLOR_TOKENS) {
      expect(createEventTypeSchema.safeParse(valid({ colorToken })).success).toBe(true);
    }
    expect(createEventTypeSchema.safeParse(valid({ colorToken: 'gold' })).success).toBe(false);
  });

  it('requires an https meeting link when the details of a VIDEO type are set', () => {
    for (const locationDetails of [
      'http://meet.example.invalid',
      'javascript:alert(1)',
      'not a url',
    ]) {
      const result = createEventTypeSchema.safeParse(valid({ locationDetails }));
      expect(issuePaths(result)).toContain('locationDetails');
    }
    expect(createEventTypeSchema.safeParse(valid({ locationDetails: null })).success).toBe(true);
  });

  it('requires an address for IN_PERSON and caps details at 500', () => {
    const missing = createEventTypeSchema.safeParse(
      valid({ locationType: 'IN_PERSON', locationDetails: '  ' })
    );
    expect(issuePaths(missing)).toContain('locationDetails');
    expect(
      createEventTypeSchema.safeParse(
        valid({ locationType: 'IN_PERSON', locationDetails: '1 High St' })
      ).success
    ).toBe(true);
    expect(
      createEventTypeSchema.safeParse(
        valid({ locationType: 'CUSTOM', locationDetails: 'x'.repeat(501) })
      ).success
    ).toBe(false);
    expect(
      createEventTypeSchema.safeParse(valid({ locationType: 'PHONE', locationDetails: null }))
        .success
    ).toBe(true);
  });

  it('caps the description at 2000 characters and maps blank to null', () => {
    expect(createEventTypeSchema.parse(valid({ description: '   ' })).description).toBeNull();
    expect(createEventTypeSchema.safeParse(valid({ description: 'x'.repeat(2001) })).success).toBe(
      false
    );
  });

  it('allows only phone/company/notes as required fields, without duplicates', () => {
    expect(createEventTypeSchema.safeParse(valid({ requiredFields: ['email'] })).success).toBe(
      false
    );
    const dup = createEventTypeSchema.safeParse(
      valid({ requiredFields: ['phone', 'notes', 'phone'] })
    );
    expect(issuePaths(dup)).toEqual(['requiredFields.2']);
  });

  it('allows only WEBSITE or BOOKING as the lead source', () => {
    expect(createEventTypeSchema.safeParse(valid({ leadSource: 'WEBSITE' })).success).toBe(true);
    expect(createEventTypeSchema.safeParse(valid({ leadSource: 'EVENT' })).success).toBe(false);
  });

  it('is strict: no AI toggle, no tenantId, no id on create', () => {
    for (const extra of [{ aiScoringEnabled: false }, { tenantId: 'tenant-1' }, { id: ID }]) {
      expect(createEventTypeSchema.safeParse(valid(extra)).success).toBe(false);
    }
  });

  it('requires a host id', () => {
    expect(createEventTypeSchema.safeParse(valid({ hostUserId: undefined })).success).toBe(false);
    expect(createEventTypeSchema.safeParse(valid({ hostUserId: 'not-an-id' })).success).toBe(false);
  });
});

describe('updateEventTypeSchema / deleteEventTypeSchema', () => {
  it('requires id and an explicit isActive on update', () => {
    expect(updateEventTypeSchema.safeParse({ ...valid(), id: ID }).success).toBe(true);
    const noActive = { ...valid(), id: ID } as Record<string, unknown>;
    delete noActive.isActive;
    expect(updateEventTypeSchema.safeParse(noActive).success).toBe(false);
    expect(updateEventTypeSchema.safeParse(valid()).success).toBe(false);
  });

  it('takes only an id on delete', () => {
    expect(deleteEventTypeSchema.safeParse({ id: ID }).success).toBe(true);
    expect(deleteEventTypeSchema.safeParse({ id: ID, tenantId: 't' }).success).toBe(false);
  });
});

describe('eventTypeCatalogSchema (row DoD: superRefine for duplicate booking slugs)', () => {
  it('reports a duplicate slug at the second item, case-insensitively', () => {
    const result = eventTypeCatalogSchema.safeParse([
      { id: ID, name: 'Intro', slug: 'intro' },
      { name: 'Other', slug: 'call' },
      { name: 'Intro again', slug: 'INTRO' },
    ]);
    expect(result.success).toBe(false);
    expect(result.error!.issues).toEqual([
      expect.objectContaining({
        path: [2, 'slug'],
        message: 'Booking slug “INTRO” is already used by “Intro”.',
      }),
    ]);
  });

  it('reports a duplicate name at the second item', () => {
    const result = eventTypeCatalogSchema.safeParse([
      { name: 'Intro', slug: 'a' },
      { name: ' intro ', slug: 'b' },
    ]);
    expect(issuePaths(result)).toEqual(['1.name']);
  });

  it('accepts a catalogue with unique names and slugs', () => {
    expect(
      eventTypeCatalogSchema.safeParse([
        { name: 'Intro', slug: 'intro' },
        { name: 'Review', slug: 'review' },
      ]).success
    ).toBe(true);
  });
});

describe('findDuplicateEventTypeField', () => {
  const existing = [
    { id: 'a', name: 'Intro', slug: 'intro' },
    { id: 'b', name: 'Review', slug: 'review' },
  ];
  it('finds a clash by slug or name, ignoring the row being edited', () => {
    expect(findDuplicateEventTypeField(existing, { name: 'New', slug: 'REVIEW' })).toEqual({
      field: 'slug',
      clashWith: 'Review',
    });
    expect(findDuplicateEventTypeField(existing, { name: 'intro', slug: 'x' })).toEqual({
      field: 'name',
      clashWith: 'Intro',
    });
    expect(findDuplicateEventTypeField(existing, { name: 'Intro', slug: 'intro' }, 'a')).toBeNull();
  });
});

describe('bookingHandleSchema / bookingLinkSchema', () => {
  it('lowercases, trims and bounds the handle to 3..40 kebab-case', () => {
    expect(bookingHandleSchema.parse('  Smith-Law ')).toBe('smith-law');
    for (const handle of ['ab', 'x'.repeat(41), 'smith_law', 'smith--law', '-smith']) {
      expect(bookingHandleSchema.safeParse(handle).success).toBe(false);
    }
  });

  it('rejects reserved handles', () => {
    for (const handle of ['admin', 'API', 'book', 'settings']) {
      const result = bookingHandleSchema.safeParse(handle);
      expect(result.success).toBe(false);
      expect(result.error!.issues[0].message).toMatch(/reserved/i);
    }
  });

  it('accepts null to clear the handle and the privacy URL', () => {
    expect(bookingLinkSchema.parse({ handle: null, privacyUrl: null })).toEqual({
      handle: null,
      privacyUrl: null,
    });
  });

  it('requires an https privacy URL of at most 500 characters', () => {
    expect(
      bookingLinkSchema.safeParse({
        handle: 'smith-law',
        privacyUrl: 'https://firm.example.invalid/privacy',
      }).success
    ).toBe(true);
    for (const privacyUrl of [
      'http://firm.example.invalid/privacy',
      'ftp://x.example.invalid',
      `https://x.example.invalid/${'p'.repeat(500)}`,
      // Parse as https but fail the DB CHECK LIKE 'https://%' (codex finding 14dc88a3).
      'HTTPS://firm.example.invalid/privacy',
      'https:firm.example.invalid/privacy',
      // Embedded credentials and control characters (security review F7). Built from parts so
      // no credential-shaped literal lives in the repo.
      ['https://', 'u', ':', 'p', '@', 'firm.example.invalid/privacy'].join(''),
      `https://firm.example.invalid/pri${String.fromCodePoint(9)}vacy`,
    ]) {
      expect(bookingLinkSchema.safeParse({ handle: 'smith-law', privacyUrl }).success).toBe(false);
    }
  });

  it('is strict', () => {
    expect(
      bookingLinkSchema.safeParse({ handle: null, privacyUrl: null, tenantId: 't' }).success
    ).toBe(false);
  });
});

describe('public booking schemas (all strict: tenant scope comes only from the handle)', () => {
  const lookup = { handle: 'smith-law', slug: 'intro' };
  const book = {
    ...lookup,
    start: '2026-11-02T10:00:00.000Z',
    name: 'Ada Lovelace',
    email: 'Ada@Example.invalid',
    answers: { phone: '+44 20 7946 0000' },
    consent: true,
    __honeypot: '',
  };

  it('rejects tenantId, hostId, hostUserId and leadId on every procedure', () => {
    for (const extra of [
      { tenantId: 't' },
      { hostId: 'h' },
      { hostUserId: 'h' },
      { leadId: 'l' },
    ]) {
      expect(publicBookingLookupSchema.safeParse({ ...lookup, ...extra }).success).toBe(false);
      expect(
        publicSlotsInputSchema.safeParse({ ...lookup, fromDate: '2026-11-02', days: 7, ...extra })
          .success
      ).toBe(false);
      expect(publicBookInputSchema.safeParse({ ...book, ...extra }).success).toBe(false);
    }
  });

  it('bounds the slot query to a valid date and 1..14 days', () => {
    expect(
      publicSlotsInputSchema.safeParse({ ...lookup, fromDate: '2026-11-02', days: 14 }).success
    ).toBe(true);
    for (const bad of [
      { fromDate: '2026-13-01' },
      { fromDate: '02/11/2026' },
      { days: 0 },
      { days: 15 },
      { days: 1.5 },
    ]) {
      expect(
        publicSlotsInputSchema.safeParse({ ...lookup, fromDate: '2026-11-02', days: 7, ...bad })
          .success
      ).toBe(false);
    }
  });

  it('lowercases the email, strips control characters from the name and keeps answers strict', () => {
    const parsed = publicBookInputSchema.parse({ ...book, name: ' Ada\r\nLovelace\u0007 ' });
    expect(parsed.email).toBe('ada@example.invalid');
    expect(parsed.name).toBe('AdaLovelace');
    // Unicode line terminators and C1 controls go too (codex).
    expect(publicBookInputSchema.parse({ ...book, name: 'Ada\u2028\u0085Lovelace' }).name).toBe(
      'AdaLovelace'
    );
    expect(
      publicBookInputSchema.safeParse({ ...book, answers: { phone: '1', website: 'x' } }).success
    ).toBe(false);
    expect(
      publicBookInputSchema.safeParse({ ...book, answers: { notes: 'x'.repeat(1001) } }).success
    ).toBe(false);
    expect(
      publicBookInputSchema.safeParse({ ...book, email: `${'a'.repeat(320)}@x.example.invalid` })
        .success
    ).toBe(false);
    expect(publicBookInputSchema.safeParse({ ...book, name: '\u0007\u0008' }).success).toBe(false);
  });

  it('requires consent to be literally true and an ISO start', () => {
    expect(publicBookInputSchema.safeParse({ ...book, consent: false }).success).toBe(false);
    expect(publicBookInputSchema.safeParse({ ...book, consent: 'yes' }).success).toBe(false);
    expect(publicBookInputSchema.safeParse({ ...book, start: 'tomorrow' }).success).toBe(false);
  });

  it('accepts any short honeypot value so the router can fake success for bots', () => {
    expect(publicBookInputSchema.safeParse({ ...book, __honeypot: 'filled-by-bot' }).success).toBe(
      true
    );
    expect(publicBookInputSchema.safeParse({ ...book, __honeypot: 'x'.repeat(201) }).success).toBe(
      false
    );
    const { __honeypot: _omit, ...withoutHoneypot } = book;
    expect(publicBookInputSchema.safeParse(withoutHoneypot).success).toBe(true);
  });
});
