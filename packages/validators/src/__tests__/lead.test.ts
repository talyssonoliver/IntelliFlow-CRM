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
