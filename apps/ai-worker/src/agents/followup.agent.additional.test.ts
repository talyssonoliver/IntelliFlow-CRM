/**
 * Follow-up Agent - Supplementary Tests
 *
 * Covers the previously untested execution logic:
 * - execute() and executeTask() full flow
 * - buildFollowupPrompt() with various inputs
 * - calculateConfidence() adjustments (no history, no company, recent contact)
 * - Error/fallback paths when parser fails
 * - LLM failure handling
 * - Global agent instance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must mock before importing agent
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    invoke = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        shouldFollowUp: true,
        urgency: 'HIGH',
        recommendedAction: 'PHONE_CALL',
        reasoning: 'Lead shows strong engagement and is at qualified stage.',
        confidence: 0.82,
        suggestedTiming: {
          optimalDay: 'TUESDAY',
          optimalTimeSlot: 'MORNING',
          reasonForTiming: 'B2B leads respond best Tuesday-Thursday mornings.',
        },
        emailSuggestions: {
          subject: 'Quick follow-up on our discussion',
          keyPoints: ['Recap value proposition', 'Address concerns'],
          tone: 'PROFESSIONAL',
        },
        callScript: {
          opening: 'Hi, this is Jane from IntelliFlow.',
          keyQuestions: ['Timeline for implementation?'],
          objectionsToAnticipate: ['Budget concerns'],
          closingStatement: 'Available for a 30-min demo next week?',
        },
        nextSteps: [
          { action: 'Call lead', deadline: 'Tuesday 10 AM', owner: 'Sales Rep' },
        ],
        riskFactors: ['Long sales cycle'],
        opportunitySignals: ['High engagement', 'Urgent timeline'],
      }),
    });
  },
}));

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
  FollowupAgent,
  createFollowupTask,
  followupAgent,
  type FollowupInput,
  type FollowupOutput,
} from './followup.agent';

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides?: Partial<FollowupInput>): FollowupInput {
  return {
    leadId: 'lead-123',
    leadEmail: 'john@example.com',
    leadName: 'John Doe',
    currentStatus: 'QUALIFIED',
    qualificationLevel: 'HIGH',
    leadScore: 85,
    interactionHistory: [],
    daysSinceLastContact: 5,
    ...overrides,
  } as FollowupInput;
}

// ============================================================================
// Tests
// ============================================================================

describe('FollowupAgent - Execution', () => {
  let agent: FollowupAgent;

  beforeEach(() => {
    agent = new FollowupAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute() - full flow', () => {
    it('should execute task and return successful AgentResult', async () => {
      const input = makeInput({
        leadCompany: 'Acme Corp',
        leadTitle: 'VP Engineering',
      });
      const task = createFollowupTask(input);

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.shouldFollowUp).toBe(true);
      expect(result.output!.urgency).toBe('HIGH');
      expect(result.output!.recommendedAction).toBe('PHONE_CALL');
      expect(result.output!.reasoning).toBeTruthy();
      expect(result.output!.confidence).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.metadata?.agentName).toBe('Follow-up Strategy Specialist');
    });

    it('should increment execution count across multiple executions', async () => {
      const input = makeInput();
      const task = createFollowupTask(input);

      await agent.execute(task);
      await agent.execute(task);
      await agent.execute(task);

      const stats = agent.getStats();
      expect(stats.executionCount).toBe(3);
    });

    it('should reset execution count', async () => {
      const input = makeInput();
      const task = createFollowupTask(input);
      await agent.execute(task);

      agent.reset();

      const stats = agent.getStats();
      expect(stats.executionCount).toBe(0);
    });
  });

  describe('Parser failure - fallback path', () => {
    it('should return conservative fallback when parser fails', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: 'Unparseable response from the LLM...',
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({ assignedSalesRep: 'Alice Johnson' });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.shouldFollowUp).toBe(true);
      expect(result.output!.urgency).toBe('MEDIUM');
      expect(result.output!.recommendedAction).toBe('ESCALATE_TO_MANAGER');
      expect(result.output!.confidence).toBe(0.1);
      expect(result.output!.reasoning).toContain('Unable to complete analysis');
      expect(result.output!.nextSteps[0].owner).toBe('Alice Johnson');
      expect(result.output!.riskFactors).toContain('Analysis incomplete - manual review required');
      expect(result.output!.opportunitySignals).toEqual([]);
    });

    it('should use default owner when assignedSalesRep is not provided', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: 'Bad response',
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({ assignedSalesRep: undefined });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.output!.nextSteps[0].owner).toBe('Sales Manager');
    });
  });

  describe('LLM invocation failure', () => {
    it('should return failed AgentResult when LLM throws', async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error('Connection timeout'));
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput();
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection timeout');
      expect(result.confidence).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    it('should cap confidence at 0.6 when no interaction history', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: true,
          urgency: 'MEDIUM',
          recommendedAction: 'SEND_EMAIL',
          reasoning: 'New lead, worth exploring',
          confidence: 0.85,
          suggestedTiming: {
            optimalDay: 'WEDNESDAY',
            optimalTimeSlot: 'AFTERNOON',
            reasonForTiming: 'Mid-week is good',
          },
          nextSteps: [{ action: 'Send email', deadline: 'Tomorrow', owner: 'Rep' }],
          riskFactors: [],
          opportunitySignals: ['New lead'],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        interactionHistory: [],
        leadCompany: 'Acme',
        daysSinceLastContact: 0,
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // No history: confidence capped at 0.6
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });

    it('should cap confidence at 0.75 when no company info', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: true,
          urgency: 'MEDIUM',
          recommendedAction: 'PHONE_CALL',
          reasoning: 'Worth following up',
          confidence: 0.9,
          suggestedTiming: {
            optimalDay: 'TUESDAY',
            optimalTimeSlot: 'MORNING',
            reasonForTiming: 'Early week',
          },
          nextSteps: [{ action: 'Call', deadline: 'Today', owner: 'Rep' }],
          riskFactors: [],
          opportunitySignals: [],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: undefined,
        interactionHistory: [
          { type: 'EMAIL_SENT', timestamp: '2025-12-01', description: 'First email' },
        ],
        daysSinceLastContact: 5,
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // No company info: confidence starts at 0.9, capped to 0.75 by !hasCompanyInfo,
      // then boosted by 0.1 (hasRecentContact && hasHistory) → min(0.85, 0.9) = 0.85
      expect(result.confidence).toBeCloseTo(0.85, 5);
    });

    it('should boost confidence when recent contact and history exist', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: true,
          urgency: 'HIGH',
          recommendedAction: 'SCHEDULE_MEETING',
          reasoning: 'Great engagement',
          confidence: 0.7,
          suggestedTiming: {
            optimalDay: 'THURSDAY',
            optimalTimeSlot: 'LATE_MORNING',
            reasonForTiming: 'They are active then',
          },
          nextSteps: [{ action: 'Schedule', deadline: 'Tomorrow', owner: 'Rep' }],
          riskFactors: [],
          opportunitySignals: ['Active engagement'],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: 'TechCo',
        interactionHistory: [
          { type: 'EMAIL_SENT', timestamp: '2025-12-28', description: 'Follow up' },
          { type: 'CALL', timestamp: '2025-12-29', description: 'Demo call' },
        ],
        daysSinceLastContact: 2, // Recent contact < 30
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // Recent contact + history: boosted by 0.1 (0.7 + 0.1 = 0.8), max 0.9
      expect(result.confidence).toBeCloseTo(0.8, 5);
    });

    it('should not boost beyond 0.9', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: true,
          urgency: 'HIGH',
          recommendedAction: 'SEND_PROPOSAL',
          reasoning: 'Ready to close',
          confidence: 0.88,
          suggestedTiming: {
            optimalDay: 'MONDAY',
            optimalTimeSlot: 'MORNING',
            reasonForTiming: 'Start of week',
          },
          nextSteps: [{ action: 'Send proposal', deadline: 'Today', owner: 'Rep' }],
          riskFactors: [],
          opportunitySignals: ['Strong intent'],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: 'BigCo',
        interactionHistory: [
          { type: 'MEETING', timestamp: '2025-12-30', description: 'Proposal discussion' },
        ],
        daysSinceLastContact: 1,
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // 0.88 + 0.1 = 0.98, capped at 0.9
      expect(result.confidence).toBe(0.9);
    });

    it('should not cap confidence when already below thresholds', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: false,
          urgency: 'LOW',
          recommendedAction: 'WAIT',
          reasoning: 'No rush',
          confidence: 0.5,
          suggestedTiming: {
            optimalDay: 'FRIDAY',
            optimalTimeSlot: 'AFTERNOON',
            reasonForTiming: 'Low priority',
          },
          nextSteps: [],
          riskFactors: [],
          opportunitySignals: [],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: undefined,
        interactionHistory: [],
        daysSinceLastContact: 60,
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      // 0.5 is below all thresholds, so no capping (already below 0.6 and 0.75)
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('buildFollowupPrompt', () => {
    it('should include all fields when fully populated', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            shouldFollowUp: true,
            urgency: 'MEDIUM',
            recommendedAction: 'SEND_EMAIL',
            reasoning: 'Test',
            confidence: 0.8,
            suggestedTiming: {
              optimalDay: 'TUESDAY',
              optimalTimeSlot: 'MORNING',
              reasonForTiming: 'Best time',
            },
            nextSteps: [],
            riskFactors: [],
            opportunitySignals: [],
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: 'MegaCorp',
        leadTitle: 'Director of Sales',
        assignedSalesRep: 'Alice Johnson',
        dealValue: 150000,
        targetCloseDate: '2026-06-30',
        interactionHistory: [
          {
            type: 'EMAIL_SENT',
            timestamp: '2025-12-01T10:00:00Z',
            description: 'Initial outreach email',
            outcome: 'Opened',
          },
          {
            type: 'CALL',
            timestamp: '2025-12-05T14:00:00Z',
            description: 'Follow-up call',
          },
        ],
      });

      const task = createFollowupTask(input);
      await agent.execute(task);

      const humanMsg = capturedMessages[1]?.content || '';
      expect(humanMsg).toContain('lead-123');
      expect(humanMsg).toContain('John Doe');
      expect(humanMsg).toContain('john@example.com');
      expect(humanMsg).toContain('MegaCorp');
      expect(humanMsg).toContain('Director of Sales');
      expect(humanMsg).toContain('QUALIFIED');
      expect(humanMsg).toContain('HIGH');
      expect(humanMsg).toContain('85/100');
      expect(humanMsg).toContain('5');
      expect(humanMsg).toContain('Alice Johnson');
      expect(humanMsg).toContain('150,000');
      expect(humanMsg).toContain('2026-06-30');
      expect(humanMsg).toContain('Initial outreach email');
      expect(humanMsg).toContain('Opened');
      expect(humanMsg).toContain('Follow-up call');
      // Guidelines should be present
      expect(humanMsg).toContain('ANALYSIS GUIDELINES');
      expect(humanMsg).toContain('DECISION CRITERIA');
      expect(humanMsg).toContain('REQUIRED OUTPUT');
    });

    it('should handle empty interaction history', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            shouldFollowUp: true,
            urgency: 'LOW',
            recommendedAction: 'NURTURE_CAMPAIGN',
            reasoning: 'New lead',
            confidence: 0.6,
            suggestedTiming: {
              optimalDay: 'WEDNESDAY',
              optimalTimeSlot: 'AFTERNOON',
              reasonForTiming: 'Default timing',
            },
            nextSteps: [],
            riskFactors: [],
            opportunitySignals: [],
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({ interactionHistory: [] });
      const task = createFollowupTask(input);
      await agent.execute(task);

      const humanMsg = capturedMessages[1]?.content || '';
      expect(humanMsg).toContain('No previous interactions recorded');
    });

    it('should omit optional fields when not provided', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            shouldFollowUp: true,
            urgency: 'MEDIUM',
            recommendedAction: 'SEND_EMAIL',
            reasoning: 'Test',
            confidence: 0.7,
            suggestedTiming: {
              optimalDay: 'MONDAY',
              optimalTimeSlot: 'MORNING',
              reasonForTiming: 'Test',
            },
            nextSteps: [],
            riskFactors: [],
            opportunitySignals: [],
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        leadCompany: undefined,
        leadTitle: undefined,
        assignedSalesRep: undefined,
        dealValue: undefined,
        targetCloseDate: undefined,
      });

      const task = createFollowupTask(input);
      await agent.execute(task);

      const humanMsg = capturedMessages[1]?.content || '';
      expect(humanMsg).not.toContain('Company:');
      expect(humanMsg).not.toContain('Title:');
      expect(humanMsg).not.toContain('Assigned To:');
      expect(humanMsg).not.toContain('Deal Value:');
      expect(humanMsg).not.toContain('Target Close:');
    });
  });

  describe('System prompt generation', () => {
    it('should include agent name, role, and backstory', async () => {
      let capturedMessages: any[] = [];
      const mockInvoke = vi.fn().mockImplementation(async (msgs: any) => {
        capturedMessages = msgs;
        return {
          content: JSON.stringify({
            shouldFollowUp: true,
            urgency: 'MEDIUM',
            recommendedAction: 'SEND_EMAIL',
            reasoning: 'Test',
            confidence: 0.8,
            suggestedTiming: {
              optimalDay: 'TUESDAY',
              optimalTimeSlot: 'MORNING',
              reasonForTiming: 'Test',
            },
            nextSteps: [],
            riskFactors: [],
            opportunitySignals: [],
          }),
        };
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput();
      const task = createFollowupTask(input);
      await agent.execute(task);

      const systemMsg = capturedMessages[0]?.content || '';
      expect(systemMsg).toContain('Follow-up Strategy Specialist');
      expect(systemMsg).toContain('Sales Follow-up and Engagement Expert');
      expect(systemMsg).toContain('senior sales strategist');
    });
  });

  describe('createFollowupTask', () => {
    it('should create task without context', () => {
      const input = makeInput();
      const task = createFollowupTask(input);

      expect(task.id).toMatch(/^followup-lead-123-\d+$/);
      expect(task.description).toContain('John Doe');
      expect(task.context).toBeUndefined();
    });

    it('should include context when provided', () => {
      const input = makeInput();
      const task = createFollowupTask(input, {
        userId: 'user-abc',
        sessionId: 'session-xyz',
      });

      expect(task.context?.userId).toBe('user-abc');
      expect(task.context?.sessionId).toBe('session-xyz');
    });

    it('should include expectedOutput schema', () => {
      const input = makeInput();
      const task = createFollowupTask(input);
      expect(task.expectedOutput).toBeDefined();
    });
  });

  describe('Global instance', () => {
    it('should export a global followupAgent instance', () => {
      expect(followupAgent).toBeInstanceOf(FollowupAgent);
      expect(followupAgent.getStats().name).toBe('Follow-up Strategy Specialist');
    });
  });

  describe('Custom config override', () => {
    it('should allow overriding agent config', () => {
      const customAgent = new FollowupAgent({
        maxIterations: 7,
        verbose: false,
      });

      const stats = customAgent.getStats();
      expect(stats.config.maxIterations).toBe(7);
      expect(stats.config.verbose).toBe(false);
      expect(stats.name).toBe('Follow-up Strategy Specialist');
    });
  });

  describe('Multiple review conditions combined', () => {
    it('should handle output with suggestedTiming and nextSteps from LLM', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldFollowUp: false,
          urgency: 'DEFER',
          recommendedAction: 'CLOSE_AS_LOST',
          reasoning: 'Lead has gone cold and shown no engagement for 60 days',
          confidence: 0.75,
          suggestedTiming: {
            optimalDay: 'FRIDAY',
            optimalTimeSlot: 'LATE_AFTERNOON',
            reasonForTiming: 'End of week review time',
          },
          nextSteps: [
            { action: 'Archive lead record', deadline: 'This week', owner: 'Sales Ops' },
            { action: 'Add to re-engagement nurture', deadline: 'Next month', owner: 'Marketing' },
          ],
          riskFactors: ['Lead completely disengaged', 'No response to 5 attempts'],
          opportunitySignals: [],
        }),
      });
      (agent as any).model = { invoke: mockInvoke };

      const input = makeInput({
        currentStatus: 'LOST',
        qualificationLevel: 'UNQUALIFIED',
        leadScore: 10,
        daysSinceLastContact: 60,
        leadCompany: 'DeadCo',
        interactionHistory: [
          { type: 'EMAIL_SENT', timestamp: '2025-10-01', description: 'Outreach' },
        ],
      });
      const task = createFollowupTask(input);
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output!.shouldFollowUp).toBe(false);
      expect(result.output!.recommendedAction).toBe('CLOSE_AS_LOST');
      expect(result.output!.nextSteps).toHaveLength(2);
    });
  });
});
