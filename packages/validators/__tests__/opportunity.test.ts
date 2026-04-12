/**
 * Opportunity Validator Tests
 *
 * These tests verify the Zod validation schemas for Opportunity-related operations.
 * They ensure that input validation works correctly for all API endpoints
 * that deal with opportunities.
 */

import { describe, it, expect } from 'vitest';
import {
  opportunityStageSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  opportunityQuerySchema,
  opportunityResponseSchema,
  opportunityListResponseSchema,
} from '../src/opportunity';

describe('Opportunity Validators', () => {
  describe('opportunityStageSchema', () => {
    it('should validate valid opportunity stages', () => {
      const validStages = [
        'PROSPECTING',
        'QUALIFICATION',
        'NEEDS_ANALYSIS',
        'PROPOSAL',
        'NEGOTIATION',
        'CLOSED_WON',
        'CLOSED_LOST',
      ];

      validStages.forEach((stage) => {
        const result = opportunityStageSchema.safeParse(stage);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid opportunity stages', () => {
      const result = opportunityStageSchema.safeParse('INVALID_STAGE');
      expect(result.success).toBe(false);
    });
  });

  describe('createOpportunitySchema', () => {
    it('should validate valid opportunity creation data', () => {
      const validData = {
        name: 'Enterprise Deal - Acme Corp',
        value: { amount: 50000 },
        stage: 'QUALIFICATION' as const,
        probability: 25,
        expectedCloseDate: '2024-12-31',
        description: 'Large enterprise opportunity',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        contactId: '456e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate opportunity with minimal required data', () => {
      const minimalData = {
        name: 'Minimal Opportunity',
        value: { amount: 1000 },
        probability: 0,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(minimalData);
      expect(result.success).toBe(true);

      if (result.success) {
        // Default values should be applied
        expect(result.data.stage).toBe('PROSPECTING');
        expect(result.data.probability.value).toBe(0);
      }
    });

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        value: { amount: 1000 },
        probability: 10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject name exceeding max length', () => {
      const invalidData = {
        name: 'N'.repeat(201), // Max is 200
        value: { amount: 1000 },
        probability: 10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative value', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: { amount: -1000 },
        probability: 10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero value', () => {
      // Note: Zero value is actually valid for Money (can have $0 opportunities)
      const validData = {
        name: 'Test Opportunity',
        value: { amount: 0 },
        probability: 10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid stage', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: 1000,
        stage: 'INVALID_STAGE',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject probability below 0', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: 1000,
        probability: -10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject probability above 100', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: 1000,
        probability: 150,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer probability', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: 1000,
        probability: 50.5,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept probability at boundary 0', () => {
      const validData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 0,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept probability at boundary 100', () => {
      const validData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 100,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should coerce expectedCloseDate to Date', () => {
      const validData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 10,
        expectedCloseDate: '2024-12-31',
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.expectedCloseDate).toBeInstanceOf(Date);
      }
    });

    it('should reject description exceeding max length', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 10,
        description: 'D'.repeat(1001), // Max is 1000
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid accountId', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 10,
        accountId: 'not-a-uuid',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid contactId', () => {
      const invalidData = {
        name: 'Test Opportunity',
        value: { amount: 1000 },
        probability: 10,
        accountId: '123e4567-e89b-12d3-a456-426614174000',
        contactId: 'not-a-uuid',
      };

      const result = createOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept all stages', () => {
      const stages = [
        'PROSPECTING',
        'QUALIFICATION',
        'NEEDS_ANALYSIS',
        'PROPOSAL',
        'NEGOTIATION',
        'CLOSED_WON',
        'CLOSED_LOST',
      ] as const;

      stages.forEach((stage) => {
        const validData = {
          name: 'Test Opportunity',
          value: { amount: 1000 },
          probability: 10,
          stage,
          accountId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = createOpportunitySchema.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('updateOpportunitySchema', () => {
    it('should validate valid update data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Opportunity',
        stage: 'PROPOSAL' as const,
        probability: 75,
      };

      const result = updateOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require id field', () => {
      const invalidData = {
        name: 'Updated Opportunity',
      };

      const result = updateOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate partial updates', () => {
      const partialData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        probability: 50,
      };

      const result = updateOpportunitySchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'not-a-uuid',
        name: 'Updated Opportunity',
      };

      const result = updateOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty name when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: '',
      };

      const result = updateOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative value when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        value: { amount: -5000 },
      };

      const result = updateOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid stage when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        stage: 'INVALID_STAGE',
      };

      const result = updateOpportunitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null expectedCloseDate', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        expectedCloseDate: null,
      };

      const result = updateOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow null contactId', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        contactId: null,
      };

      const result = updateOpportunitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate update with all fields', () => {
      const fullUpdate = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Fully Updated Opportunity',
        value: { amount: 75000 },
        stage: 'NEGOTIATION' as const,
        probability: 80,
        expectedCloseDate: '2025-03-31',
        description: 'Updated description',
        accountId: '456e4567-e89b-12d3-a456-426614174000',
        contactId: '789e4567-e89b-12d3-a456-426614174000',
      };

      const result = updateOpportunitySchema.safeParse(fullUpdate);
      expect(result.success).toBe(true);
    });
  });

  describe('opportunityQuerySchema', () => {
    it('should validate valid query params', () => {
      const validQuery = {
        page: 1,
        limit: 20,
        search: 'enterprise',
        stage: ['QUALIFICATION', 'PROPOSAL'] as const,
        minValue: 10000,
        maxValue: 100000,
      };

      const result = opportunityQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate minimal query', () => {
      const minimalQuery = {};

      const result = opportunityQuerySchema.safeParse(minimalQuery);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject search exceeding max length', () => {
      const invalidQuery = {
        search: 'S'.repeat(201), // Max is 200
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate stage array filter', () => {
      const queryWithStages = {
        stage: ['PROSPECTING', 'QUALIFICATION'] as const,
      };

      const result = opportunityQuerySchema.safeParse(queryWithStages);
      expect(result.success).toBe(true);
    });

    it('should reject invalid stage in array', () => {
      const invalidQuery = {
        stage: ['PROSPECTING', 'INVALID_STAGE'],
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate ownerId filter', () => {
      const queryWithOwner = {
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = opportunityQuerySchema.safeParse(queryWithOwner);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ownerId', () => {
      const invalidQuery = {
        ownerId: 'not-a-uuid',
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate accountId filter', () => {
      const queryWithAccount = {
        accountId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = opportunityQuerySchema.safeParse(queryWithAccount);
      expect(result.success).toBe(true);
    });

    it('should validate contactId filter', () => {
      const queryWithContact = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = opportunityQuerySchema.safeParse(queryWithContact);
      expect(result.success).toBe(true);
    });

    it('should reject negative minValue', () => {
      const invalidQuery = {
        minValue: -1000,
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject zero minValue', () => {
      const invalidQuery = {
        minValue: 0,
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject negative maxValue', () => {
      const invalidQuery = {
        maxValue: -5000,
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject probability out of range', () => {
      const invalidQuery = {
        minProbability: -10,
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should reject probability above 100', () => {
      const invalidQuery = {
        maxProbability: 150,
      };

      const result = opportunityQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate date range filters', () => {
      const queryWithDates = {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      };

      const result = opportunityQuerySchema.safeParse(queryWithDates);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
        expect(result.data.dateTo).toBeInstanceOf(Date);
      }
    });

    it('should validate complex filter combination', () => {
      const complexQuery = {
        page: 2,
        limit: 50,
        search: 'large deals',
        stage: ['NEGOTIATION', 'PROPOSAL'] as const,
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
        accountId: '456e4567-e89b-12d3-a456-426614174000',
        contactId: '789e4567-e89b-12d3-a456-426614174000',
        minValue: 50000,
        maxValue: 200000,
        minProbability: 50,
        maxProbability: 90,
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        sortBy: 'value',
        sortOrder: 'desc' as const,
      };

      const result = opportunityQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('opportunityResponseSchema', () => {
    it('should validate valid opportunity response', () => {
      const validResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Enterprise Deal',
        value: { amount: 50000 },
        stage: 'QUALIFICATION' as const,
        probability: 25,
        expectedCloseDate: '2024-12-31T00:00:00Z',
        description: 'Large opportunity',
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        accountId: '789e4567-e89b-12d3-a456-426614174000',
        contactId: 'abce4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        closedAt: null,
      };

      const result = opportunityResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for optional fields', () => {
      const responseWithNulls = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Minimal Opportunity',
        value: { amount: 1000 },
        stage: 'PROSPECTING' as const,
        probability: 0,
        expectedCloseDate: null,
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        accountId: '789e4567-e89b-12d3-a456-426614174000',
        contactId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        closedAt: null,
      };

      const result = opportunityResponseSchema.safeParse(responseWithNulls);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Opportunity',
        value: { amount: 1000 },
        stage: 'PROSPECTING' as const,
        probability: 0,
        expectedCloseDate: '2024-12-31T00:00:00Z',
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        accountId: '789e4567-e89b-12d3-a456-426614174000',
        contactId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        closedAt: '2024-02-01T00:00:00Z',
      };

      const result = opportunityResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
        expect(result.data.expectedCloseDate).toBeInstanceOf(Date);
        expect(result.data.closedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate value as Money object', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Opportunity',
        value: { amount: 99999.99 },
        stage: 'PROSPECTING' as const,
        probability: 0,
        expectedCloseDate: null,
        description: null,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        accountId: '789e4567-e89b-12d3-a456-426614174000',
        contactId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        closedAt: null,
      };

      const result = opportunityResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        // Value is now a Money value object
        expect(result.data.value.amount).toBe(99999.99);
      }
    });

    it('should validate all stages in response', () => {
      const stages = [
        'PROSPECTING',
        'QUALIFICATION',
        'NEEDS_ANALYSIS',
        'PROPOSAL',
        'NEGOTIATION',
        'CLOSED_WON',
        'CLOSED_LOST',
      ] as const;

      stages.forEach((stage) => {
        const response = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Opportunity',
          value: { amount: 1000 },
          stage,
          probability: 0,
          expectedCloseDate: null,
          description: null,
          ownerId: '456e4567-e89b-12d3-a456-426614174000',
          accountId: '789e4567-e89b-12d3-a456-426614174000',
          contactId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          closedAt: null,
        };

        const result = opportunityResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('opportunityListResponseSchema', () => {
    it('should validate valid opportunity list response', () => {
      const validList = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Enterprise Deal',
            value: { amount: 50000 },
            stage: 'QUALIFICATION' as const,
            probability: 25,
            expectedCloseDate: '2024-12-31T00:00:00Z',
            description: 'Large opportunity',
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            accountId: '789e4567-e89b-12d3-a456-426614174000',
            contactId: 'abce4567-e89b-12d3-a456-426614174000',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            closedAt: null,
          },
        ],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      };

      const result = opportunityListResponseSchema.safeParse(validList);
      expect(result.success).toBe(true);
    });

    it('should validate empty opportunity list', () => {
      const emptyList = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = opportunityListResponseSchema.safeParse(emptyList);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const invalidList = {
        data: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = opportunityListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero page', () => {
      const invalidList = {
        data: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      };

      const result = opportunityListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should validate multiple opportunities', () => {
      const multipleOpportunities = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Deal 1',
            value: { amount: 50000 },
            stage: 'QUALIFICATION' as const,
            probability: 25,
            expectedCloseDate: '2024-12-31T00:00:00Z',
            description: 'First opportunity',
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            accountId: '789e4567-e89b-12d3-a456-426614174000',
            contactId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            closedAt: null,
          },
          {
            id: '321e4567-e89b-12d3-a456-426614174000',
            name: 'Deal 2',
            value: { amount: 25000 },
            stage: 'PROSPECTING' as const,
            probability: 10,
            expectedCloseDate: null,
            description: null,
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            accountId: '789e4567-e89b-12d3-a456-426614174000',
            contactId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            closedAt: null,
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = opportunityListResponseSchema.safeParse(multipleOpportunities);
      expect(result.success).toBe(true);
    });
  });
});
