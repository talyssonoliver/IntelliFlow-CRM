import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LeadQualificationAgent,
  QualificationInput,
  QualificationOutput,
  createQualificationTask,
  qualificationInputSchema,
  qualificationOutputSchema,
} from './qualification.agent';

// Mock the BaseAgent's LLM invocation
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        qualified: true,
        qualificationLevel: 'HIGH',
        confidence: 0.9,
        reasoning: 'Strong buying signals with decision-maker title and corporate email',
        strengths: ['VP title indicates decision-making authority', 'Corporate email domain'],
        concerns: [],
        recommendedActions: [
          {
            action: 'Schedule discovery call',
            priority: 'HIGH',
            reasoning: 'High qualification score warrants immediate outreach',
          },
        ],
        nextSteps: ['Send personalized email', 'Schedule call within 48 hours'],
        estimatedConversionProbability: 0.75,
      }),
    }),
  })),
}));

// Mock StructuredOutputParser
vi.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: vi.fn(() => ({
      parse: vi.fn((response: string) => JSON.parse(response)),
      getFormatInstructions: vi.fn(() => 'Format instructions here'),
    })),
  },
}));

// Mock the ai.config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'openai',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      apiKey: 'test-api-key',
    },
    costTracking: {
      enabled: true,
    },
  },
}));

// Mock cost tracker
vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    recordUsage: vi.fn(),
  },
}));

describe('LeadQualificationAgent', () => {
  let agent: LeadQualificationAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new LeadQualificationAgent();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const stats = agent.getStats();

      expect(stats.name).toBe('Lead Qualification Specialist');
      expect(stats.role).toBe('Expert Lead Qualification Analyst');
      expect(stats.config.maxIterations).toBe(3);
      expect(stats.config.verbose).toBe(true);
    });

    it('should accept custom config', () => {
      const customAgent = new LeadQualificationAgent({
        name: 'Custom Qualifier',
        maxIterations: 5,
      });

      const stats = customAgent.getStats();
      expect(stats.name).toBe('Custom Qualifier');
      expect(stats.config.maxIterations).toBe(5);
    });
  });

  describe('execute', () => {
    it('should qualify a high-quality lead', async () => {
      const input: QualificationInput = {
        leadId: 'lead-001',
        email: 'john.doe@acme.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'VP of Sales',
        phone: '+1-555-0123',
        source: 'WEBSITE',
        score: 85,
      };

      const task = createQualificationTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output?.qualified).toBe(true);
      expect(result.output?.qualificationLevel).toBe('HIGH');
      expect(result.output?.confidence).toBeGreaterThanOrEqual(0);
      expect(result.output?.confidence).toBeLessThanOrEqual(1);
      expect(result.output?.strengths).toBeInstanceOf(Array);
      expect(result.output?.concerns).toBeInstanceOf(Array);
      expect(result.output?.recommendedActions).toBeInstanceOf(Array);
      expect(result.output?.nextSteps).toBeInstanceOf(Array);
    });

    it('should handle minimal lead data', async () => {
      const input: QualificationInput = {
        leadId: 'lead-002',
        email: 'test@gmail.com',
        source: 'COLD_CALL',
      };

      const task = createQualificationTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should include company data in analysis', async () => {
      const input: QualificationInput = {
        leadId: 'lead-003',
        email: 'ceo@startup.io',
        firstName: 'Jane',
        company: 'Startup Inc',
        title: 'CEO',
        source: 'REFERRAL',
        companyData: {
          industry: 'Technology',
          size: '50-100',
          revenue: '$5M-$10M',
          location: 'San Francisco',
        },
      };

      const task = createQualificationTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should include recent activities in analysis', async () => {
      const input: QualificationInput = {
        leadId: 'lead-004',
        email: 'active@company.com',
        firstName: 'Active',
        lastName: 'User',
        company: 'Active Corp',
        source: 'WEBSITE',
        recentActivities: [
          'Downloaded whitepaper',
          'Attended webinar',
          'Requested demo',
          'Visited pricing page 3 times',
        ],
      };

      const task = createQualificationTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should handle parsing errors gracefully', async () => {
      const failingAgent = new LeadQualificationAgent();

      // Mock parser to throw error
      (failingAgent as any).parser = {
        parse: vi.fn().mockRejectedValue(new Error('Parse error')),
        getFormatInstructions: vi.fn(() => 'Format instructions'),
      };

      const input: QualificationInput = {
        leadId: 'lead-005',
        email: 'test@test.com',
        source: 'WEBSITE',
      };

      const task = createQualificationTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output?.qualified).toBe(false);
      expect(result.output?.qualificationLevel).toBe('UNQUALIFIED');
      expect(result.output?.confidence).toBe(0.1);
      expect(result.output?.concerns).toContain('Analysis incomplete - requires manual review');
    });
  });

  describe('buildQualificationPrompt', () => {
    it('should build complete prompt with all fields', () => {
      const input: QualificationInput = {
        leadId: 'lead-006',
        email: 'complete@test.com',
        firstName: 'Complete',
        lastName: 'Lead',
        company: 'Test Corp',
        title: 'CTO',
        phone: '+1-555-1234',
        source: 'REFERRAL',
        score: 90,
        companyData: {
          industry: 'SaaS',
          size: '100-500',
        },
        recentActivities: ['Visited website', 'Downloaded guide'],
      };

      const prompt = (agent as any).buildQualificationPrompt(input);

      expect(prompt).toContain('lead-006');
      expect(prompt).toContain('complete@test.com');
      expect(prompt).toContain('Complete Lead');
      expect(prompt).toContain('Test Corp');
      expect(prompt).toContain('CTO');
      expect(prompt).toContain('REFERRAL');
      expect(prompt).toContain('90/100');
      expect(prompt).toContain('Phone: Available');
      expect(prompt).toContain('SaaS');
      expect(prompt).toContain('100-500');
      expect(prompt).toContain('Visited website');
      expect(prompt).toContain('BANT Assessment');
      expect(prompt).toContain('Engagement Quality');
    });

    it('should handle missing optional fields', () => {
      const input: QualificationInput = {
        leadId: 'lead-007',
        email: 'minimal@test.com',
        source: 'WEBSITE',
      };

      const prompt = (agent as any).buildQualificationPrompt(input);

      expect(prompt).toContain('lead-007');
      expect(prompt).toContain('minimal@test.com');
      expect(prompt).toContain('WEBSITE');
      expect(prompt).not.toContain('Name:');
      expect(prompt).not.toContain('Company:');
      expect(prompt).not.toContain('Title:');
    });
  });

  describe('calculateConfidence', () => {
    it('should return agent confidence for complete data', async () => {
      const input: QualificationInput = {
        leadId: 'lead-008',
        email: 'complete@test.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CEO',
        phone: '+1-555-1234',
        source: 'REFERRAL',
        companyData: {
          industry: 'Tech',
        },
      };

      const output: QualificationOutput = {
        qualified: true,
        qualificationLevel: 'HIGH',
        confidence: 0.95,
        reasoning: 'High quality lead',
        strengths: ['Strong profile'],
        concerns: [],
        recommendedActions: [],
        nextSteps: [],
        estimatedConversionProbability: 0.8,
      };

      const task = createQualificationTask(input);
      const confidence = await (agent as any).calculateConfidence(task, output);

      expect(confidence).toBe(0.95);
    });

    it('should cap confidence for incomplete data', async () => {
      const input: QualificationInput = {
        leadId: 'lead-009',
        email: 'incomplete@test.com',
        source: 'COLD_CALL',
      };

      const output: QualificationOutput = {
        qualified: true,
        qualificationLevel: 'MEDIUM',
        confidence: 0.95, // Agent says high confidence
        reasoning: 'Some reasoning',
        strengths: [],
        concerns: [],
        recommendedActions: [],
        nextSteps: [],
        estimatedConversionProbability: 0.5,
      };

      const task = createQualificationTask(input);
      const confidence = await (agent as any).calculateConfidence(task, output);

      expect(confidence).toBe(0.7); // Capped due to low data completeness
    });
  });

  describe('schemas', () => {
    describe('qualificationInputSchema', () => {
      it('should validate valid input', () => {
        const validInput = {
          leadId: 'lead-010',
          email: 'valid@test.com',
          source: 'WEBSITE',
        };

        expect(() => qualificationInputSchema.parse(validInput)).not.toThrow();
      });

      it('should reject invalid email', () => {
        const invalidInput = {
          leadId: 'lead-011',
          email: 'not-an-email',
          source: 'WEBSITE',
        };

        expect(() => qualificationInputSchema.parse(invalidInput)).toThrow();
      });

      it('should reject invalid score range', () => {
        const invalidInput = {
          leadId: 'lead-012',
          email: 'test@test.com',
          source: 'WEBSITE',
          score: 150,
        };

        expect(() => qualificationInputSchema.parse(invalidInput)).toThrow();
      });

      it('should allow optional fields', () => {
        const validInput = {
          leadId: 'lead-013',
          email: 'test@test.com',
          source: 'WEBSITE',
          firstName: 'John',
          companyData: { industry: 'Tech' },
          recentActivities: ['Activity 1'],
        };

        expect(() => qualificationInputSchema.parse(validInput)).not.toThrow();
      });
    });

    describe('qualificationOutputSchema', () => {
      it('should validate valid output', () => {
        const validOutput = {
          qualified: true,
          qualificationLevel: 'HIGH',
          confidence: 0.9,
          reasoning: 'Strong candidate',
          strengths: ['Decision maker'],
          concerns: [],
          recommendedActions: [
            {
              action: 'Schedule call',
              priority: 'HIGH',
              reasoning: 'Immediate follow-up needed',
            },
          ],
          nextSteps: ['Send email'],
          estimatedConversionProbability: 0.75,
        };

        expect(() => qualificationOutputSchema.parse(validOutput)).not.toThrow();
      });

      it('should reject invalid qualification level', () => {
        const invalidOutput = {
          qualified: true,
          qualificationLevel: 'SUPER_HIGH',
          confidence: 0.9,
          reasoning: 'Test',
          strengths: [],
          concerns: [],
          recommendedActions: [],
          nextSteps: [],
          estimatedConversionProbability: 0.5,
        };

        expect(() => qualificationOutputSchema.parse(invalidOutput)).toThrow();
      });

      it('should reject invalid confidence range', () => {
        const invalidOutput = {
          qualified: true,
          qualificationLevel: 'HIGH',
          confidence: 1.5,
          reasoning: 'Test',
          strengths: [],
          concerns: [],
          recommendedActions: [],
          nextSteps: [],
          estimatedConversionProbability: 0.5,
        };

        expect(() => qualificationOutputSchema.parse(invalidOutput)).toThrow();
      });

      it('should reject invalid action priority', () => {
        const invalidOutput = {
          qualified: true,
          qualificationLevel: 'HIGH',
          confidence: 0.9,
          reasoning: 'Test',
          strengths: [],
          concerns: [],
          recommendedActions: [
            {
              action: 'Test action',
              priority: 'URGENT',
              reasoning: 'Test',
            },
          ],
          nextSteps: [],
          estimatedConversionProbability: 0.5,
        };

        expect(() => qualificationOutputSchema.parse(invalidOutput)).toThrow();
      });
    });
  });

  describe('createQualificationTask', () => {
    it('should create task with input', () => {
      const input: QualificationInput = {
        leadId: 'lead-014',
        email: 'test@test.com',
        source: 'WEBSITE',
      };

      const task = createQualificationTask(input);

      expect(task.id).toContain('qual-lead-014');
      expect(task.description).toBe('Qualify lead lead-014');
      expect(task.input).toEqual(input);
      expect(task.expectedOutput).toBe(qualificationOutputSchema);
    });

    it('should include context when provided', () => {
      const input: QualificationInput = {
        leadId: 'lead-015',
        email: 'test@test.com',
        source: 'WEBSITE',
      };

      const context = {
        userId: 'user-123',
        sessionId: 'session-456',
      };

      const task = createQualificationTask(input, context);

      expect(task.context).toEqual(context);
    });
  });
});
