/**
 * Opportunity Deal-Action Validators Tests (#421, IFC-280 deferred)
 *
 * Covers the schemas backing Clone / Archive / Add-Product / File-upload:
 * cloneOpportunitySchema, archiveOpportunitySchema, unarchiveOpportunitySchema,
 * addDealProductSchema, updateDealProductSchema, removeDealProductSchema,
 * attachDealFileSchema, listDealFilesSchema, removeDealFileSchema.
 */

import { describe, it, expect } from 'vitest';
import {
  cloneOpportunitySchema,
  archiveOpportunitySchema,
  unarchiveOpportunitySchema,
  addDealProductSchema,
  updateDealProductSchema,
  removeDealProductSchema,
  attachDealFileSchema,
  listDealFilesSchema,
  removeDealFileSchema,
} from '../opportunity';

const VALID_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('opportunity deal-action validators (#421)', () => {
  describe('cloneOpportunitySchema / archiveOpportunitySchema / unarchiveOpportunitySchema', () => {
    it('accepts a valid id', () => {
      expect(cloneOpportunitySchema.safeParse({ id: VALID_ID }).success).toBe(true);
      expect(archiveOpportunitySchema.safeParse({ id: VALID_ID }).success).toBe(true);
      expect(unarchiveOpportunitySchema.safeParse({ id: VALID_ID }).success).toBe(true);
    });

    it('rejects a malformed id', () => {
      expect(cloneOpportunitySchema.safeParse({ id: 'not-an-id' }).success).toBe(false);
    });

    it('rejects a missing id', () => {
      expect(archiveOpportunitySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('addDealProductSchema', () => {
    it('accepts a valid product', () => {
      const result = addDealProductSchema.safeParse({
        opportunityId: VALID_ID,
        name: 'Widget',
        description: 'A widget',
        quantity: 2,
        unitPrice: 19.99,
      });
      expect(result.success).toBe(true);
    });

    it('defaults quantity to 1 when omitted', () => {
      const result = addDealProductSchema.safeParse({
        opportunityId: VALID_ID,
        name: 'Widget',
        unitPrice: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(1);
      }
    });

    it('trims the name and description', () => {
      const result = addDealProductSchema.safeParse({
        opportunityId: VALID_ID,
        name: '  Widget  ',
        description: '  trimmed  ',
        quantity: 1,
        unitPrice: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Widget');
        expect(result.data.description).toBe('trimmed');
      }
    });

    it('rejects an empty name', () => {
      expect(
        addDealProductSchema.safeParse({
          opportunityId: VALID_ID,
          name: '',
          quantity: 1,
          unitPrice: 10,
        }).success
      ).toBe(false);
    });

    it('rejects a zero or negative quantity', () => {
      expect(
        addDealProductSchema.safeParse({
          opportunityId: VALID_ID,
          name: 'Widget',
          quantity: 0,
          unitPrice: 10,
        }).success
      ).toBe(false);
    });

    it('rejects a non-positive unitPrice', () => {
      expect(
        addDealProductSchema.safeParse({
          opportunityId: VALID_ID,
          name: 'Widget',
          quantity: 1,
          unitPrice: 0,
        }).success
      ).toBe(false);
    });
  });

  describe('updateDealProductSchema', () => {
    it('accepts a partial update (quantity only)', () => {
      const result = updateDealProductSchema.safeParse({ id: VALID_ID, quantity: 5 });
      expect(result.success).toBe(true);
    });

    it('accepts clearing description to null', () => {
      const result = updateDealProductSchema.safeParse({ id: VALID_ID, description: null });
      expect(result.success).toBe(true);
    });

    it('rejects a missing id', () => {
      expect(updateDealProductSchema.safeParse({ quantity: 5 }).success).toBe(false);
    });
  });

  describe('removeDealProductSchema', () => {
    it('accepts a valid id', () => {
      expect(removeDealProductSchema.safeParse({ id: VALID_ID }).success).toBe(true);
    });
  });

  describe('attachDealFileSchema', () => {
    const base = {
      opportunityId: VALID_ID,
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      content: 'aGVsbG8gd29ybGQ=',
    };

    it('accepts a valid attachment payload', () => {
      expect(attachDealFileSchema.safeParse(base).success).toBe(true);
    });

    it('rejects sizeBytes over the 50MB cap', () => {
      const result = attachDealFileSchema.safeParse({
        ...base,
        sizeBytes: 50 * 1024 * 1024 + 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects an empty content string', () => {
      expect(attachDealFileSchema.safeParse({ ...base, content: '' }).success).toBe(false);
    });

    it('rejects a non-positive sizeBytes', () => {
      expect(attachDealFileSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(false);
    });
  });

  describe('listDealFilesSchema / removeDealFileSchema', () => {
    it('accepts a valid opportunityId / id', () => {
      expect(listDealFilesSchema.safeParse({ opportunityId: VALID_ID }).success).toBe(true);
      expect(removeDealFileSchema.safeParse({ id: VALID_ID }).success).toBe(true);
    });
  });
});
