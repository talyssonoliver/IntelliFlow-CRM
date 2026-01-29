/**
 * Search Agent Tools Tests
 *
 * Tests for searchLeadsTool, searchContactsTool, searchOpportunitiesTool, and combinedSearchTool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchLeadsTool,
  searchContactsTool,
  searchOpportunitiesTool,
  combinedSearchTool,
  searchTools,
  CombinedSearchInputSchema,
} from '../search';
import type { AgentAuthContext } from '../../types';

// Mock the dependencies
vi.mock('../../logger', () => ({
  agentLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

const createMockContext = (overrides?: Partial<AgentAuthContext>): AgentAuthContext => ({
  userId: 'user-123',
  userEmail: 'user@example.com',
  role: 'SALES_REP',
  tenantId: 'tenant-123',
  agentSessionId: 'session-123',
  allowedActionTypes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'SEARCH'],
  allowedEntityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY', 'CASE', 'APPOINTMENT'],
  maxActionsPerSession: 100,
  actionCount: 0,
  ...overrides,
});

describe('Search Agent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchLeadsTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(searchLeadsTool.name).toBe('search_leads');
      });

      it('should have correct description', () => {
        expect(searchLeadsTool.description).toContain('Search for leads');
      });

      it('should have correct actionType', () => {
        expect(searchLeadsTool.actionType).toBe('SEARCH');
      });

      it('should have correct entityTypes', () => {
        expect(searchLeadsTool.entityTypes).toContain('LEAD');
      });

      it('should not require approval', () => {
        expect(searchLeadsTool.requiresApproval).toBe(false);
      });

      it('should have inputSchema', () => {
        expect(searchLeadsTool.inputSchema).toBeDefined();
      });
    });

    describe('execute', () => {
      it('should return success with empty results', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchLeadsTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(false);
        expect(result.data).toEqual([]);
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should reject if LEAD entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['CONTACT'], // No LEAD
        });
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchLeadsTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to search leads');
      });

      it('should handle errors gracefully', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        // Make logger.log throw to simulate error
        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Logger failed'));

        const result = await searchLeadsTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Logger failed');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for query search', async () => {
        const context = createMockContext();
        const input = { query: 'test lead', limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('Search leads');
        expect(preview.summary).toContain('query: "test lead"');
        expect(preview.changes).toEqual([]);
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should generate preview with status filter', async () => {
        const context = createMockContext();
        const input = { status: ['NEW', 'CONTACTED'], limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('status: NEW, CONTACTED');
      });

      it('should generate preview with source filter', async () => {
        const context = createMockContext();
        const input = { source: ['WEBSITE', 'REFERRAL'], limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('source: WEBSITE, REFERRAL');
      });

      it('should generate preview with score filters', async () => {
        const context = createMockContext();
        const input = { minScore: 50, maxScore: 100, limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('min score: 50');
        expect(preview.summary).toContain('max score: 100');
      });

      it('should generate preview with owner filter', async () => {
        const context = createMockContext();
        const input = { ownerId: 'owner-123', limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('owner: owner-123');
      });

      it('should generate preview with all leads when no criteria', async () => {
        const context = createMockContext();
        const input = { limit: 10, offset: 0 };

        const preview = await searchLeadsTool.generatePreview(input, context);

        expect(preview.summary).toContain('all leads');
      });
    });
  });

  describe('searchContactsTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(searchContactsTool.name).toBe('search_contacts');
      });

      it('should have correct description', () => {
        expect(searchContactsTool.description).toContain('Search for contacts');
      });

      it('should have correct actionType', () => {
        expect(searchContactsTool.actionType).toBe('SEARCH');
      });

      it('should have correct entityTypes', () => {
        expect(searchContactsTool.entityTypes).toContain('CONTACT');
      });

      it('should not require approval', () => {
        expect(searchContactsTool.requiresApproval).toBe(false);
      });
    });

    describe('execute', () => {
      it('should return success with empty results', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchContactsTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(false);
        expect(result.data).toEqual([]);
      });

      it('should reject if CONTACT entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD'], // No CONTACT
        });
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchContactsTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to search contacts');
      });

      it('should handle errors gracefully', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Contact search failed'));

        const result = await searchContactsTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Contact search failed');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for query search', async () => {
        const context = createMockContext();
        const input = { query: 'john', limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('Search contacts');
        expect(preview.summary).toContain('query: "john"');
      });

      it('should generate preview with account filter', async () => {
        const context = createMockContext();
        const input = { accountId: 'account-123', limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('account: account-123');
      });

      it('should generate preview with owner filter', async () => {
        const context = createMockContext();
        const input = { ownerId: 'owner-123', limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('owner: owner-123');
      });

      it('should generate preview with hasEmail filter', async () => {
        const context = createMockContext();
        const input = { hasEmail: true, limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('has email: true');
      });

      it('should generate preview with hasPhone filter', async () => {
        const context = createMockContext();
        const input = { hasPhone: false, limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('has phone: false');
      });

      it('should generate preview with all contacts when no criteria', async () => {
        const context = createMockContext();
        const input = { limit: 10, offset: 0 };

        const preview = await searchContactsTool.generatePreview(input, context);

        expect(preview.summary).toContain('all contacts');
      });
    });
  });

  describe('searchOpportunitiesTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(searchOpportunitiesTool.name).toBe('search_opportunities');
      });

      it('should have correct description', () => {
        expect(searchOpportunitiesTool.description).toContain('Search for opportunities');
      });

      it('should have correct actionType', () => {
        expect(searchOpportunitiesTool.actionType).toBe('SEARCH');
      });

      it('should have correct entityTypes', () => {
        expect(searchOpportunitiesTool.entityTypes).toContain('OPPORTUNITY');
      });

      it('should not require approval', () => {
        expect(searchOpportunitiesTool.requiresApproval).toBe(false);
      });
    });

    describe('execute', () => {
      it('should return success with empty results', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchOpportunitiesTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(false);
        expect(result.data).toEqual([]);
      });

      it('should reject if OPPORTUNITY entity type not allowed', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD'], // No OPPORTUNITY
        });
        const input = { query: 'test', limit: 10, offset: 0 };

        const result = await searchOpportunitiesTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not authorized to search opportunities');
      });

      it('should handle errors gracefully', async () => {
        const context = createMockContext();
        const input = { query: 'test', limit: 10, offset: 0 };

        const { agentLogger } = await import('../../logger');
        vi.mocked(agentLogger.log).mockRejectedValueOnce(new Error('Opportunity search failed'));

        const result = await searchOpportunitiesTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Opportunity search failed');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for query search', async () => {
        const context = createMockContext();
        const input = { query: 'big deal', limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('Search opportunities');
        expect(preview.summary).toContain('query: "big deal"');
      });

      it('should generate preview with stage filter', async () => {
        const context = createMockContext();
        const input = { stage: ['NEGOTIATION', 'CLOSED_WON'], limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('stage: NEGOTIATION, CLOSED_WON');
      });

      it('should generate preview with value filters', async () => {
        const context = createMockContext();
        const input = { minValue: 10000, maxValue: 100000, limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('min value: 10000');
        expect(preview.summary).toContain('max value: 100000');
      });

      it('should generate preview with account filter', async () => {
        const context = createMockContext();
        const input = { accountId: 'account-123', limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('account: account-123');
      });

      it('should generate preview with owner filter', async () => {
        const context = createMockContext();
        const input = { ownerId: 'owner-123', limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('owner: owner-123');
      });

      it('should generate preview with close date filters', async () => {
        const context = createMockContext();
        const fromDate = new Date('2024-01-01');
        const toDate = new Date('2024-12-31');
        const input = { closeDateFrom: fromDate, closeDateTo: toDate, limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('close date from:');
        expect(preview.summary).toContain('close date to:');
      });

      it('should generate preview with all opportunities when no criteria', async () => {
        const context = createMockContext();
        const input = { limit: 10, offset: 0 };

        const preview = await searchOpportunitiesTool.generatePreview(input, context);

        expect(preview.summary).toContain('all opportunities');
      });
    });
  });

  describe('combinedSearchTool', () => {
    describe('metadata', () => {
      it('should have correct name', () => {
        expect(combinedSearchTool.name).toBe('search_crm');
      });

      it('should have correct description', () => {
        expect(combinedSearchTool.description).toContain('Search across multiple CRM entities');
      });

      it('should have correct actionType', () => {
        expect(combinedSearchTool.actionType).toBe('SEARCH');
      });

      it('should have multiple entityTypes', () => {
        expect(combinedSearchTool.entityTypes).toContain('LEAD');
        expect(combinedSearchTool.entityTypes).toContain('CONTACT');
        expect(combinedSearchTool.entityTypes).toContain('OPPORTUNITY');
      });

      it('should not require approval', () => {
        expect(combinedSearchTool.requiresApproval).toBe(false);
      });
    });

    describe('execute', () => {
      it('should search across multiple entity types', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY'] as const, query: 'test', limit: 20 };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.requiresApproval).toBe(false);
        expect(result.data).toBeDefined();
        expect(result.data?.leads).toEqual([]);
        expect(result.data?.contacts).toEqual([]);
        expect(result.data?.opportunities).toEqual([]);
      });

      it('should only search allowed entity types', async () => {
        const context = createMockContext({
          allowedEntityTypes: ['LEAD'], // Only LEAD allowed
        });
        const input = { entityTypes: ['LEAD', 'CONTACT'] as const, query: 'test', limit: 20 };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.data?.leads).toEqual([]);
        expect(result.data?.contacts).toBeUndefined(); // Not searched because not allowed
      });

      it('should search only LEAD when requested', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['LEAD'] as const, query: 'test', limit: 20 };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.data?.leads).toEqual([]);
        expect(result.data?.contacts).toBeUndefined();
        expect(result.data?.opportunities).toBeUndefined();
      });

      it('should search only CONTACT when requested', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['CONTACT'] as const, query: 'test', limit: 20 };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.data?.contacts).toEqual([]);
        expect(result.data?.leads).toBeUndefined();
      });

      it('should search only OPPORTUNITY when requested', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['OPPORTUNITY'] as const, query: 'test', limit: 20 };

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(true);
        expect(result.data?.opportunities).toEqual([]);
        expect(result.data?.leads).toBeUndefined();
      });

      it('should handle errors gracefully', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['LEAD'] as const, query: 'test', limit: 20 };

        const { agentLogger } = await import('../../logger');
        // First call for searchLeadsTool will succeed, second for combined will fail
        vi.mocked(agentLogger.log)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Combined search failed'));

        const result = await combinedSearchTool.execute(input, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Combined search failed');
      });
    });

    describe('generatePreview', () => {
      it('should generate preview for combined search', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['LEAD', 'CONTACT'] as const, query: 'test query', limit: 20 };

        const preview = await combinedSearchTool.generatePreview(input, context);

        expect(preview.summary).toContain('Search');
        expect(preview.summary).toContain('LEAD');
        expect(preview.summary).toContain('CONTACT');
        expect(preview.summary).toContain('test query');
        expect(preview.changes).toEqual([]);
        expect(preview.estimatedImpact).toBe('LOW');
      });

      it('should generate preview for all entity types', async () => {
        const context = createMockContext();
        const input = { entityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY'] as const, query: 'search all', limit: 20 };

        const preview = await combinedSearchTool.generatePreview(input, context);

        expect(preview.summary).toContain('LEAD');
        expect(preview.summary).toContain('CONTACT');
        expect(preview.summary).toContain('OPPORTUNITY');
      });
    });
  });

  describe('CombinedSearchInputSchema', () => {
    it('should validate valid input', () => {
      const input = { entityTypes: ['LEAD'], query: 'test', limit: 20 };
      const result = CombinedSearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require at least one entity type', () => {
      const input = { entityTypes: [], query: 'test', limit: 20 };
      const result = CombinedSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should require query to be non-empty', () => {
      const input = { entityTypes: ['LEAD'], query: '', limit: 20 };
      const result = CombinedSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should enforce max query length', () => {
      const input = { entityTypes: ['LEAD'], query: 'a'.repeat(501), limit: 20 };
      const result = CombinedSearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should enforce limit range', () => {
      const inputLow = { entityTypes: ['LEAD'], query: 'test', limit: 0 };
      const inputHigh = { entityTypes: ['LEAD'], query: 'test', limit: 101 };
      expect(CombinedSearchInputSchema.safeParse(inputLow).success).toBe(false);
      expect(CombinedSearchInputSchema.safeParse(inputHigh).success).toBe(false);
    });

    it('should use default limit', () => {
      const input = { entityTypes: ['LEAD'], query: 'test' };
      const result = CombinedSearchInputSchema.parse(input);
      expect(result.limit).toBe(20);
    });
  });

  describe('searchTools export', () => {
    it('should export all search tools', () => {
      expect(searchTools.searchLeadsTool).toBe(searchLeadsTool);
      expect(searchTools.searchContactsTool).toBe(searchContactsTool);
      expect(searchTools.searchOpportunitiesTool).toBe(searchOpportunitiesTool);
      expect(searchTools.combinedSearchTool).toBe(combinedSearchTool);
    });
  });
});
