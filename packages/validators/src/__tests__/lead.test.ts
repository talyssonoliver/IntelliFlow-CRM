/**
 * Lead create/update/response validators — BANT + annualRevenue (IFC-242).
 *
 * Covers the first-class BANT fields (budget/authority/need/timeline) and the
 * annualRevenue band, asserting they are accepted on create/update, enum-validated,
 * surfaced on the response, and kept distinct from estimatedValue.
 */

import { describe, it, expect } from 'vitest';
import { createLeadSchema, updateLeadSchema, leadResponseSchema } from '../lead';

describe('Lead BANT validators (IFC-242)', () => {
  describe('createLeadSchema', () => {
    it('accepts BANT + annualRevenue as structured fields', () => {
      const result = createLeadSchema.safeParse({
        email: 'bant@example.com',
        budget: '$50k-$100k',
        authority: 'Decision maker',
        need: 'CRM solution',
        timeline: 'immediate',
        annualRevenue: '1M-10M',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.budget).toBe('$50k-$100k');
        expect(result.data.authority).toBe('Decision maker');
        expect(result.data.need).toBe('CRM solution');
        expect(result.data.timeline).toBe('immediate');
        expect(result.data.annualRevenue).toBe('1M-10M');
      }
    });

    it('rejects an invalid timeline enum value', () => {
      const result = createLeadSchema.safeParse({
        email: 'bad@example.com',
        timeline: 'someday',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid annualRevenue band', () => {
      const result = createLeadSchema.safeParse({
        email: 'bad@example.com',
        annualRevenue: '5 trillion',
      });
      expect(result.success).toBe(false);
    });

    it('keeps annualRevenue distinct from estimatedValue', () => {
      const result = createLeadSchema.safeParse({
        email: 'distinct@example.com',
        annualRevenue: '10M-50M',
        estimatedValue: 250000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.annualRevenue).toBe('10M-50M');
        expect(result.data.estimatedValue).toBe(250000);
      }
    });

    it('treats BANT fields as optional', () => {
      const result = createLeadSchema.safeParse({ email: 'min@example.com' });
      expect(result.success).toBe(true);
    });
  });

  // Lead-form field contract — relocated from tests/e2e/forms.spec.ts.
  // These were asserted through a browser ("email field marked as required",
  // "validation error for invalid email", "source dropdown with all options");
  // they are pure schema rules and belong at the unit layer.
  describe('createLeadSchema — form-field contract', () => {
    it('requires email (the only mandatory field)', () => {
      const result = createLeadSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });

    it('rejects a malformed email', () => {
      const result = createLeadSchema.safeParse({ email: 'not-an-email' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });

    it('accepts a valid email and lowercases it', () => {
      const result = createLeadSchema.safeParse({ email: 'Lead@Example.COM' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('lead@example.com');
      }
    });

    it('defaults source to WEBSITE when omitted', () => {
      const result = createLeadSchema.safeParse({ email: 'x@y.com' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('WEBSITE');
      }
    });

    it('accepts every documented lead source and rejects unknown ones', () => {
      for (const source of [
        'WEBSITE',
        'REFERRAL',
        'SOCIAL',
        'EMAIL',
        'COLD_CALL',
        'EVENT',
        'OTHER',
      ]) {
        expect(createLeadSchema.safeParse({ email: 's@y.com', source }).success).toBe(true);
      }
      expect(
        createLeadSchema.safeParse({ email: 's@y.com', source: 'CARRIER_PIGEON' }).success
      ).toBe(false);
    });
  });

  describe('updateLeadSchema', () => {
    it('accepts a partial BANT update', () => {
      const result = updateLeadSchema.safeParse({
        id: 'clx0000000000000000000000',
        budget: 'updated',
        timeline: 'short',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.budget).toBe('updated');
        expect(result.data.timeline).toBe('short');
      }
    });
  });

  describe('leadResponseSchema', () => {
    it('surfaces BANT fields (round-trip) and tolerates nulls', () => {
      const result = leadResponseSchema.safeParse({
        id: 'clx0000000000000000000000',
        email: 'resp@example.com',
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        scoreConfidence: null,
        scoreTier: null,
        ownerId: 'clx0000000000000000000001',
        tenantId: 'clx0000000000000000000002',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        budget: 'Q3 budget approved',
        authority: null,
        need: 'pipeline visibility',
        timeline: 'immediate',
        annualRevenue: '50M-100M',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.budget).toBe('Q3 budget approved');
        expect(result.data.authority).toBeNull();
        expect(result.data.need).toBe('pipeline visibility');
        expect(result.data.annualRevenue).toBe('50M-100M');
      }
    });
  });
});

describe('Lead attribution validators (ADR-070)', () => {
  const attribution = {
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'spring',
    utmContent: 'a',
    utmTerm: 'crm',
    clickId: 'gclid123',
    referrer: 'https://www.google.com/',
    landingPath: '/pricing',
  };

  it('accepts every attribution field on create and keeps them', () => {
    const result = createLeadSchema.safeParse({ email: 'a@b.co', ...attribution });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject(attribution);
  });

  it('keeps them optional on create and update', () => {
    expect(createLeadSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(updateLeadSchema.safeParse({ id: '3f2b8c1e-5a7d-4e29-9b64-0c1d2e3f4a5b' }).success).toBe(
      true
    );
    const upd = updateLeadSchema.safeParse({
      id: '3f2b8c1e-5a7d-4e29-9b64-0c1d2e3f4a5b',
      utmCampaign: 'autumn',
    });
    expect(upd.success).toBe(true);
    if (upd.success) expect(upd.data.utmCampaign).toBe('autumn');
  });

  it('rejects over-long attribution values', () => {
    expect(
      createLeadSchema.safeParse({ email: 'a@b.co', utmSource: 'x'.repeat(201) }).success
    ).toBe(false);
    expect(createLeadSchema.safeParse({ email: 'a@b.co', clickId: 'x'.repeat(501) }).success).toBe(
      false
    );
    expect(
      createLeadSchema.safeParse({ email: 'a@b.co', referrer: 'x'.repeat(2001) }).success
    ).toBe(false);
  });
});
