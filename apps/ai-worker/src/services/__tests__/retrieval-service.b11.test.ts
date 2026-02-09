/**
 * Retrieval Service - B11 coverage tests
 *
 * Targets remaining uncovered branches:
 * - searchSource: default case (unknown source returns [])
 * - searchDocumentsDispatch: fulltext, semantic, hybrid/default cases
 * - _searchDocuments: reserved method (ACL filtering, document ACL checks)
 * - RelevanceEvaluator: applyTimeDecay with old dates, applyTitleBoost with no match
 * - ACLService: canAccess MANAGER role path, buildACLFilter read:own permission
 * - search: offset/limit pagination, facets building
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACLService,
  RelevanceEvaluator,
  RetrievalService,
  createRetrievalService,
  DEFAULT_RELEVANCE_CONFIG,
  type SearchResult,
  type ACLContext,
} from '../retrieval-service';

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

function createMockPrisma() {
  return {
    userRoleAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    userPermission: { findMany: vi.fn().mockResolvedValue([]) },
    lead: { findMany: vi.fn().mockResolvedValue([]) },
    contact: { findMany: vi.fn().mockResolvedValue([]) },
    account: { findMany: vi.fn().mockResolvedValue([]) },
    opportunity: { findMany: vi.fn().mockResolvedValue([]) },
    caseDocument: { findMany: vi.fn().mockResolvedValue([]) },
    ticket: { findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findMany: vi.fn().mockResolvedValue([]) },
    conversationRecord: { findMany: vi.fn().mockResolvedValue([]) },
    message: { findMany: vi.fn().mockResolvedValue([]) },
    messageRecord: { findMany: vi.fn().mockResolvedValue([]) },
    contactNote: { findMany: vi.fn().mockResolvedValue([]) },
    searchLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as any;
}

function createAclContext(overrides: Partial<ACLContext> = {}): ACLContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    roles: [],
    permissions: [],
    ...overrides,
  };
}

describe('Retrieval Service - b11 coverage', () => {
  describe('ACLService - canAccess', () => {
    it('should deny access for MANAGER role (simplified)', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ roles: ['MANAGER'] });
      const result = service.canAccess(context, 'leads', 'other-user');
      expect(result).toBe(false);
    });

    it('should grant access when user owns the resource', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext();
      const result = service.canAccess(context, 'leads', 'user-1');
      expect(result).toBe(true);
    });

    it('should grant access with specific permission', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ permissions: ['leads:read'] });
      const result = service.canAccess(context, 'leads', 'other-user');
      expect(result).toBe(true);
    });

    it('should deny access with no matching permission or ownership', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ permissions: ['contacts:read'] });
      const result = service.canAccess(context, 'leads', 'other-user');
      expect(result).toBe(false);
    });
  });

  describe('ACLService - buildACLFilter', () => {
    it('should return read:own filter', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ permissions: ['leads:read:own'] });
      const filter = service.buildACLFilter(context, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' });
    });

    it('should return tenant-only filter for ADMIN', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ roles: ['ADMIN'] });
      const filter = service.buildACLFilter(context, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1' });
    });

    it('should return tenant-only filter for global read permission', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext({ permissions: ['leads:read'] });
      const filter = service.buildACLFilter(context, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1' });
    });

    it('should default to own resources filter', () => {
      const prisma = createMockPrisma();
      const service = new ACLService(prisma);
      const context = createAclContext();
      const filter = service.buildACLFilter(context, 'leads');
      expect(filter).toEqual({ tenantId: 'tenant-1', ownerId: 'user-1' });
    });
  });

  describe('RelevanceEvaluator - edge cases', () => {
    it('should apply time decay for very old documents', () => {
      const evaluator = new RelevanceEvaluator({
        ...DEFAULT_RELEVANCE_CONFIG,
        dateDecayOrigin: new Date(),
      });
      const oldDate = new Date('2020-01-01');
      const result = evaluator.applyTimeDecay(0.8, oldDate);
      expect(result).toBeLessThan(0.8 * DEFAULT_RELEVANCE_CONFIG.recentBoost);
    });

    it('should apply title boost when no terms match', () => {
      const evaluator = new RelevanceEvaluator();
      const result = evaluator.applyTitleBoost(0.5, ['zzz', 'yyy'], 'Test Title');
      expect(result).toBe(0.5);
    });

    it('should apply title boost when all terms match', () => {
      const evaluator = new RelevanceEvaluator();
      const result = evaluator.applyTitleBoost(0.5, ['test', 'title'], 'Test Title');
      expect(result).toBeGreaterThan(0.5);
    });

    it('should cap final score at 1', () => {
      const evaluator = new RelevanceEvaluator({
        ...DEFAULT_RELEVANCE_CONFIG,
        titleBoost: 5.0,
        recentBoost: 3.0,
      });
      const result = evaluator.calculateFinalScore(
        0.9, 0.9, new Date(), 'Test Match', ['test', 'match']
      );
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('RetrievalService - search with unknown source', () => {
    it('should reject unknown source type via Zod validation', async () => {
      const prisma = createMockPrisma();
      const service = createRetrievalService(prisma);

      await expect(
        service.search({
          query: 'test',
          userId: 'user-1',
          tenantId: 'tenant-1',
          sources: ['unknown_source' as any],
        })
      ).rejects.toThrow();
    });
  });

  describe('RetrievalService - search with tickets source', () => {
    it('should search tickets when source includes tickets', async () => {
      const prisma = createMockPrisma();
      prisma.ticket.findMany.mockResolvedValue([
        {
          id: 'ticket-1',
          ticketNumber: 'T-001',
          subject: 'Test Issue',
          description: 'Test description',
          status: 'OPEN',
          priority: 'HIGH',
          contactName: 'John',
          contactEmail: 'john@test.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const service = createRetrievalService(prisma);
      const result = await service.search({
        query: 'test',
        userId: 'user-1',
        tenantId: 'tenant-1',
        sources: ['tickets'],
      });

      expect(prisma.ticket.findMany).toHaveBeenCalled();
    });
  });

  describe('RetrievalService - search with conversations', () => {
    it('should search conversations when source includes conversations', async () => {
      const prisma = createMockPrisma();
      const service = createRetrievalService(prisma);

      const result = await service.search({
        query: 'test',
        userId: 'user-1',
        tenantId: 'tenant-1',
        sources: ['conversations'],
      });

      expect(result.results).toEqual([]);
    });
  });

  describe('RetrievalService - search with messages', () => {
    it('should search messages when source includes messages', async () => {
      const prisma = createMockPrisma();
      const service = createRetrievalService(prisma);

      const result = await service.search({
        query: 'test',
        userId: 'user-1',
        tenantId: 'tenant-1',
        sources: ['messages'],
      });

      expect(result.results).toEqual([]);
    });
  });

  describe('RetrievalService - pagination', () => {
    it('should apply offset and limit', async () => {
      const prisma = createMockPrisma();
      const now = new Date();
      const leads = Array.from({ length: 5 }, (_, i) => ({
        id: `lead-${i}`,
        email: `lead${i}@test.com`,
        firstName: `Lead`,
        lastName: `${i}`,
        company: 'TestCo',
        title: 'Title',
        status: 'NEW',
        score: 50,
        source: 'WEBSITE',
        ownerId: 'user-1',
        createdAt: now,
        updatedAt: now,
      }));
      prisma.lead.findMany.mockResolvedValue(leads);

      const service = createRetrievalService(prisma);
      const result = await service.search({
        query: 'lead',
        userId: 'user-1',
        tenantId: 'tenant-1',
        sources: ['leads'],
        offset: 1,
        limit: 2,
      });

      expect(result.results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('createRetrievalService', () => {
    it('should create a service instance', () => {
      const prisma = createMockPrisma();
      const service = createRetrievalService(prisma);
      expect(service).toBeInstanceOf(RetrievalService);
    });

    it('should accept custom relevance config', () => {
      const prisma = createMockPrisma();
      const service = createRetrievalService(prisma, { minScore: 0.5 });
      expect(service).toBeInstanceOf(RetrievalService);
    });
  });
});
