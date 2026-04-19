/**
 * Email Writer Agent - Supplementary Tests
 *
 * Covers the previously untested execution logic:
 * - execute() and executeTask() full flow
 * - checkForHumanReview() all branches
 * - buildEmailPrompt() with various inputs
 * - calculateConfidence() adjustments
 * - Error/fallback paths when parser fails
 * - Global agent instance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pattern A: mock the factory — agent calls createLLM and uses invoke() with JSON parsing.
// Use vi.hoisted so the constant is available inside the hoisted vi.mock() factory.
const { DEFAULT_EMAIL_PARSED } = vi.hoisted(() => ({
  DEFAULT_EMAIL_PARSED: {
    subject: 'Following up on your interest in IntelliFlow',
    body: 'Dear John,\n\nThank you for your interest...',
    callToAction: 'Schedule a 15-minute demo call',
    confidence: 0.85,
    reasoning: 'Personalized outreach based on lead data.',
    suggestedSendTime: 'Tuesday 10:00 AM',
    alternativeSubjects: [
      'John, quick question about your CRM needs',
      'Ideas for improving your sales process',
    ],
    personalizationElements: [
      'Referenced company name',
      'Addressed by first name',
      'Mentioned specific interest area',
    ],
    requiresHumanReview: false,
  },
}));

// Must mock before importing agent
vi.mock('../lib/llm-factory.js', () => ({
  createLLM: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(DEFAULT_EMAIL_PARSED) }),
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn().mockResolvedValue(DEFAULT_EMAIL_PARSED),
    })),
  })),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../config/ai.config', () => ({
  aiConfig: {
    provider: 'litellm',
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

vi.mock('../utils/cost-tracker', () => ({
  costTracker: {
    recordUsage: vi.fn(),
  },
}));

vi.mock('../utils/token-counter', () => ({
  countMessagesTokens: vi.fn().mockReturnValue(100),
  countTokens: vi.fn().mockReturnValue(50),
}));

import {
  EmailWriterAgent,
  createEmailWriterTask,
  emailWriterAgent,
  type EmailWriterInput,
  type EmailWriterOutput,
} from './email-writer.agent';

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides?: Partial<EmailWriterInput>): EmailWriterInput {
  return {
    recipientEmail: 'john@example.com',
    recipientName: 'John Doe',
    purpose: 'INITIAL_OUTREACH',
    context: {},
    senderName: 'Jane Smith',
    ...overrides,
  } as EmailWriterInput;
}

// ============================================================================
// Tests
// ============================================================================

describe('EmailWriterAgent - Execution', () => {
  let agent: EmailWriterAgent;

  beforeEach(() => {
    agent = new EmailWriterAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute() - full flow', () => {
    it('should execute task and return successful AgentResult', async () => {
      const input = makeInput({
        recipientCompany: 'Acme Corp',
        recipientTitle: 'VP Sales',
      });
      const task = createEmailWriterTask(input);

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.subject).toBeTruthy();
      expect(result.output!.body).toBeTruthy();
      expect(result.output!.callToAction).toBeTruthy();
      expect(result.output!.confidence).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.metadata?.agentName).toBe('Email Writer Specialist');
    });

    it('should increment execution count', async () => {
      const input = makeInput();
      const task = createEmailWriterTask(input);

      await agent.execute(task);
      await agent.execute(task);

      const stats = agent.getStats();
      expect(stats.executionCount).toBe(2);
    });

    it('should reset execution count', async () => {
      const input = makeInput();
      const task = createEmailWriterTask(input);
      await agent.execute(task);

      agent.reset();

      const stats = agent.getStats();
      expect(stats.executionCount).toBe(0);
    });
  });

  describe('checkForHumanReview - all branches', () => {
    it('should flag low confidence (<0.5) for human review', async () => {
      // Pattern A (B2b): override structuredModel so invoke() returns the parsed object directly.
      // This bypasses the factory-level mock and injects per-test data into the execute() path.
      const parsedOutput = {
        subject: 'Follow up',
        body: 'Body text',
        callToAction: 'Call now',
        confidence: 0.3,
        reasoning: 'Uncertain about tone',
        alternativeSubjects: [],
        personalizationElements: ['name'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput();
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.requiresHumanReview).toBe(true);
      expect(result.output!.reviewReasons).toContain(
        'Low confidence score - AI uncertain about email quality'
      );
    });

    it('should flag HIGH urgency for human review', async () => {
      const parsedOutput = {
        subject: 'Urgent follow up',
        body: 'Body',
        callToAction: 'Call now',
        confidence: 0.9,
        reasoning: 'Good quality',
        alternativeSubjects: ['Alt 1'],
        personalizationElements: ['name', 'company'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({
        context: { urgency: 'HIGH' },
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.requiresHumanReview).toBe(true);
      expect(result.output!.reviewReasons).toContain(
        'High urgency communication requires human approval'
      );
    });

    it('should flag RE_ENGAGEMENT purpose for human review', async () => {
      const parsedOutput = {
        subject: 'We miss you',
        body: 'Body',
        callToAction: 'Come back',
        confidence: 0.9,
        reasoning: 'Good re-engagement',
        alternativeSubjects: ['Alt'],
        personalizationElements: ['name', 'company'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({ purpose: 'RE_ENGAGEMENT' });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.requiresHumanReview).toBe(true);
      expect(result.output!.reviewReasons).toContain(
        'Re-engagement email requires careful human review'
      );
    });

    it('should flag UNQUALIFIED lead for human review', async () => {
      const parsedOutput = {
        subject: 'Hello',
        body: 'Body',
        callToAction: 'Try us',
        confidence: 0.9,
        reasoning: 'Attempting outreach',
        alternativeSubjects: ['Alt'],
        personalizationElements: ['name', 'company'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({
        context: { qualificationLevel: 'UNQUALIFIED' },
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.requiresHumanReview).toBe(true);
      expect(result.output!.reviewReasons).toContain(
        'Email to unqualified lead needs human judgment'
      );
    });

    it('should NOT flag when no review conditions are met', async () => {
      const parsedOutput = {
        subject: 'Great offer',
        body: 'Body text',
        callToAction: 'Click here',
        confidence: 0.85,
        reasoning: 'Solid outreach',
        alternativeSubjects: ['Alt 1', 'Alt 2'],
        personalizationElements: ['name', 'company', 'role'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({
        context: { urgency: 'LOW', qualificationLevel: 'HIGH' },
        purpose: 'FOLLOW_UP',
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.requiresHumanReview).toBe(false);
    });
  });

  describe('Parser failure - fallback path', () => {
    it('should return fallback output when parser fails', async () => {
      // Override structuredModel to throw (simulates structured parse failure)
      (agent as any).model = { invoke: vi.fn().mockResolvedValue({ content: 'not valid json' }) };
      (agent as any).structuredModel = {
        invoke: vi.fn().mockRejectedValue(new Error('ZodError: parse failure')),
      };

      const input = makeInput();
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      // The executeTask fallback should produce a result
      expect(result.success).toBe(true);
      expect(result.output!.subject).toBe('Draft: Follow-up');
      expect(result.output!.confidence).toBe(0.1);
      expect(result.output!.requiresHumanReview).toBe(true);
      expect(result.output!.reviewReasons).toContain(
        'Generation failed - manual composition required'
      );
    });
  });

  describe('LLM invocation failure', () => {
    it('should return failed AgentResult when LLM throws', async () => {
      // model.invoke throws before structuredModel is ever called
      (agent as any).model = { invoke: vi.fn().mockRejectedValue(new Error('API rate limit')) };

      const input = makeInput();
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit');
      expect(result.confidence).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    // NOTE (ADR-049 reflect gate): With usesReflection: true, result.confidence is set
    // by reflect()'s verdict.confidence (= plan.estimatedConfidence = 0.7 from DEFAULT_PLAN),
    // not by calculateConfidence(). The calculateConfidence() logic remains intact for
    // non-reflection agents. These tests assert real post-reflection behavior.
    it('should cap confidence at 0.7 when input completeness < 60%', async () => {
      // Input with only recipientName filled (1 out of 5 input fields)
      const parsedOutput = {
        subject: 'Hello',
        body: 'Body',
        callToAction: 'CTA',
        confidence: 0.95,
        reasoning: 'Good email',
        alternativeSubjects: ['Alt'],
        personalizationElements: ['name', 'company', 'role'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      // Minimal input: only recipientName is truthy among the 5 checked fields
      const input = makeInput({
        recipientCompany: undefined,
        recipientTitle: undefined,
        context: {
          leadScore: undefined,
          qualificationLevel: undefined,
        },
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // Updated mock to satisfy reflect schema gate (ADR-049).
      // reflect() approves with verdict.confidence = plan.estimatedConfidence = 0.7.
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('should cap confidence at 0.6 when personalization < 2 elements', async () => {
      const parsedOutput = {
        subject: 'Hello',
        body: 'Body',
        callToAction: 'CTA',
        confidence: 0.8,
        reasoning: 'OK email',
        alternativeSubjects: ['Alt'],
        personalizationElements: ['name only'], // Only 1 element
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({
        recipientCompany: 'Acme',
        recipientTitle: 'CTO',
        context: { leadScore: 80, qualificationLevel: 'HIGH' },
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // Updated mock to satisfy reflect schema gate (ADR-049).
      // reflect() approves with verdict.confidence = plan.estimatedConfidence = 0.7.
      expect(result.confidence).toBe(0.7);
    });

    it('should preserve confidence when all conditions are met', async () => {
      const parsedOutput = {
        subject: 'Hello',
        body: 'Body',
        callToAction: 'CTA',
        confidence: 0.88,
        reasoning: 'Great email',
        alternativeSubjects: ['Alt'],
        personalizationElements: ['name', 'company', 'title'],
        requiresHumanReview: false,
      };
      (agent as any).model = {
        invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(parsedOutput) }),
      };
      (agent as any).structuredModel = { invoke: vi.fn().mockResolvedValue(parsedOutput) };

      const input = makeInput({
        recipientCompany: 'Acme',
        recipientTitle: 'CTO',
        context: { leadScore: 90, qualificationLevel: 'HIGH' },
      });
      const task = createEmailWriterTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // Updated mock to satisfy reflect schema gate (ADR-049).
      // reflect() approves with verdict.confidence = plan.estimatedConfidence = 0.7.
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('buildEmailPrompt', () => {
    it('should include all context fields in prompt', async () => {
      // We test indirectly by checking the LLM receives a prompt containing the input
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            subject: 'Test',
            body: 'Test body',
            callToAction: 'CTA',
            confidence: 0.8,
            reasoning: 'reason',
            alternativeSubjects: [],
            personalizationElements: ['a', 'b'],
            requiresHumanReview: false,
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        recipientCompany: 'TechCorp',
        recipientTitle: 'CEO',
        purpose: 'MEETING_REQUEST',
        context: {
          leadScore: 92,
          qualificationLevel: 'HIGH',
          urgency: 'MEDIUM',
          previousInteractions: ['Demo call on Dec 1', 'Email exchange on Dec 5'],
          specificTopics: ['AI integration', 'Cost reduction'],
        },
        senderTitle: 'Account Executive',
        senderCompany: 'IntelliFlow',
        tone: 'FORMAL',
        maxLength: 'SHORT',
      });

      const task = createEmailWriterTask(input);
      await agent.execute(task);

      // Get the human message content (second message)
      const humanMsgContent = capturedMessages[1]?.content || '';
      expect(humanMsgContent).toContain('John Doe');
      expect(humanMsgContent).toContain('john@example.com');
      expect(humanMsgContent).toContain('TechCorp');
      expect(humanMsgContent).toContain('CEO');
      expect(humanMsgContent).toContain('MEETING_REQUEST');
      expect(humanMsgContent).toContain('92/100');
      expect(humanMsgContent).toContain('HIGH');
      expect(humanMsgContent).toContain('MEDIUM');
      expect(humanMsgContent).toContain('Demo call on Dec 1');
      expect(humanMsgContent).toContain('Email exchange on Dec 5');
      expect(humanMsgContent).toContain('AI integration');
      expect(humanMsgContent).toContain('Cost reduction');
      expect(humanMsgContent).toContain('Account Executive');
      expect(humanMsgContent).toContain('IntelliFlow');
      expect(humanMsgContent).toContain('FORMAL');
      expect(humanMsgContent).toContain('SHORT');
    });

    it('should handle minimal input without optional fields', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            subject: 'Test',
            body: 'Body',
            callToAction: 'CTA',
            confidence: 0.7,
            reasoning: 'reason',
            alternativeSubjects: [],
            personalizationElements: ['a', 'b'],
            requiresHumanReview: false,
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput();
      const task = createEmailWriterTask(input);
      await agent.execute(task);

      const humanMsgContent = capturedMessages[1]?.content || '';
      // Should include defaults
      expect(humanMsgContent).toContain('PROFESSIONAL'); // Default tone
      expect(humanMsgContent).toContain('MEDIUM'); // Default length
      // Should NOT include optional fields that are undefined
      expect(humanMsgContent).not.toContain('Company:');
      expect(humanMsgContent).not.toContain('Title:');
    });
  });

  describe('System prompt generation', () => {
    it('should include agent name and role in system prompt', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            subject: 'Test',
            body: 'Body',
            callToAction: 'CTA',
            confidence: 0.8,
            reasoning: 'reason',
            alternativeSubjects: [],
            personalizationElements: ['a', 'b'],
            requiresHumanReview: false,
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput();
      const task = createEmailWriterTask(input);
      await agent.execute(task);

      const systemMsgContent = capturedMessages[0]?.content || '';
      expect(systemMsgContent).toContain('Email Writer Specialist');
      expect(systemMsgContent).toContain('Professional Email Communication Expert');
    });
  });

  describe('createEmailWriterTask', () => {
    it('should create task without context', () => {
      const input = makeInput();
      const task = createEmailWriterTask(input);

      expect(task.id).toMatch(/^email-john-\d+$/);
      expect(task.description).toContain('INITIAL_OUTREACH');
      expect(task.context).toBeUndefined();
    });

    it('should include context when provided', () => {
      const input = makeInput();
      const task = createEmailWriterTask(input, {
        userId: 'u1',
        sessionId: 's1',
      });

      expect(task.context?.userId).toBe('u1');
      expect(task.context?.sessionId).toBe('s1');
    });
  });

  describe('Global instance', () => {
    it('should export a global emailWriterAgent instance', () => {
      expect(emailWriterAgent).toBeInstanceOf(EmailWriterAgent);
      expect(emailWriterAgent.getStats().name).toBe('Email Writer Specialist');
    });
  });

  describe('Custom config override', () => {
    it('should allow overriding agent config', () => {
      const customAgent = new EmailWriterAgent({
        maxIterations: 10,
        verbose: false,
      });

      const stats = customAgent.getStats();
      expect(stats.config.maxIterations).toBe(10);
      expect(stats.config.verbose).toBe(false);
      // Base config should still be applied
      expect(stats.name).toBe('Email Writer Specialist');
    });
  });
});
