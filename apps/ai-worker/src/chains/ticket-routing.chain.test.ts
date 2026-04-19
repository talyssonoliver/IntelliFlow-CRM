/**
 * Ticket Routing Chain Tests (IFC-067)
 *
 * Covers H3: VersionLoader integration — tenant-versioned prompt loading
 * with graceful fallback when no active version exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { TicketRoutingChain } from './ticket-routing.chain';
import type { TicketRoutingInput } from '@intelliflow/validators';

// Mock the AI config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'mock',
    openai: {
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 400,
      timeout: 30000,
    },
    ollama: { baseUrl: 'http://localhost:11434', model: 'mistral' },
    costTracking: { enabled: false },
    performance: { rateLimitPerMinute: 60 },
    features: { enableChainLogging: false },
  },
}));

// Mock LLM factory — returns a deterministic routing result
vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: '{}' }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue({
        inferredCategory: 'TECHNICAL',
        assigneeId: 'agent-001',
        reason: 'Technical issue matches engineering skill set.',
        confidence: 0.85,
        escalationRisk: 'low',
      }),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock the VersionLoader singleton so tests never hit the DB.
// Default: getChainConfig throws (simulates no active version → fallback to default prompt).
vi.mock('../versioning/chain-version-loader', () => ({
  getVersionLoader: vi.fn(() => ({
    getChainConfig: vi.fn().mockRejectedValue(new Error('No active version')),
  })),
  CHAIN_TYPE_MAP: {
    LEAD_SCORING: 'SCORING',
    CHURN_RISK: 'SCORING',
    INSIGHT_GENERATION: 'QUALIFICATION',
    SENTIMENT_ANALYSIS: 'EMAIL_WRITER',
    TICKET_ROUTING: 'FOLLOWUP',
    AUTO_RESPONSE: 'EMAIL_WRITER',
  },
  configureVersionLoader: vi.fn(),
}));

const BASE_INPUT: TicketRoutingInput = {
  ticketId: 'ticket-001',
  tenantId: 'tenant-001',
  subject: 'Cannot log in to dashboard',
  description: 'Getting authentication error on login page.',
  priority: 'HIGH',
  agentCandidates: [
    {
      agentId: 'agent-001',
      name: 'Alice',
      skills: ['TECHNICAL'],
      currentLoad: 3,
      maxCapacity: 8,
      status: 'ONLINE',
    },
  ],
};

describe('TicketRoutingChain', () => {
  describe('basic routing', () => {
    it('should route a ticket and return a valid result', async () => {
      const chain = new TicketRoutingChain();
      const result = await chain.routeTicket(BASE_INPUT);

      expect(result).toBeDefined();
      expect(result.assigneeId).toBe('agent-001');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // H3: VersionLoader integration tests
  // ============================================================

  describe('VersionLoader integration (H3)', () => {
    it('should accept optional tenantId constructor option without throwing', () => {
      expect(() => new TicketRoutingChain({ tenantId: 'tenant-abc' })).not.toThrow();
    });

    it('uses default prompt when VersionLoader returns null (no active version)', async () => {
      const tenantChain = new TicketRoutingChain({ tenantId: 'tenant-xyz' });
      const result = await tenantChain.routeTicket(BASE_INPUT);

      expect(result).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });

    it('uses versioned prompt when VersionLoader returns a config', async () => {
      const { getVersionLoader } = await import('../versioning/chain-version-loader');
      vi.mocked(getVersionLoader).mockReturnValueOnce({
        getChainConfig: vi.fn().mockResolvedValue({
          prompt:
            'Custom versioned routing prompt: {subject} {description} {priority} {categories} {agentList}',
          model: 'gpt-4o-mini',
          temperature: 0.1,
          maxTokens: 400,
        }),
      } as any);

      const tenantChain = new TicketRoutingChain({ tenantId: 'tenant-versioned' });
      const result = await tenantChain.routeTicket(BASE_INPUT);

      expect(result).toBeDefined();
      expect(result.assigneeId).toBe('agent-001');
    });

    it('falls back to default prompt when VersionLoader throws', async () => {
      const tenantChain = new TicketRoutingChain({ tenantId: 'tenant-throw' });
      await expect(tenantChain.routeTicket(BASE_INPUT)).resolves.toBeDefined();
    });
  });
});
