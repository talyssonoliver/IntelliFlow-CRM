/**
 * Retrieval Service Unit Tests (IFC-155)
 *
 * Tests for ACLService, RelevanceEvaluator, and RetrievalService classes.
 * Covers:
 * - ACL context building and permission checks
 * - Relevance score computation and ranking
 * - Full search pipeline with mocked Prisma
 * - Edge cases: empty inputs, missing data, audit logging failures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACLService,
  RelevanceEvaluator,
  RetrievalService,
  SearchConfigSchema,
  createRetrievalService,
  DEFAULT_RELEVANCE_CONFIG,
  type SearchConfig,
  type SearchResult,
  type ACLContext,
  type RelevanceConfig,
} from '../retrieval-service';

// =============================================
// Mock external dependencies
// =============================================

vi.mock('@intelliflow/db', () => ({
  PrismaClient: vi.fn(),
  LeadStatus: { NEW: 'NEW', CONTACTED: 'CONTACTED' },
  OpportunityStage: { DISCOVERY: 'DISCOVERY', PROPOSAL: 'PROPOSAL' },
  TicketStatus: { OPEN: 'OPEN', CLOSED: 'CLOSED' },
}));

vi.mock('../../chains/embedding.chain', () => {
  class MockEmbeddingChain {
    generateEmbedding = vi.fn().mockResolvedValue({
      vector: Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.01)),
      dimensions: 1536,
      model: 'text-embedding-3-small',
      text: 'test',
    });
  }
  return { EmbeddingChain: MockEmbeddingChain };
});

// =============================================
// Helpers
// =============================================

function createMockPrisma() {
  return {
    userRoleAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userPermission: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    lead: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    account: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    opportunity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    caseDocument: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    conversationRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    messageRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ticket: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as any;
}

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'res-1',
    source: 'leads',
    title: 'Test Lead',
    content: 'test@example.com - Acme Corp',
    snippet: 'test@example.com - Acme Corp',
    relevanceScore: 0.8,
    metadata: {},
    acl: { viewableBy: ['user-1'], editableBy: ['user-1'] },
    createdAt: yesterday,
    updatedAt: yesterday,
    ...overrides,
  };
}

// =============================================
// SearchConfigSchema Tests
// =============================================

describe('SearchConfigSchema', () => {
  it('should parse a valid full config', () => {
    const config = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      query: 'hello world',
      sources: ['leads', 'contacts'],
      searchType: 'hybrid' as const,
      limit: 10,
      offset: 5,
      includeMetadata: true,
      minRelevanceScore: 0.5,
      semanticThreshold: 0.8,
    };
    const result = SearchConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should apply defaults for optional fields', () => {
    const config = { tenantId: 't', userId: 'u', query: 'test' };
    const parsed = SearchConfigSchema.parse(config);
    expect(parsed.searchType).toBe('hybrid');
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.includeMetadata).toBe(true);
    expect(parsed.minRelevanceScore).toBe(0.3);
    expect(parsed.semanticThreshold).toBe(0.7);
    expect(parsed.userRoles).toEqual([]);
  });

  it('should reject empty query', () => {
    const result = SearchConfigSchema.safeParse({ tenantId: 't', userId: 'u', query: '' });
    expect(result.success).toBe(false);
  });

  it('should reject query exceeding max length', () => {
    const result = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('should reject limit out of range', () => {
    expect(
      SearchConfigSchema.safeParse({ tenantId: 't', userId: 'u', query: 'a', limit: 0 }).success
    ).toBe(false);
    expect(
      SearchConfigSchema.safeParse({ tenantId: 't', userId: 'u', query: 'a', limit: 101 }).success
    ).toBe(false);
  });

  it('should reject invalid source names', () => {
    const result = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'test',
      sources: ['invalid_source'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid source names', () => {
    const allSources = [
      'leads', 'contacts', 'accounts', 'opportunities',
      'documents', 'notes', 'conversations', 'messages', 'tickets',
    ];
    const result = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'test',
      sources: allSources,
    });
    expect(result.success).toBe(true);
  });

  it('should accept all searchType values', () => {
    for (const st of ['fulltext', 'semantic', 'hybrid']) {
      const result = SearchConfigSchema.safeParse({
        tenantId: 't',
        userId: 'u',
        query: 'q',
        searchType: st,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should validate caseId as UUID when provided', () => {
    const validResult = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'q',
      caseId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(validResult.success).toBe(true);

    const invalidResult = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'q',
      caseId: 'not-a-uuid',
    });
    expect(invalidResult.success).toBe(false);
  });

  it('should accept filters object', () => {
    const result = SearchConfigSchema.safeParse({
      tenantId: 't',
      userId: 'u',
      query: 'q',
      filters: {
        status: ['OPEN'],
        owner: 'user-1',
        tags: ['important'],
        classification: ['confidential'],
        documentTypes: ['contract'],
      },
    });
    expect(result.success).toBe(true);
  });
});

// =============================================
// ACLService Tests
// =============================================

describe('ACLService', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let aclService: ACLService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    aclService = new ACLService(mockPrisma as any);
  });

  describe('buildContext', () => {
    it('should build ACL context with roles and permissions from role assignments', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        {
          role: {
            name: 'ADMIN',
            permissions: [
              { granted: true, permission: { name: 'leads:read' } },
              { granted: true, permission: { name: 'contacts:read' } },
              { granted: false, permission: { name: 'settings:write' } },
            ],
          },
        },
      ]);
      mockPrisma.userPermission.findMany.mockResolvedValue([]);

      const ctx = await aclService.buildContext('user-1', 'tenant-1');

      expect(ctx.userId).toBe('user-1');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.roles).toEqual(['ADMIN']);
      expect(ctx.permissions).toContain('leads:read');
      expect(ctx.permissions).toContain('contacts:read');
      expect(ctx.permissions).not.toContain('settings:write');
    });

    it('should merge user-level permission overrides', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        {
          role: {
            name: 'USER',
            permissions: [{ granted: true, permission: { name: 'leads:read' } }],
          },
        },
      ]);
      mockPrisma.userPermission.findMany.mockResolvedValue([
        { permission: { name: 'accounts:read' } },
      ]);

      const ctx = await aclService.buildContext('user-2', 'tenant-1');

      expect(ctx.permissions).toContain('leads:read');
      expect(ctx.permissions).toContain('accounts:read');
    });

    it('should deduplicate permissions', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        {
          role: {
            name: 'USER',
            permissions: [{ granted: true, permission: { name: 'leads:read' } }],
          },
        },
      ]);
      mockPrisma.userPermission.findMany.mockResolvedValue([
        { permission: { name: 'leads:read' } },
      ]);

      const ctx = await aclService.buildContext('user-1', 'tenant-1');

      const leadReadCount = ctx.permissions.filter((p) => p === 'leads:read').length;
      expect(leadReadCount).toBe(1);
    });

    it('should return empty roles and permissions when user has none', async () => {
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userPermission.findMany.mockResolvedValue([]);

      const ctx = await aclService.buildContext('user-1', 'tenant-1');

      expect(ctx.roles).toEqual([]);
      expect(ctx.permissions).toEqual([]);
    });
  });

  describe('canAccess', () => {
    it('should allow ADMIN to access everything', () => {
      const ctx: ACLContext = {
        userId: 'admin-1',
        tenantId: 'tenant-1',
        roles: ['ADMIN'],
        permissions: [],
      };
      expect(aclService.canAccess(ctx, 'leads', 'other-user')).toBe(true);
    });

    it('should allow access when user has the required permission', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: ['leads:read'],
      };
      expect(aclService.canAccess(ctx, 'leads', 'other-user', 'read')).toBe(true);
    });

    it('should allow access when user owns the resource', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: [],
      };
      expect(aclService.canAccess(ctx, 'leads', 'user-1')).toBe(true);
    });

    it('should deny access for non-owner without permission', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: [],
      };
      expect(aclService.canAccess(ctx, 'leads', 'other-user')).toBe(false);
    });

    it('should deny MANAGER access for now (simplified)', () => {
      const ctx: ACLContext = {
        userId: 'mgr-1',
        tenantId: 'tenant-1',
        roles: ['MANAGER'],
        permissions: [],
      };
      expect(aclService.canAccess(ctx, 'leads', 'other-user')).toBe(false);
    });

    it('should default required permission to read', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: ['leads:read'],
      };
      expect(aclService.canAccess(ctx, 'leads', 'other-user')).toBe(true);
    });
  });

  describe('buildACLFilter', () => {
    it('should return tenant-only filter for ADMIN', () => {
      const ctx: ACLContext = {
        userId: 'admin-1',
        tenantId: 'tenant-1',
        roles: ['ADMIN'],
        permissions: [],
      };
      const filter = aclService.buildACLFilter(ctx, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1' });
      expect(filter).not.toHaveProperty('ownerId');
    });

    it('should return tenant-only filter when user has global read permission', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: ['leads:read'],
      };
      const filter = aclService.buildACLFilter(ctx, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1' });
    });

    it('should return owner-scoped filter for read:own permission', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: ['leads:read:own'],
      };
      const filter = aclService.buildACLFilter(ctx, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' });
    });

    it('should default to owner-scoped filter when no permissions match', () => {
      const ctx: ACLContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['USER'],
        permissions: [],
      };
      const filter = aclService.buildACLFilter(ctx, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' });
    });
  });
});

// =============================================
// RelevanceEvaluator Tests
// =============================================

describe('RelevanceEvaluator', () => {
  let evaluator: RelevanceEvaluator;
  const fixedOrigin = new Date('2025-06-01T00:00:00Z');

  beforeEach(() => {
    evaluator = new RelevanceEvaluator({
      ...DEFAULT_RELEVANCE_CONFIG,
      dateDecayOrigin: fixedOrigin,
    });
  });

  describe('combineScores', () => {
    it('should combine FTS and semantic scores with default weights', () => {
      // weights: fullText=0.4, semantic=0.6
      const combined = evaluator.combineScores(1.0, 0.5);
      expect(combined).toBeCloseTo(0.4 * 1.0 + 0.6 * 0.5, 5);
    });

    it('should return 0 when both scores are 0', () => {
      expect(evaluator.combineScores(0, 0)).toBe(0);
    });
  });

  describe('applyTimeDecay', () => {
    it('should apply no decay to document created at origin', () => {
      const score = evaluator.applyTimeDecay(0.8, fixedOrigin);
      // No decay: factor should be 1.0, so score * (1 + (recentBoost-1) * 1)
      expect(score).toBeCloseTo(0.8 * DEFAULT_RELEVANCE_CONFIG.recentBoost, 3);
    });

    it('should apply full decay to very old documents', () => {
      const veryOldDate = new Date('2000-01-01T00:00:00Z');
      const decayed = evaluator.applyTimeDecay(0.8, veryOldDate);
      // Should be close to the original score (boost factor ~0)
      expect(decayed).toBeGreaterThan(0.79);
      expect(decayed).toBeLessThan(0.8 * DEFAULT_RELEVANCE_CONFIG.recentBoost);
    });

    it('should return score > base for recent documents', () => {
      const recentDate = new Date(fixedOrigin.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const decayed = evaluator.applyTimeDecay(0.8, recentDate);
      expect(decayed).toBeGreaterThan(0.8);
    });
  });

  describe('applyTitleBoost', () => {
    it('should boost score when query terms match title', () => {
      const boosted = evaluator.applyTitleBoost(0.5, ['contract'], 'Contract Agreement');
      expect(boosted).toBeGreaterThan(0.5);
    });

    it('should not boost when no query terms match title', () => {
      const result = evaluator.applyTitleBoost(0.5, ['xyz', 'abc'], 'Contract Agreement');
      expect(result).toBe(0.5);
    });

    it('should boost proportionally to number of matching terms', () => {
      const partial = evaluator.applyTitleBoost(0.5, ['contract', 'other'], 'Contract Agreement');
      const full = evaluator.applyTitleBoost(0.5, ['contract', 'agreement'], 'Contract Agreement');
      expect(full).toBeGreaterThan(partial);
    });

    it('should handle case-insensitive matching', () => {
      const boosted = evaluator.applyTitleBoost(0.5, ['CONTRACT'], 'contract agreement');
      expect(boosted).toBeGreaterThan(0.5);
    });

    it('should handle empty query terms', () => {
      const result = evaluator.applyTitleBoost(0.5, [], 'Contract Agreement');
      expect(result).toBe(0.5);
    });
  });

  describe('calculateFinalScore', () => {
    it('should clamp score to [0, 1]', () => {
      // Very high inputs
      const score = evaluator.calculateFinalScore(1.0, 1.0, fixedOrigin, 'test', ['test']);
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should produce 0 for zero inputs', () => {
      const score = evaluator.calculateFinalScore(0, 0, fixedOrigin, '', []);
      expect(score).toBe(0);
    });
  });

  describe('filterAndRank', () => {
    it('should filter out results below minScore', () => {
      const results = [
        makeSearchResult({ relevanceScore: 0.1 }),
        makeSearchResult({ id: 'res-2', relevanceScore: 0.8 }),
      ];
      const ranked = evaluator.filterAndRank(results, ['test']);
      // 0.1 may or may not survive depending on boosting, but it should be lower
      for (const r of ranked) {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(DEFAULT_RELEVANCE_CONFIG.minScore);
      }
    });

    it('should sort results by relevanceScore descending', () => {
      const results = [
        makeSearchResult({ id: 'low', relevanceScore: 0.4, title: 'Low' }),
        makeSearchResult({ id: 'high', relevanceScore: 0.9, title: 'High' }),
        makeSearchResult({ id: 'mid', relevanceScore: 0.6, title: 'Mid' }),
      ];
      const ranked = evaluator.filterAndRank(results, ['test']);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].relevanceScore).toBeGreaterThanOrEqual(ranked[i].relevanceScore);
      }
    });

    it('should limit to maxResults', () => {
      const config: RelevanceConfig = {
        ...DEFAULT_RELEVANCE_CONFIG,
        maxResults: 2,
        dateDecayOrigin: fixedOrigin,
      };
      const limitedEvaluator = new RelevanceEvaluator(config);

      const results = Array.from({ length: 10 }, (_, i) =>
        makeSearchResult({ id: `res-${i}`, relevanceScore: 0.5 + i * 0.01 })
      );
      const ranked = limitedEvaluator.filterAndRank(results, ['test']);
      expect(ranked.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array when no results pass threshold', () => {
      const highThresholdEval = new RelevanceEvaluator({
        ...DEFAULT_RELEVANCE_CONFIG,
        minScore: 0.99,
        dateDecayOrigin: fixedOrigin,
      });
      const results = [makeSearchResult({ relevanceScore: 0.01 })];
      const ranked = highThresholdEval.filterAndRank(results, []);
      expect(ranked).toHaveLength(0);
    });

    it('should handle empty input', () => {
      expect(evaluator.filterAndRank([], ['test'])).toEqual([]);
    });
  });
});

// =============================================
// RetrievalService Tests
// =============================================

describe('RetrievalService', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: RetrievalService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new RetrievalService(mockPrisma as any);
  });

  describe('search - full pipeline', () => {
    const baseConfig: SearchConfig = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      userRoles: [],
      query: 'hello world',
      searchType: 'hybrid',
      limit: 20,
      offset: 0,
      includeMetadata: true,
      minRelevanceScore: 0.3,
      semanticThreshold: 0.7,
    };

    it('should return a SearchResponse with correct shape', async () => {
      const response = await service.search(baseConfig);

      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('query', 'hello world');
      expect(response).toHaveProperty('searchType', 'hybrid');
      expect(response).toHaveProperty('executionTimeMs');
      expect(response).toHaveProperty('facets');
      expect(Array.isArray(response.results)).toBe(true);
      expect(typeof response.executionTimeMs).toBe('number');
    });

    it('should search default sources when none specified', async () => {
      await service.search({ ...baseConfig, sources: undefined });

      // Default sources: leads, contacts, accounts, opportunities, documents
      expect(mockPrisma.lead.findMany).toHaveBeenCalled();
      expect(mockPrisma.contact.findMany).toHaveBeenCalled();
      expect(mockPrisma.account.findMany).toHaveBeenCalled();
      expect(mockPrisma.opportunity.findMany).toHaveBeenCalled();
    });

    it('should only search specified sources', async () => {
      await service.search({ ...baseConfig, sources: ['leads'] });

      expect(mockPrisma.lead.findMany).toHaveBeenCalled();
      expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
    });

    it('should build ACL context and apply filters', async () => {
      // Setup an ADMIN user
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
        {
          role: {
            name: 'ADMIN',
            permissions: [{ granted: true, permission: { name: 'leads:read' } }],
          },
        },
      ]);

      await service.search({ ...baseConfig, sources: ['leads'] });

      // Lead findMany should have been called with a filter containing tenantId
      const callArgs = mockPrisma.lead.findMany.mock.calls[0][0];
      expect(callArgs.where).toHaveProperty('tenantId', 'tenant-1');
    });

    it('should return leads as search results', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: 'Acme',
          title: 'CTO',
          status: 'NEW',
          score: 80,
          source: 'WEBSITE',
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Use query that matches lead data so relevance score exceeds threshold
      const response = await service.search({
        ...baseConfig,
        query: 'John Doe Acme',
        sources: ['leads'],
      });

      expect(response.results.length).toBeGreaterThan(0);
      const lead = response.results[0];
      expect(lead.source).toBe('leads');
      expect(lead.title).toBe('John Doe');
      expect(lead.metadata).toHaveProperty('email', 'john@example.com');
    });

    it('should return contacts as search results', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'contact-1',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: 'VP Sales',
          department: 'Sales',
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
          account: { name: 'BigCorp' },
        },
      ]);

      const response = await service.search({
        ...baseConfig,
        query: 'Jane Smith Sales',
        sources: ['contacts'],
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('contacts');
      expect(response.results[0].title).toBe('Jane Smith');
    });

    it('should return accounts as search results', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'acct-1',
          name: 'Acme Corp',
          website: 'https://acme.com',
          industry: 'Technology',
          employees: 500,
          description: 'A tech company',
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const response = await service.search({
        ...baseConfig,
        query: 'Acme Corp Technology',
        sources: ['accounts'],
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('accounts');
      expect(response.results[0].title).toBe('Acme Corp');
    });

    it('should return opportunities as search results', async () => {
      mockPrisma.opportunity.findMany.mockResolvedValue([
        {
          id: 'opp-1',
          name: 'Big Deal',
          description: 'Enterprise license',
          stage: 'DISCOVERY',
          value: { toString: () => '50000' },
          probability: 60,
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
          account: { name: 'Acme Corp' },
        },
      ]);

      const response = await service.search({
        ...baseConfig,
        query: 'Big Deal Enterprise',
        sources: ['opportunities'],
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('opportunities');
      expect(response.results[0].metadata).toHaveProperty('value', '50000');
    });

    it('should return conversations as search results', async () => {
      mockPrisma.conversationRecord.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'session-12345678',
          title: 'Support Chat',
          summary: 'Customer asked about billing',
          agentName: 'Support Bot',
          channel: 'CHAT',
          messageCount: 5,
          status: 'ACTIVE',
          userId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const response = await service.search({
        ...baseConfig,
        query: 'Support Chat billing',
        sources: ['conversations'],
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('conversations');
      expect(response.results[0].title).toBe('Support Chat');
    });

    it('should return messages as search results', async () => {
      mockPrisma.messageRecord.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          content: 'Hello world message content',
          role: 'user',
          conversationId: 'conv-1',
          createdAt: now,
          conversation: { title: 'Support Chat', userId: 'user-1' },
        },
      ]);

      const response = await service.search({ ...baseConfig, sources: ['messages'] });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('messages');
    });

    it('should return tickets as search results', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([
        {
          id: 'ticket-1',
          ticketNumber: 'TKT-001',
          subject: 'Hello world issue',
          description: 'Something is broken',
          status: 'OPEN',
          priority: 'HIGH',
          slaStatus: 'WITHIN_SLA',
          contactName: 'Jane Smith',
          assigneeId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const response = await service.search({ ...baseConfig, sources: ['tickets'] });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].source).toBe('tickets');
      expect(response.results[0].title).toBe('TKT-001: Hello world issue');
    });

    it('should reject unknown source via schema validation', async () => {
      // The SearchConfigSchema validates sources against enum, so unknown throws
      await expect(
        service.search({
          ...baseConfig,
          sources: ['unknown' as any],
        })
      ).rejects.toThrow();
    });

    it('should apply pagination (offset + limit)', async () => {
      // Create 5 leads
      mockPrisma.lead.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `lead-${i}`,
          email: `lead${i}@test.com`,
          firstName: 'Lead',
          lastName: `${i}`,
          company: 'Test',
          title: 'Dev',
          status: 'NEW',
          score: 90 - i * 5,
          source: 'WEBSITE',
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
        }))
      );

      const response = await service.search({
        ...baseConfig,
        sources: ['leads'],
        limit: 2,
        offset: 1,
      });

      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it('should build facets from results', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          email: 'a@test.com',
          firstName: 'A',
          lastName: 'B',
          company: 'C',
          title: null,
          status: 'NEW',
          score: null,
          source: null,
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const response = await service.search({ ...baseConfig, sources: ['leads'] });

      expect(response.facets).toBeDefined();
      expect(response.facets).toHaveProperty('sources');
      expect(response.facets).toHaveProperty('dateRanges');
    });

    it('should log search to audit', async () => {
      await service.search(baseConfig);
      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should not fail if audit logging throws', async () => {
      mockPrisma.auditLogEntry.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      const response = await service.search(baseConfig);
      expect(response).toBeDefined();
    });

    it('should throw on invalid config (Zod validation)', async () => {
      await expect(
        service.search({ tenantId: 't', userId: 'u', query: '' } as any)
      ).rejects.toThrow();
    });

    it('should filter short query terms (length <= 2)', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          email: 'a@test.com',
          firstName: 'AB',
          lastName: 'CD',
          company: 'EF',
          title: null,
          status: 'NEW',
          score: null,
          source: null,
          ownerId: 'user-1',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // All terms length <= 2, so queryTerms will be empty after filter
      const response = await service.search({
        ...baseConfig,
        query: 'ab cd',
        sources: ['leads'],
      });

      expect(response).toBeDefined();
    });
  });

  describe('search - document search dispatch', () => {
    const docConfig: SearchConfig = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      userRoles: [],
      query: 'contract agreement',
      sources: ['documents'],
      searchType: 'fulltext',
      limit: 20,
      offset: 0,
      includeMetadata: true,
      minRelevanceScore: 0.3,
      semanticThreshold: 0.7,
    };

    it('should dispatch fulltext search for documents', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.search(docConfig);

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should dispatch semantic search for documents', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.search({ ...docConfig, searchType: 'semantic' });

      // Should call $queryRaw for embedding-based search
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should dispatch hybrid search for documents (default)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.search({ ...docConfig, searchType: 'hybrid' });

      // Hybrid calls both FTS and semantic in parallel
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('createRetrievalService factory', () => {
    it('should create a RetrievalService instance', () => {
      const svc = createRetrievalService(mockPrisma as any);
      expect(svc).toBeInstanceOf(RetrievalService);
    });

    it('should accept optional relevanceConfig', () => {
      const svc = createRetrievalService(mockPrisma as any, { minScore: 0.5 });
      expect(svc).toBeInstanceOf(RetrievalService);
    });
  });
});
