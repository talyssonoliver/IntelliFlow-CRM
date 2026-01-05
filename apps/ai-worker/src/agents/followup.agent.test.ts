/**
 * Follow-up Agent Tests
 *
 * Task: IFC-021 - PHASE-011: CrewAI Agent Framework
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FollowupAgent,
  FollowupInput,
  FollowupOutput,
  followupInputSchema,
  followupOutputSchema,
  createFollowupTask,
} from './followup.agent';

// Mock the LangChain ChatOpenAI
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    invoke = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        shouldFollowUp: true,
        urgency: 'HIGH',
        recommendedAction: 'PHONE_CALL',
        reasoning: 'Lead has shown strong engagement and is at qualified stage.',
        confidence: 0.82,
        suggestedTiming: {
          optimalDay: 'TUESDAY',
          optimalTimeSlot: 'MORNING',
          reasonForTiming: 'B2B leads are most responsive Tuesday-Thursday mornings.',
        },
        emailSuggestions: {
          subject: 'Quick follow-up on our conversation',
          keyPoints: ['Recap value proposition', 'Address timeline concerns'],
          tone: 'PROFESSIONAL',
        },
        callScript: {
          opening: 'Hi [Name], this is [Your Name] from IntelliFlow.',
          keyQuestions: ['What is your timeline for implementation?', 'Who else is involved in the decision?'],
          objectionsToAnticipate: ['Budget concerns', 'Current vendor relationship'],
          closingStatement: 'Would you be available for a 30-minute demo next week?',
        },
        nextSteps: [
          {
            action: 'Call lead at optimal time',
            deadline: 'Tuesday 10:00 AM',
            owner: 'Sales Rep',
          },
          {
            action: 'Send follow-up email if no answer',
            deadline: 'Tuesday 2:00 PM',
            owner: 'Sales Rep',
          },
        ],
        riskFactors: ['Long sales cycle', 'Multiple stakeholders'],
        opportunitySignals: ['Strong engagement', 'High lead score', 'Urgent timeline'],
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

describe('FollowupAgent', () => {
  let agent: FollowupAgent;

  beforeEach(() => {
    agent = new FollowupAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Configuration', () => {
    it('should have correct agent configuration', () => {
      const stats = agent.getStats();

      expect(stats.name).toBe('Follow-up Strategy Specialist');
      expect(stats.role).toBe('Sales Follow-up and Engagement Expert');
      expect(stats.config.maxIterations).toBe(3);
      expect(stats.config.allowDelegation).toBe(false);
    });
  });

  describe('Input Schema Validation', () => {
    it('should validate valid input', () => {
      const validInput: FollowupInput = {
        leadId: 'lead-123',
        leadEmail: 'john@example.com',
        leadName: 'John Doe',
        leadCompany: 'Example Corp',
        leadTitle: 'CTO',
        currentStatus: 'QUALIFIED',
        qualificationLevel: 'HIGH',
        leadScore: 85,
        interactionHistory: [
          {
            type: 'EMAIL_SENT',
            timestamp: '2025-12-01T10:00:00Z',
            description: 'Initial outreach email',
            outcome: 'Opened',
          },
        ],
        daysSinceLastContact: 3,
        assignedSalesRep: 'Jane Smith',
        dealValue: 50000,
        targetCloseDate: '2026-02-28',
      };

      const result = followupInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidInput = {
        leadId: 'lead-123',
        leadEmail: 'not-an-email',
        leadName: 'John Doe',
        currentStatus: 'QUALIFIED',
        qualificationLevel: 'HIGH',
        leadScore: 85,
        interactionHistory: [],
        daysSinceLastContact: 3,
      };

      const result = followupInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject lead score outside valid range', () => {
      const invalidInput = {
        leadId: 'lead-123',
        leadEmail: 'john@example.com',
        leadName: 'John Doe',
        currentStatus: 'QUALIFIED',
        qualificationLevel: 'HIGH',
        leadScore: 150, // Invalid: > 100
        interactionHistory: [],
        daysSinceLastContact: 3,
      };

      const result = followupInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('Output Schema Validation', () => {
    it('should validate complete output', () => {
      const validOutput: FollowupOutput = {
        shouldFollowUp: true,
        urgency: 'HIGH',
        recommendedAction: 'PHONE_CALL',
        reasoning: 'Strong engagement pattern',
        confidence: 0.85,
        suggestedTiming: {
          optimalDay: 'TUESDAY',
          optimalTimeSlot: 'MORNING',
          reasonForTiming: 'Best time for B2B outreach',
        },
        emailSuggestions: {
          subject: 'Following up',
          keyPoints: ['Point 1', 'Point 2'],
          tone: 'PROFESSIONAL',
        },
        callScript: {
          opening: 'Hi, this is...',
          keyQuestions: ['Question 1'],
          objectionsToAnticipate: ['Objection 1'],
          closingStatement: 'Shall we schedule...',
        },
        nextSteps: [
          {
            action: 'Call lead',
            deadline: 'Tomorrow',
            owner: 'Sales Rep',
          },
        ],
        riskFactors: ['Risk 1'],
        opportunitySignals: ['Signal 1'],
      };

      const result = followupOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid urgency level', () => {
      const invalidOutput = {
        shouldFollowUp: true,
        urgency: 'INVALID_URGENCY',
        recommendedAction: 'PHONE_CALL',
        reasoning: 'Reason',
        confidence: 0.85,
        suggestedTiming: {
          optimalDay: 'TUESDAY',
          optimalTimeSlot: 'MORNING',
          reasonForTiming: 'Reason',
        },
        nextSteps: [],
        riskFactors: [],
        opportunitySignals: [],
      };

      const result = followupOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('Task Creation', () => {
    it('should create task with correct structure', () => {
      const input: FollowupInput = {
        leadId: 'lead-123',
        leadEmail: 'john@example.com',
        leadName: 'John Doe',
        currentStatus: 'CONTACTED',
        qualificationLevel: 'MEDIUM',
        leadScore: 65,
        interactionHistory: [],
        daysSinceLastContact: 7,
      };

      const task = createFollowupTask(input, {
        userId: 'user-123',
        sessionId: 'session-456',
      });

      expect(task.id).toMatch(/^followup-lead-123-\d+$/);
      expect(task.description).toContain('John Doe');
      expect(task.input).toEqual(input);
      expect(task.context?.userId).toBe('user-123');
    });
  });

  describe('Lead Statuses', () => {
    const statuses = [
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'PROPOSAL_SENT',
      'NEGOTIATION',
      'WON',
      'LOST',
    ] as const;

    statuses.forEach((status) => {
      it(`should accept ${status} as valid lead status`, () => {
        const input: FollowupInput = {
          leadId: 'lead-123',
          leadEmail: 'test@example.com',
          leadName: 'Test User',
          currentStatus: status,
          qualificationLevel: 'MEDIUM',
          leadScore: 50,
          interactionHistory: [],
          daysSinceLastContact: 5,
        };

        const result = followupInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Recommended Actions', () => {
    const actions = [
      'SEND_EMAIL',
      'PHONE_CALL',
      'SCHEDULE_MEETING',
      'SEND_PROPOSAL',
      'WAIT',
      'NURTURE_CAMPAIGN',
      'CLOSE_AS_LOST',
      'ESCALATE_TO_MANAGER',
    ] as const;

    actions.forEach((action) => {
      it(`should accept ${action} as valid recommended action`, () => {
        const output = {
          shouldFollowUp: true,
          urgency: 'MEDIUM' as const,
          recommendedAction: action,
          reasoning: 'Test reasoning',
          confidence: 0.75,
          suggestedTiming: {
            optimalDay: 'WEDNESDAY' as const,
            optimalTimeSlot: 'AFTERNOON' as const,
            reasonForTiming: 'Test reason',
          },
          nextSteps: [],
          riskFactors: [],
          opportunitySignals: [],
        };

        const result = followupOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Interaction History', () => {
    it('should validate various interaction types', () => {
      const interactionTypes = [
        'EMAIL_SENT',
        'EMAIL_OPENED',
        'EMAIL_CLICKED',
        'CALL',
        'MEETING',
        'FORM_SUBMISSION',
      ] as const;

      const input: FollowupInput = {
        leadId: 'lead-123',
        leadEmail: 'john@example.com',
        leadName: 'John Doe',
        currentStatus: 'QUALIFIED',
        qualificationLevel: 'HIGH',
        leadScore: 80,
        interactionHistory: interactionTypes.map((type, i) => ({
          type,
          timestamp: new Date(Date.now() - i * 86400000).toISOString(),
          description: `Test ${type} interaction`,
          outcome: 'Positive',
        })),
        daysSinceLastContact: 1,
      };

      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should handle empty interaction history', () => {
      const input: FollowupInput = {
        leadId: 'lead-123',
        leadEmail: 'john@example.com',
        leadName: 'John Doe',
        currentStatus: 'NEW',
        qualificationLevel: 'UNQUALIFIED',
        leadScore: 20,
        interactionHistory: [],
        daysSinceLastContact: 0,
      };

      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Urgency Levels', () => {
    const urgencies = ['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW', 'DEFER'] as const;

    urgencies.forEach((urgency) => {
      it(`should accept ${urgency} as valid urgency level`, () => {
        const output = {
          shouldFollowUp: true,
          urgency,
          recommendedAction: 'SEND_EMAIL' as const,
          reasoning: 'Test',
          confidence: 0.7,
          suggestedTiming: {
            optimalDay: 'MONDAY' as const,
            optimalTimeSlot: 'MORNING' as const,
            reasonForTiming: 'Test',
          },
          nextSteps: [],
          riskFactors: [],
          opportunitySignals: [],
        };

        const result = followupOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Timing Suggestions', () => {
    it('should validate all day options', () => {
      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

      days.forEach((day) => {
        const output = {
          shouldFollowUp: true,
          urgency: 'MEDIUM' as const,
          recommendedAction: 'SEND_EMAIL' as const,
          reasoning: 'Test',
          confidence: 0.7,
          suggestedTiming: {
            optimalDay: day,
            optimalTimeSlot: 'MORNING' as const,
            reasonForTiming: 'Test',
          },
          nextSteps: [],
          riskFactors: [],
          opportunitySignals: [],
        };

        const result = followupOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all time slot options', () => {
      const timeSlots = ['MORNING', 'LATE_MORNING', 'AFTERNOON', 'LATE_AFTERNOON'] as const;

      timeSlots.forEach((slot) => {
        const output = {
          shouldFollowUp: true,
          urgency: 'MEDIUM' as const,
          recommendedAction: 'SEND_EMAIL' as const,
          reasoning: 'Test',
          confidence: 0.7,
          suggestedTiming: {
            optimalDay: 'TUESDAY' as const,
            optimalTimeSlot: slot,
            reasonForTiming: 'Test',
          },
          nextSteps: [],
          riskFactors: [],
          opportunitySignals: [],
        };

        const result = followupOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      });
    });
  });
});
