/**
 * Email Writer Agent Tests
 *
 * Task: IFC-021 - PHASE-011: CrewAI Agent Framework
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmailWriterAgent,
  EmailWriterInput,
  EmailWriterOutput,
  emailWriterInputSchema,
  emailWriterOutputSchema,
  createEmailWriterTask,
} from './email-writer.agent';

// Mock the LangChain ChatOpenAI
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    invoke = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        subject: 'Following up on your interest in IntelliFlow',
        body: 'Dear John,\n\nThank you for your interest in our CRM solution...',
        callToAction: 'Schedule a 15-minute demo call',
        confidence: 0.85,
        reasoning: 'Based on lead engagement and company profile, personalized outreach is appropriate.',
        suggestedSendTime: 'Tuesday 10:00 AM',
        alternativeSubjects: [
          'John, let\'s discuss your CRM needs',
          'Quick question about your sales process',
        ],
        personalizationElements: [
          'Referenced company name',
          'Addressed by first name',
          'Mentioned specific interest area',
        ],
        requiresHumanReview: false,
      }),
    });
  },
}));

// Mock the AI config
vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'openai',
    openai: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 30000,
      apiKey: 'test-api-key',
    },
    costTracking: {
      enabled: false,
    },
  },
}));

describe('EmailWriterAgent', () => {
  let agent: EmailWriterAgent;

  beforeEach(() => {
    agent = new EmailWriterAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Configuration', () => {
    it('should have correct agent configuration', () => {
      const stats = agent.getStats();

      expect(stats.name).toBe('Email Writer Specialist');
      expect(stats.role).toBe('Professional Email Communication Expert');
      expect(stats.config.maxIterations).toBe(3);
      expect(stats.config.allowDelegation).toBe(false);
    });
  });

  describe('Input Schema Validation', () => {
    it('should validate valid input', () => {
      const validInput: EmailWriterInput = {
        recipientEmail: 'john@example.com',
        recipientName: 'John Doe',
        recipientCompany: 'Example Corp',
        recipientTitle: 'CTO',
        purpose: 'INITIAL_OUTREACH',
        context: {
          leadScore: 75,
          qualificationLevel: 'HIGH',
        },
        senderName: 'Jane Smith',
        senderTitle: 'Sales Rep',
        senderCompany: 'IntelliFlow',
        tone: 'PROFESSIONAL',
        maxLength: 'MEDIUM',
      };

      const result = emailWriterInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidInput = {
        recipientEmail: 'not-an-email',
        recipientName: 'John Doe',
        purpose: 'INITIAL_OUTREACH',
        context: {},
        senderName: 'Jane Smith',
      };

      const result = emailWriterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid purpose', () => {
      const invalidInput = {
        recipientEmail: 'john@example.com',
        recipientName: 'John Doe',
        purpose: 'INVALID_PURPOSE',
        context: {},
        senderName: 'Jane Smith',
      };

      const result = emailWriterInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('Output Schema Validation', () => {
    it('should validate complete output', () => {
      const validOutput: EmailWriterOutput = {
        subject: 'Test Subject',
        body: 'Email body content',
        callToAction: 'Click here',
        confidence: 0.85,
        reasoning: 'Based on lead data',
        suggestedSendTime: 'Tuesday morning',
        alternativeSubjects: ['Alt 1', 'Alt 2'],
        personalizationElements: ['Name', 'Company'],
        requiresHumanReview: false,
      };

      const result = emailWriterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject confidence outside valid range', () => {
      const invalidOutput = {
        subject: 'Test',
        body: 'Body',
        callToAction: 'CTA',
        confidence: 1.5, // Invalid: > 1
        reasoning: 'Reason',
        alternativeSubjects: [],
        personalizationElements: [],
        requiresHumanReview: false,
      };

      const result = emailWriterOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('Task Creation', () => {
    it('should create task with correct structure', () => {
      const input: EmailWriterInput = {
        recipientEmail: 'john@example.com',
        recipientName: 'John Doe',
        purpose: 'INITIAL_OUTREACH',
        context: {},
        senderName: 'Jane Smith',
      };

      const task = createEmailWriterTask(input, {
        userId: 'user-123',
        sessionId: 'session-456',
      });

      expect(task.id).toMatch(/^email-john-\d+$/);
      expect(task.description).toContain('INITIAL_OUTREACH');
      expect(task.description).toContain('John Doe');
      expect(task.input).toEqual(input);
      expect(task.context?.userId).toBe('user-123');
    });
  });

  describe('Email Purposes', () => {
    const purposes = [
      'INITIAL_OUTREACH',
      'FOLLOW_UP',
      'MEETING_REQUEST',
      'PROPOSAL',
      'THANK_YOU',
      'RE_ENGAGEMENT',
    ] as const;

    purposes.forEach((purpose) => {
      it(`should accept ${purpose} as valid purpose`, () => {
        const input: EmailWriterInput = {
          recipientEmail: 'test@example.com',
          recipientName: 'Test User',
          purpose,
          context: {},
          senderName: 'Sender',
        };

        const result = emailWriterInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Tone Options', () => {
    const tones = ['FORMAL', 'PROFESSIONAL', 'FRIENDLY', 'CASUAL'] as const;

    tones.forEach((tone) => {
      it(`should accept ${tone} as valid tone`, () => {
        const input: EmailWriterInput = {
          recipientEmail: 'test@example.com',
          recipientName: 'Test User',
          purpose: 'INITIAL_OUTREACH',
          context: {},
          senderName: 'Sender',
          tone,
        };

        const result = emailWriterInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Context Handling', () => {
    it('should handle complete context', () => {
      const input: EmailWriterInput = {
        recipientEmail: 'john@example.com',
        recipientName: 'John Doe',
        purpose: 'FOLLOW_UP',
        context: {
          leadScore: 85,
          qualificationLevel: 'HIGH',
          previousInteractions: [
            'Downloaded whitepaper on 2025-12-01',
            'Attended webinar on 2025-12-15',
          ],
          specificTopics: ['CRM automation', 'Lead scoring'],
          urgency: 'HIGH',
        },
        senderName: 'Jane Smith',
      };

      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should handle minimal context', () => {
      const input: EmailWriterInput = {
        recipientEmail: 'john@example.com',
        recipientName: 'John Doe',
        purpose: 'INITIAL_OUTREACH',
        context: {},
        senderName: 'Jane Smith',
      };

      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
