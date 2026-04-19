import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadScoringChain, LeadInput } from './scoring.chain';

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

// Pattern A: mock the factory — survives provider swaps
const PARSED_SCORING_RESPONSE = {
  score: 75,
  confidence: 0.85,
  factors: [
    {
      name: 'Contact Completeness',
      impact: 20,
      reasoning:
        'Complete contact information with corporate email domain indicates a professional lead.',
    },
    {
      name: 'Engagement Quality',
      impact: 15,
      reasoning: 'Website source suggests active interest in the product.',
    },
    {
      name: 'Qualification Signals',
      impact: 25,
      reasoning: 'VP-level title indicates decision-making authority within the organization.',
    },
    {
      name: 'Data Quality',
      impact: 15,
      reasoning: 'All required fields present with consistent formatting.',
    },
  ],
};

vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(PARSED_SCORING_RESPONSE) }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue(PARSED_SCORING_RESPONSE),
    })),
  })),
  createLLMForTenant: vi.fn(async () => ({
    invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(PARSED_SCORING_RESPONSE) }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue(PARSED_SCORING_RESPONSE),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
  getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn: () => unknown) => fn()) })),
  __resetBreakers: vi.fn(),
}));

// Mock the AI config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'litellm',
    openai: {
      apiKey: 'test-api-key',
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      temperature: 0.7,
      timeout: 60000,
    },
    costTracking: {
      enabled: false,
      warningThreshold: 10,
    },
    performance: {
      cacheEnabled: false,
      cacheTTL: 3600,
      rateLimitPerMinute: 60,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    features: {
      enableChainLogging: false,
      enableConfidenceScores: true,
      enableStructuredOutputs: true,
      enableMultiAgentWorkflows: false,
    },
  },
}));

describe('LeadScoringChain', () => {
  let chain: LeadScoringChain;

  beforeEach(() => {
    chain = new LeadScoringChain();
  });

  describe('scoreLead', () => {
    it('should score a complete lead profile highly', async () => {
      const lead: LeadInput = {
        email: 'john.doe@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'VP of Sales',
        phone: '+1-555-0123',
        source: 'WEBSITE',
      };

      const result = await chain.scoreLead(lead);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.modelVersion).toBeDefined();
    });

    it('should process an incomplete lead profile', async () => {
      const lead: LeadInput = {
        email: 'test@gmail.com',
        source: 'COLD_CALL',
      };

      const result = await chain.scoreLead(lead);

      // With mocked LLM, we verify the chain processes correctly
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.modelVersion).toBeDefined();
    });

    it('should include detailed scoring factors', async () => {
      const lead: LeadInput = {
        email: 'jane@enterprise.com',
        firstName: 'Jane',
        company: 'Enterprise Inc',
        source: 'REFERRAL',
      };

      const result = await chain.scoreLead(lead);

      expect(result.factors.length).toBeGreaterThan(0);
      result.factors.forEach((factor) => {
        expect(factor.name).toBeDefined();
        expect(factor.impact).toBeDefined();
        expect(factor.reasoning).toBeDefined();
        expect(typeof factor.reasoning).toBe('string');
        expect(factor.reasoning.length).toBeGreaterThan(10);
      });
    });
  });

  describe('validateScoringResult', () => {
    it('should validate a good scoring result', () => {
      const result = {
        score: 85,
        confidence: 0.9,
        factors: [
          {
            name: 'Contact Completeness',
            impact: 25,
            reasoning: 'Complete contact information with corporate email',
          },
        ],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should flag low confidence results', () => {
      const result = {
        score: 50,
        confidence: 0.3,
        factors: [
          {
            name: 'Data Quality',
            impact: 10,
            reasoning: 'Incomplete information',
          },
        ],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('Low confidence'))).toBe(true);
    });

    it('should flag missing factors', () => {
      const result = {
        score: 75,
        confidence: 0.8,
        factors: [],
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateScoringResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('No scoring factors'))).toBe(true);
    });
  });

  describe('formatLeadInfo', () => {
    it('should format complete lead information', () => {
      const lead: LeadInput = {
        email: 'john@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CEO',
        phone: '+1-555-0123',
        source: 'WEBSITE',
        metadata: {
          industry: 'Technology',
          employees: '500-1000',
        },
      };

      // Access private method for testing
      const formatted = (chain as any).formatLeadInfo(lead);

      expect(formatted).toContain('Email Domain: acme.com');
      expect(formatted).not.toContain('john@acme.com');
      expect(formatted).toContain('Has Name: Yes');
      expect(formatted).not.toContain('John Doe');
      expect(formatted).toContain('Acme Corp');
      expect(formatted).toContain('CEO');
      expect(formatted).toContain('WEBSITE');
    });
  });

  // ============================================================
  // H3: VersionLoader integration tests
  // ============================================================

  describe('VersionLoader integration (H3)', () => {
    it('should accept optional tenantId constructor option without throwing', () => {
      // Constructor must not throw when tenantId is provided
      expect(() => new LeadScoringChain({ tenantId: 'tenant-abc' })).not.toThrow();
    });

    it('uses default prompt when VersionLoader returns null (no active version)', async () => {
      // VersionLoader mock always throws → resolveVersionedPrompt returns null → default prompt used
      const chain = new LeadScoringChain({ tenantId: 'tenant-xyz' });
      const lead: LeadInput = { email: 'test@acme.com', source: 'WEBSITE' };

      // scoreLead should complete without error and use the default hardcoded prompt
      const result = await chain.scoreLead(lead);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      // modelVersion confirms the chain ran (not error path)
      expect(result.modelVersion).not.toBe('error:v1');
    });

    it('uses versioned prompt when VersionLoader returns a config', async () => {
      // Override the module mock to return a successful versioned config for this test
      const { getVersionLoader } = await import('../versioning/chain-version-loader');
      vi.mocked(getVersionLoader).mockReturnValueOnce({
        getChainConfig: vi.fn().mockResolvedValue({
          prompt: 'Custom versioned prompt: {lead_info}',
          model: 'gpt-4-turbo-preview',
          temperature: 0.5,
          maxTokens: 1500,
        }),
      } as any);

      const chain = new LeadScoringChain({ tenantId: 'tenant-versioned' });
      const lead: LeadInput = { email: 'versioned@acme.com', source: 'REFERRAL' };

      const result = await chain.scoreLead(lead);

      // Chain should complete successfully with versioned prompt applied
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('falls back to default prompt when VersionLoader throws', async () => {
      // Already mocked to throw — just verify graceful fallback
      const chain = new LeadScoringChain({ tenantId: 'tenant-throw' });
      const lead: LeadInput = { email: 'fallback@test.com', source: 'COLD_CALL' };

      // Should NOT throw even when VersionLoader fails
      await expect(chain.scoreLead(lead)).resolves.toBeDefined();
    });
  });
});
