/**
 * updateLeadSchema — clearable fields (IFC-412).
 *
 * Owner ruling 2026-10-12: ALL fields in the lead edit form must be clearable,
 * including the "required-looking" ones named on the ticket — company, phone,
 * first/last name, estimatedValue, location, website. `updateLeadSchema` must
 * accept an explicit `null` for exactly these fields (a present key clears the
 * field) while still treating an omitted key as "leave unchanged" — the two
 * signals must stay distinct. Every other optional field on the schema (title,
 * budget, authority, need, timeline, annualRevenue, tags) is out of #412's
 * scope and keeps its pre-existing plain-optional behaviour (no `.nullable()`).
 */

import { describe, it, expect } from 'vitest';
import { updateLeadSchema } from '../lead';

const baseId = { id: 'c1234567890abcdefghij' };

describe('updateLeadSchema · clearable fields (IFC-412)', () => {
  describe.each([
    ['firstName', 'Jane'],
    ['lastName', 'Doe'],
    ['company', 'Acme Corp'],
    ['location', 'NYC'],
    ['website', 'https://acme.example.com'],
  ] as const)('%s', (field, sampleValue) => {
    it(`accepts an explicit null (clears ${field})`, () => {
      const result = updateLeadSchema.safeParse({ ...baseId, [field]: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[field]).toBeNull();
      }
    });

    it(`accepts a real value for ${field}`, () => {
      const result = updateLeadSchema.safeParse({ ...baseId, [field]: sampleValue });
      expect(result.success).toBe(true);
    });

    it(`leaves ${field} absent (undefined) when the key is omitted`, () => {
      const result = updateLeadSchema.safeParse({ ...baseId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[field]).toBeUndefined();
      }
    });
  });

  describe('phone', () => {
    it('accepts an explicit null (clears the phone)', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, phone: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBeNull();
      }
    });

    it('accepts a valid phone string and transforms it to a PhoneNumber value object', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, phone: '+15551234567' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBeDefined();
        expect(result.data.phone).not.toBeNull();
      }
    });

    it('leaves phone absent (undefined) when the key is omitted', () => {
      const result = updateLeadSchema.safeParse({ ...baseId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBeUndefined();
      }
    });

    it('rejects an invalid phone string (still validated, null bypasses validation)', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, phone: 'not-a-phone-number' });
      expect(result.success).toBe(false);
    });
  });

  describe('estimatedValue', () => {
    it('accepts an explicit null (clears the estimate)', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, estimatedValue: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimatedValue).toBeNull();
      }
    });

    it('accepts a real value', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, estimatedValue: 25000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimatedValue).toBe(25000);
      }
    });

    it('leaves estimatedValue absent (undefined) when the key is omitted', () => {
      const result = updateLeadSchema.safeParse({ ...baseId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimatedValue).toBeUndefined();
      }
    });

    it('still rejects a negative estimatedValue (null is the only accepted "empty" value)', () => {
      const result = updateLeadSchema.safeParse({ ...baseId, estimatedValue: -5 });
      expect(result.success).toBe(false);
    });
  });

  it('clears several fields in one patch while an untouched field stays absent', () => {
    const result = updateLeadSchema.safeParse({
      ...baseId,
      company: null,
      phone: null,
      estimatedValue: null,
      // location/website/firstName/lastName omitted -> must stay undefined
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.estimatedValue).toBeNull();
      expect(result.data.location).toBeUndefined();
      expect(result.data.website).toBeUndefined();
      expect(result.data.firstName).toBeUndefined();
      expect(result.data.lastName).toBeUndefined();
    }
  });

  describe('fields NOT in #412 scope stay plain-optional (no null)', () => {
    it.each(['title', 'budget', 'authority', 'need'] as const)(
      'rejects an explicit null for %s',
      (field) => {
        const result = updateLeadSchema.safeParse({ ...baseId, [field]: null });
        expect(result.success).toBe(false);
      }
    );
  });
});
