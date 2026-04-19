import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AutoResponseChain, AutoResponseInput, AutoResponseOutput } from './auto-response.chain';

// Mock the VersionLoader singleton so tests never hit the DB.
// Default: getChainConfig throws (simulates no active version → fallback to default instructions).
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

// Pattern A: mock the factory — auto-response.chain has no structuredOutput, only .invoke()
const AUTO_RESPONSE_CONTENT = JSON.stringify({
  subject: 'Re: Your inquiry about our CRM solution',
  body: 'Dear John,\n\nThank you for reaching out to IntelliFlow regarding your CRM needs.\n\nI would be happy to schedule a demo to show you how our AI-powered features can help streamline your sales process.\n\nBest regards,\nIntelliFlow Team',
  confidence: 0.87,
  tone: 'professional',
  suggestedFollowUp: '3 days',
});

const mockInvoke = vi.fn().mockResolvedValue({ content: AUTO_RESPONSE_CONTENT });

vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: mockInvoke,
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue(JSON.parse(AUTO_RESPONSE_CONTENT)),
    })),
  })),
  createLLMForTenant: vi.fn(async () => ({
    invoke: vi.fn().mockResolvedValue({ content: AUTO_RESPONSE_CONTENT }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue(JSON.parse(AUTO_RESPONSE_CONTENT)),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
  getLLMBreaker: vi.fn(() => ({ execute: vi.fn(async (fn) => fn()) })),
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

describe('AutoResponseChain', () => {
  let chain: AutoResponseChain;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = new AutoResponseChain();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateResponse', () => {
    it('should generate a response for an email trigger', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'John Doe',
          email: 'john@example.com',
          company: 'Acme Corp',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Hi, I saw your product demo and would like to know more about pricing.',
          messageType: 'inquiry',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
          signatureTemplate: 'Best regards,\n{companyName} Team',
        },
      };

      const result = await chain.generateResponse(input);

      expect(result).toBeDefined();
      expect(result.subject).toBeDefined();
      expect(result.body).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.modelVersion).toBeDefined();
    });

    it('should generate a response for a form submission trigger', async () => {
      const input: AutoResponseInput = {
        triggerType: 'FORM_SUBMIT',
        leadInfo: {
          id: 'lead-456',
          name: 'Jane Smith',
          email: 'jane@techco.com',
          company: 'TechCo',
          status: 'NEW',
        },
        context: {
          formName: 'Contact Us',
          formFields: {
            interest: 'Enterprise features',
            timeline: '1-3 months',
          },
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'friendly',
        },
      };

      const result = await chain.generateResponse(input);

      expect(result).toBeDefined();
      expect(result.subject).toBeDefined();
      expect(result.body).toBeDefined();
      expect(typeof result.body).toBe('string');
      expect(result.body.length).toBeGreaterThan(0);
    });

    it('should generate a response for a chat message trigger', async () => {
      const input: AutoResponseInput = {
        triggerType: 'CHAT_MESSAGE',
        leadInfo: {
          id: 'lead-789',
          name: 'Bob Wilson',
          email: 'bob@startup.io',
          status: 'CONTACTED',
        },
        context: {
          chatHistory: [{ role: 'user', content: 'Is there a free trial?' }],
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'casual',
        },
      };

      const result = await chain.generateResponse(input);

      expect(result).toBeDefined();
      expect(result.subject).toBeDefined();
      expect(result.body).toBeDefined();
    });

    it('should respect subject length limits', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Very long inquiry...',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const result = await chain.generateResponse(input);

      // Subject should be within limits (100 chars per ResponseContent constraint)
      expect(result.subject.length).toBeLessThanOrEqual(100);
    });

    it('should respect body length limits', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Test inquiry',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const result = await chain.generateResponse(input);

      // Body should be within limits (2000 chars per ResponseContent constraint)
      expect(result.body.length).toBeLessThanOrEqual(2000);
    });

    it('should include confidence score in response', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Product inquiry',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const result = await chain.generateResponse(input);

      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('validateResponse', () => {
    it('should validate a good response', () => {
      const response: AutoResponseOutput = {
        subject: 'Re: Your inquiry',
        body: 'Thank you for reaching out. We would be happy to help.',
        confidence: 0.85,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should flag low confidence responses', () => {
      const response: AutoResponseOutput = {
        subject: 'Re: Your inquiry',
        body: 'Generic response.',
        confidence: 0.3,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('confidence'))).toBe(true);
    });

    it('should flag empty subject', () => {
      const response: AutoResponseOutput = {
        subject: '',
        body: 'Some body content',
        confidence: 0.8,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('subject'))).toBe(true);
    });

    it('should flag empty body', () => {
      const response: AutoResponseOutput = {
        subject: 'Valid Subject',
        body: '',
        confidence: 0.8,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((issue) => issue.includes('body'))).toBe(true);
    });

    it('should flag overly long subject', () => {
      const response: AutoResponseOutput = {
        subject: 'A'.repeat(150), // Exceeds 100 char limit
        body: 'Valid body content',
        confidence: 0.8,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(false);
      expect(
        validation.issues.some(
          (issue) => issue.toLowerCase().includes('subject') && issue.toLowerCase().includes('long')
        )
      ).toBe(true);
    });

    it('should flag overly long body', () => {
      const response: AutoResponseOutput = {
        subject: 'Valid Subject',
        body: 'A'.repeat(2500), // Exceeds 2000 char limit
        confidence: 0.8,
        modelVersion: 'openai:gpt-4:v1',
      };

      const validation = chain.validateResponse(response);

      expect(validation.valid).toBe(false);
      expect(
        validation.issues.some(
          (issue) => issue.toLowerCase().includes('body') && issue.toLowerCase().includes('long')
        )
      ).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error when both structured and invoke paths fail', async () => {
      // auto-response.chain.ts now prefers withStructuredOutput; force both
      // paths to fail so the rejection surfaces out of generateResponse.
      (chain as any).llm.withStructuredOutput.mockImplementationOnce(() => ({
        invoke: vi.fn().mockRejectedValue(new Error('structured unsupported')),
      }));
      (chain as any).llm.invoke.mockRejectedValueOnce(new Error('LLM service unavailable'));

      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Test',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      await expect(chain.generateResponse(input)).rejects.toThrow();
    });

    it('should throw error for invalid LLM response format on fallback path', async () => {
      // Force structured-output path to fail so we exercise the raw-invoke + JSON.parse fallback.
      (chain as any).llm.withStructuredOutput.mockImplementationOnce(() => ({
        invoke: vi.fn().mockRejectedValue(new Error('structured unsupported')),
      }));
      (chain as any).llm.invoke.mockResolvedValueOnce({
        content: 'not valid json',
      });

      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Test',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      await expect(chain.generateResponse(input)).rejects.toThrow();
    });
  });

  describe('latency requirements', () => {
    it('should complete response generation within performance budget', async () => {
      // KPI from spec: <3s p95 latency
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Product inquiry',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const start = Date.now();
      await chain.generateResponse(input);
      const duration = Date.now() - start;

      // With mocked LLM, should be very fast
      // In production, this tests that chain processing overhead is minimal
      expect(duration).toBeLessThan(1000); // Allow 1s for processing overhead
    });
  });

  describe('tenant isolation', () => {
    it('should include tenant-specific settings in response generation', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'Inquiry',
        },
        tenantSettings: {
          companyName: 'CustomCompany',
          tone: 'formal',
          signatureTemplate: 'Sincerely,\n{companyName}',
          customInstructions: 'Always mention our 30-day money-back guarantee',
        },
      };

      // The chain should process without errors with custom tenant settings
      const result = await chain.generateResponse(input);
      expect(result).toBeDefined();
      expect(result.body).toBeDefined();
    });
  });

  describe('context handling', () => {
    it('should handle email context with original message', async () => {
      const input: AutoResponseInput = {
        triggerType: 'EMAIL_RECEIVED',
        leadInfo: {
          id: 'lead-123',
          name: 'Test User',
          email: 'test@example.com',
          status: 'NEW',
        },
        context: {
          originalMessage: 'I am interested in learning more about your enterprise pricing.',
          originalSubject: 'Pricing Question',
          senderDomain: 'enterprise.com',
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const result = await chain.generateResponse(input);
      expect(result).toBeDefined();
    });

    it('should handle form context with multiple fields', async () => {
      const input: AutoResponseInput = {
        triggerType: 'FORM_SUBMIT',
        leadInfo: {
          id: 'lead-456',
          name: 'Form Lead',
          email: 'form@example.com',
          status: 'NEW',
        },
        context: {
          formName: 'Demo Request',
          formFields: {
            companySize: '100-500',
            budget: '$5000-$10000',
            timeline: 'Q2 2025',
            currentSolution: 'Spreadsheets',
          },
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'professional',
        },
      };

      const result = await chain.generateResponse(input);
      expect(result).toBeDefined();
    });

    it('should handle chat context with conversation history', async () => {
      const input: AutoResponseInput = {
        triggerType: 'CHAT_MESSAGE',
        leadInfo: {
          id: 'lead-789',
          name: 'Chat User',
          email: 'chat@example.com',
          status: 'QUALIFIED',
        },
        context: {
          chatHistory: [
            { role: 'user', content: 'What integrations do you support?' },
            { role: 'assistant', content: 'We support Salesforce, HubSpot, and more.' },
            { role: 'user', content: 'Do you support custom webhooks?' },
          ],
        },
        tenantSettings: {
          companyName: 'IntelliFlow',
          tone: 'helpful',
        },
      };

      const result = await chain.generateResponse(input);
      expect(result).toBeDefined();
    });
  });

  // ============================================================
  // H3: VersionLoader integration tests
  // ============================================================

  describe('VersionLoader integration (H3)', () => {
    const baseInput: AutoResponseInput = {
      triggerType: 'EMAIL_RECEIVED',
      leadInfo: { id: 'lead-h3', name: 'H3 Test', email: 'h3@acme.com', status: 'NEW' },
      context: { originalMessage: 'H3 version test inquiry' },
      tenantSettings: { companyName: 'IntelliFlow', tone: 'professional' },
    };

    it('should accept optional tenantId constructor option without throwing', () => {
      expect(() => new AutoResponseChain({ tenantId: 'tenant-abc' })).not.toThrow();
    });

    it('uses default instructions when VersionLoader returns null (no active version)', async () => {
      const tenantChain = new AutoResponseChain({ tenantId: 'tenant-xyz' });
      const result = await tenantChain.generateResponse(baseInput);

      expect(result).toBeDefined();
      expect(typeof result.body).toBe('string');
    });

    it('uses versioned instructions when VersionLoader returns a config', async () => {
      const { getVersionLoader } = await import('../versioning/chain-version-loader');
      vi.mocked(getVersionLoader).mockReturnValueOnce({
        getChainConfig: vi.fn().mockResolvedValue({
          prompt: 'You are a versioned auto-response assistant.',
          model: 'gpt-4-turbo-preview',
          temperature: 0.5,
          maxTokens: 2000,
        }),
      } as any);

      const tenantChain = new AutoResponseChain({ tenantId: 'tenant-versioned' });
      const result = await tenantChain.generateResponse(baseInput);

      expect(result).toBeDefined();
      expect(typeof result.body).toBe('string');
    });

    it('falls back to default instructions when VersionLoader throws', async () => {
      const tenantChain = new AutoResponseChain({ tenantId: 'tenant-throw' });
      await expect(tenantChain.generateResponse(baseInput)).resolves.toBeDefined();
    });
  });
});
