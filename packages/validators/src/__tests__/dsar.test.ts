/**
 * PG-203 DSAR validators (spec Addendum A, rounds 2-4).
 *
 * Public inputs are strict (no tenant, subject or request field from the body beyond the
 * documented ones). Free text is control-character stripped and bounded. Tokens are the
 * 43-character base64url form of 32 random bytes.
 */
import { describe, it, expect } from 'vitest';
import {
  dsarCompleteAccessSchema,
  dsarCompleteSchema,
  dsarCreateTransferSchema,
  dsarExtendSchema,
  dsarFirmLookupSchema,
  dsarLiftRestrictionSchema,
  dsarListSchema,
  dsarLogRequestSchema,
  dsarRejectSchema,
  dsarSubmitSchema,
  dsarTokenInputSchema,
  dsarTransferDownloadSchema,
  dsarTransferIdSchema,
  restrictionForSchema,
} from '../dsar';

const TOKEN = 'A'.repeat(42) + 'b'; // 43 base64url characters
const CUID = 'clh1234567890abcdefghijk';

describe('public schemas', () => {
  it('looks a firm up by its booking handle only', () => {
    expect(dsarFirmLookupSchema.parse({ handle: ' Smith-Law ' })).toEqual({ handle: 'smith-law' });
    expect(dsarFirmLookupSchema.safeParse({ handle: 'smith-law', tenantId: 't' }).success).toBe(
      false
    );
  });

  it('accepts a submit, normalising the email and stripping control characters from details', () => {
    const parsed = dsarSubmitSchema.parse({
      handle: 'smith-law',
      type: 'ACCESS',
      email: '  Ada@Example.INVALID ',
      details: `Please send${String.fromCodePoint(7)} everything`,
      consent: true,
    });
    expect(parsed.email).toBe('ada@example.invalid');
    expect(parsed.details).toBe('Please send everything');
  });

  it('requires consent, rejects unknown fields and bounds details', () => {
    const base = {
      handle: 'smith-law',
      type: 'ACCESS',
      email: 'ada@example.invalid',
      consent: true,
    };
    expect(dsarSubmitSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(dsarSubmitSchema.safeParse({ ...base, subjectId: 'x' }).success).toBe(false);
    expect(dsarSubmitSchema.safeParse({ ...base, details: 'x'.repeat(2001) }).success).toBe(false);
    expect(dsarSubmitSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });

  it('requires an objection scope for OBJECTION and refuses it for other types', () => {
    const base = { handle: 'smith-law', email: 'ada@example.invalid', consent: true };
    expect(dsarSubmitSchema.safeParse({ ...base, type: 'OBJECTION' }).success).toBe(false);
    expect(
      dsarSubmitSchema.safeParse({ ...base, type: 'OBJECTION', objectionScope: 'MARKETING' })
        .success
    ).toBe(true);
    expect(
      dsarSubmitSchema.safeParse({ ...base, type: 'ACCESS', objectionScope: 'MARKETING' }).success
    ).toBe(false);
  });

  it('accepts the honeypot field so the router can fake success for bots', () => {
    const parsed = dsarSubmitSchema.parse({
      handle: 'smith-law',
      type: 'ERASURE',
      email: 'ada@example.invalid',
      consent: true,
      __honeypot: 'http://spam.example.invalid',
    });
    expect(parsed.__honeypot).toBe('http://spam.example.invalid');
  });

  it('takes a request id and a 43-character base64url token, nothing else', () => {
    expect(dsarTokenInputSchema.parse({ requestId: CUID, token: TOKEN })).toEqual({
      requestId: CUID,
      token: TOKEN,
    });
    for (const token of ['short', TOKEN + 'x', 'A'.repeat(42) + '=', 'A'.repeat(42) + '/']) {
      expect(dsarTokenInputSchema.safeParse({ requestId: CUID, token }).success).toBe(false);
    }
    expect(dsarTokenInputSchema.safeParse({ requestId: CUID, token: TOKEN, x: 1 }).success).toBe(
      false
    );
  });
});

describe('admin schemas', () => {
  it('logs a staff request with a structured identity check and a received date', () => {
    const parsed = dsarLogRequestSchema.parse({
      type: 'ERASURE',
      email: 'Ada@Example.invalid',
      receivedOn: '2026-10-20',
      receivedOnReason: 'Letter received on Monday',
      identityMethod: 'SIGNED_LETTER',
      identityNote: 'Signed letter matched the address on file',
    });
    expect(parsed.email).toBe('ada@example.invalid');
    expect(
      dsarLogRequestSchema.safeParse({
        type: 'ERASURE',
        email: 'ada@example.invalid',
        receivedOn: '2026-10-20',
        identityMethod: 'SIGNED_LETTER',
        identityNote: 'too short',
      }).success
    ).toBe(false);
    expect(
      dsarLogRequestSchema.safeParse({
        type: 'ACCESS',
        email: 'ada@example.invalid',
        receivedOn: '2026-10-20',
        identityMethod: 'FINGERPRINT',
        identityNote: 'Signed letter matched the address on file',
      }).success
    ).toBe(false);
  });

  it('gives a scope only to staff-logged objections (dsar_requests_objectionScope_check)', () => {
    const base = {
      email: 'ada@example.invalid',
      receivedOn: '2026-10-20',
      identityMethod: 'SIGNED_LETTER',
      identityNote: 'Signed letter matched the address on file',
    };
    expect(
      dsarLogRequestSchema.safeParse({ ...base, type: 'ACCESS', objectionScope: 'MARKETING' })
        .success
    ).toBe(false);
    expect(
      dsarLogRequestSchema.safeParse({ ...base, type: 'OBJECTION', objectionScope: 'MARKETING' })
        .success
    ).toBe(true);
  });

  it('keeps the note and the withholding reasons within the stored 2000 characters', () => {
    const withheld = [{ category: 'NOTES', count: 2, reason: 'Legal professional privilege' }];
    expect(
      dsarCompleteAccessSchema.safeParse({ id: CUID, note: 'x'.repeat(2000), withheld: [] }).success
    ).toBe(true);
    expect(
      dsarCompleteAccessSchema.safeParse({ id: CUID, note: 'x'.repeat(2000), withheld }).success
    ).toBe(false);
    expect(
      dsarCompleteAccessSchema.safeParse({ id: CUID, note: 'x'.repeat(1900), withheld }).success
    ).toBe(true);
  });

  it('bounds the completion fields; the service decides which a type requires', () => {
    expect(
      dsarCompleteSchema.parse({ id: CUID, note: 'Done', noHoldConfirmed: true })
    ).toMatchObject({ noHoldConfirmed: true });
    expect(
      dsarCompleteSchema.safeParse({ id: CUID, note: 'Done', noHoldConfirmed: false }).success
    ).toBe(false);
    expect(
      dsarCompleteSchema.safeParse({
        id: CUID,
        note: 'Done',
        marketingStoppedConfirmed: true,
        marketingStopMethod: 'too short',
      }).success
    ).toBe(false);
    expect(
      dsarCompleteSchema.safeParse({
        id: CUID,
        note: 'Done',
        marketingStoppedConfirmed: true,
        marketingStopMethod: 'Removed from the newsletter list',
      }).success
    ).toBe(true);
  });

  it('records what an access reply withheld, by category', () => {
    expect(
      dsarCompleteAccessSchema.parse({
        id: CUID,
        note: 'Supplementary disclosure sent',
        withheld: [{ category: 'NOTES', count: 3, reason: 'Legal professional privilege' }],
      }).withheld
    ).toHaveLength(1);
    expect(
      dsarCompleteAccessSchema.safeParse({
        id: CUID,
        note: 'x',
        withheld: [{ category: 'PHOTOS', count: 1, reason: 'x' }],
      }).success
    ).toBe(false);
  });

  it('extends by one or two months with a reason, and rejects with a reason', () => {
    expect(
      dsarExtendSchema.safeParse({ id: CUID, months: 2, reason: 'Many records to review' }).success
    ).toBe(true);
    expect(
      dsarExtendSchema.safeParse({ id: CUID, months: 3, reason: 'Many records to review' }).success
    ).toBe(false);
    expect(dsarRejectSchema.safeParse({ id: CUID, reason: 'short' }).success).toBe(false);
    expect(
      dsarLiftRestrictionSchema.safeParse({ restrictionId: CUID, note: 'Accuracy confirmed' })
        .success
    ).toBe(true);
  });

  it('filters the list by status and asks restriction status by record, never by email', () => {
    expect(dsarListSchema.parse({})).toEqual({});
    expect(dsarListSchema.safeParse({ status: 'VERIFIED' }).success).toBe(true);
    expect(restrictionForSchema.parse({ entity: 'lead', id: CUID })).toEqual({
      entity: 'lead',
      id: CUID,
    });
    expect(restrictionForSchema.safeParse({ entity: 'lead', email: 'a@b.invalid' }).success).toBe(
      false
    );
  });
});

describe('IFC-317 transfer schemas (Art 20(2))', () => {
  const create = {
    id: CUID,
    recipientName: '  Jones & Co ',
    recipientEmail: ' Privacy@Jones.example.invalid ',
    basis: 'Asked by email on 3 November',
    confirmed: true as const,
  };

  it('normalises the recipient and trims the free text', () => {
    expect(dsarCreateTransferSchema.parse(create)).toEqual({
      ...create,
      recipientName: 'Jones & Co',
      recipientEmail: 'privacy@jones.example.invalid',
    });
  });

  it('requires the confirmation that the person asked, a valid address and a recorded basis', () => {
    expect(dsarCreateTransferSchema.safeParse({ ...create, confirmed: false }).success).toBe(false);
    const { confirmed: _omit, ...unconfirmed } = create;
    expect(dsarCreateTransferSchema.safeParse(unconfirmed).success).toBe(false);
    expect(dsarCreateTransferSchema.safeParse({ ...create, recipientEmail: 'nope' }).success).toBe(
      false
    );
    expect(dsarCreateTransferSchema.safeParse({ ...create, basis: 'short' }).success).toBe(false);
    expect(dsarCreateTransferSchema.safeParse({ ...create, recipientName: '  ' }).success).toBe(
      false
    );
    expect(dsarCreateTransferSchema.safeParse({ ...create, basis: 'x'.repeat(501) }).success).toBe(
      false
    );
    expect(
      dsarCreateTransferSchema.safeParse({ ...create, recipientName: 'x'.repeat(201) }).success
    ).toBe(false);
  });

  it('is strict: no tenant, expiry or token can be supplied', () => {
    for (const extra of [{ tenantId: 't' }, { expiresAt: 'x' }, { token: TOKEN }]) {
      expect(dsarCreateTransferSchema.safeParse({ ...create, ...extra }).success).toBe(false);
    }
    expect(dsarTransferIdSchema.safeParse({ id: CUID, tenantId: 't' }).success).toBe(false);
    expect(dsarTransferIdSchema.parse({ id: CUID })).toEqual({ id: CUID });
  });

  it('takes only a token on the public route, of any shape (a bad one is just not found)', () => {
    expect(dsarTransferDownloadSchema.parse({ token: TOKEN })).toEqual({ token: TOKEN });
    expect(dsarTransferDownloadSchema.safeParse({ token: 'short' }).success).toBe(true);
    expect(dsarTransferDownloadSchema.safeParse({ token: '' }).success).toBe(false);
    expect(dsarTransferDownloadSchema.safeParse({ token: 'x'.repeat(201) }).success).toBe(false);
    expect(dsarTransferDownloadSchema.safeParse({ token: TOKEN, tenantId: 't' }).success).toBe(
      false
    );
    expect(dsarTransferDownloadSchema.safeParse({}).success).toBe(false);
  });
});
