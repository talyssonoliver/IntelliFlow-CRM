/**
 * AI Output Validators Tests
 *
 * Tests the Zod validation schemas for AI agent inputs and outputs.
 * Covers qualification, email writer, follow-up, churn risk,
 * next best action, and AI insights summary schemas.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  prioritySchema,
  confidenceSchema,
  qualificationLevelSchema,
  followupUrgencySchema,
  recommendedActionSchema,
  optimalDaySchema,
  optimalTimeSlotSchema,
  communicationToneSchema,
  emailPurposeSchema,
  emailWriterPurposeSchema,
  agentUrgencySchema,
  emailLengthSchema,
  leadFollowupStatusSchema,
  interactionTypeSchema,
  qualificationOutputSchema,
  emailWriterOutputSchema,
  followupOutputSchema,
  qualificationInputSchema,
  emailWriterInputSchema,
  followupInputSchema,
  churnRiskLevelSchema,
  riskFactorImpactSchema,
  dataQualityLevelSchema,
  riskFactorSchema,
  churnRiskOutputSchema,
  churnRiskInputSchema,
  nbaActionTypeSchema,
  nbaPrioritySchema,
  nbaRecommendationSchema,
  nextBestActionOutputSchema,
  aiInsightsSummarySchema,
} from '../ai';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('AI Validators', () => {
  // ==========================================================================
  // Shared / Enum Schemas
  // ==========================================================================

  describe('prioritySchema', () => {
    it('should accept all valid AI priority values', () => {
      const valid = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      valid.forEach((v) => {
        const result = prioritySchema.safeParse(v);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority value', () => {
      const result = prioritySchema.safeParse('CRITICAL');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = prioritySchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(prioritySchema.safeParse(1).success).toBe(false);
      expect(prioritySchema.safeParse(null).success).toBe(false);
    });
  });

  describe('confidenceSchema', () => {
    it('should accept 0', () => {
      const result = confidenceSchema.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('should accept 1', () => {
      const result = confidenceSchema.safeParse(1);
      expect(result.success).toBe(true);
    });

    it('should accept 0.5', () => {
      const result = confidenceSchema.safeParse(0.5);
      expect(result.success).toBe(true);
    });

    it('should reject values above 1', () => {
      const result = confidenceSchema.safeParse(1.01);
      expect(result.success).toBe(false);
    });

    it('should reject negative values', () => {
      const result = confidenceSchema.safeParse(-0.1);
      expect(result.success).toBe(false);
    });

    it('should reject non-number types', () => {
      expect(confidenceSchema.safeParse('0.5').success).toBe(false);
    });
  });

  describe('qualificationLevelSchema', () => {
    it('should accept all valid levels', () => {
      ['HIGH', 'MEDIUM', 'LOW', 'UNQUALIFIED'].forEach((v) => {
        expect(qualificationLevelSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid level', () => {
      expect(qualificationLevelSchema.safeParse('VERY_HIGH').success).toBe(false);
    });
  });

  describe('followupUrgencySchema', () => {
    it('should accept all valid urgencies', () => {
      ['IMMEDIATE', 'HIGH', 'MEDIUM', 'LOW', 'DEFER'].forEach((v) => {
        expect(followupUrgencySchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid urgency', () => {
      expect(followupUrgencySchema.safeParse('URGENT').success).toBe(false);
    });
  });

  describe('recommendedActionSchema', () => {
    it('should accept all valid actions', () => {
      const actions = [
        'SEND_EMAIL',
        'PHONE_CALL',
        'SCHEDULE_MEETING',
        'SEND_PROPOSAL',
        'WAIT',
        'NURTURE_CAMPAIGN',
        'CLOSE_AS_LOST',
        'ESCALATE_TO_MANAGER',
      ];
      actions.forEach((v) => {
        expect(recommendedActionSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid action', () => {
      expect(recommendedActionSchema.safeParse('DO_NOTHING').success).toBe(false);
    });
  });

  describe('optimalDaySchema', () => {
    it('should accept weekdays', () => {
      ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].forEach((v) => {
        expect(optimalDaySchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject weekend days', () => {
      expect(optimalDaySchema.safeParse('SATURDAY').success).toBe(false);
      expect(optimalDaySchema.safeParse('SUNDAY').success).toBe(false);
    });
  });

  describe('optimalTimeSlotSchema', () => {
    it('should accept all valid time slots', () => {
      ['MORNING', 'LATE_MORNING', 'AFTERNOON', 'LATE_AFTERNOON'].forEach((v) => {
        expect(optimalTimeSlotSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid time slot', () => {
      expect(optimalTimeSlotSchema.safeParse('EVENING').success).toBe(false);
    });
  });

  describe('communicationToneSchema', () => {
    it('should accept all valid tones', () => {
      ['FORMAL', 'PROFESSIONAL', 'FRIENDLY', 'CASUAL'].forEach((v) => {
        expect(communicationToneSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid tone', () => {
      expect(communicationToneSchema.safeParse('AGGRESSIVE').success).toBe(false);
    });
  });

  describe('emailPurposeSchema', () => {
    it('should accept all valid purposes', () => {
      const purposes = [
        'INTRODUCTION',
        'FOLLOW_UP',
        'MEETING_REQUEST',
        'PROPOSAL',
        'CHECK_IN',
        'RE_ENGAGEMENT',
        'THANK_YOU',
      ];
      purposes.forEach((v) => {
        expect(emailPurposeSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid purpose', () => {
      expect(emailPurposeSchema.safeParse('COLD_CALL').success).toBe(false);
    });
  });

  describe('emailWriterPurposeSchema', () => {
    it('should accept INITIAL_OUTREACH', () => {
      expect(emailWriterPurposeSchema.safeParse('INITIAL_OUTREACH').success).toBe(true);
    });

    it('should reject CHECK_IN (only in emailPurposeSchema)', () => {
      expect(emailWriterPurposeSchema.safeParse('CHECK_IN').success).toBe(false);
    });
  });

  describe('agentUrgencySchema', () => {
    it('should accept HIGH, MEDIUM, LOW', () => {
      ['HIGH', 'MEDIUM', 'LOW'].forEach((v) => {
        expect(agentUrgencySchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject URGENT (not in agent urgencies)', () => {
      expect(agentUrgencySchema.safeParse('URGENT').success).toBe(false);
    });
  });

  describe('emailLengthSchema', () => {
    it('should accept SHORT, MEDIUM, LONG', () => {
      ['SHORT', 'MEDIUM', 'LONG'].forEach((v) => {
        expect(emailLengthSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid length', () => {
      expect(emailLengthSchema.safeParse('EXTRA_LONG').success).toBe(false);
    });
  });

  describe('leadFollowupStatusSchema', () => {
    it('should accept all valid statuses', () => {
      ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'].forEach(
        (v) => {
          expect(leadFollowupStatusSchema.safeParse(v).success).toBe(true);
        }
      );
    });

    it('should reject invalid status', () => {
      expect(leadFollowupStatusSchema.safeParse('ARCHIVED').success).toBe(false);
    });
  });

  describe('interactionTypeSchema', () => {
    it('should accept all valid types', () => {
      ['EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'CALL', 'MEETING', 'FORM_SUBMISSION'].forEach(
        (v) => {
          expect(interactionTypeSchema.safeParse(v).success).toBe(true);
        }
      );
    });

    it('should reject invalid type', () => {
      expect(interactionTypeSchema.safeParse('SMS').success).toBe(false);
    });
  });

  // ==========================================================================
  // Qualification Output
  // ==========================================================================

  describe('qualificationOutputSchema', () => {
    const validOutput = {
      qualified: true,
      qualificationLevel: 'HIGH' as const,
      confidence: 0.92,
      reasoning: 'Lead matches ICP based on company size and industry.',
      strengths: ['Enterprise client', 'High budget'],
      concerns: ['Long decision cycle'],
      recommendedActions: [
        { action: 'Schedule demo', priority: 'HIGH' as const, reasoning: 'Strike while hot' },
      ],
      nextSteps: ['Send product deck', 'Schedule follow-up call'],
      estimatedConversionProbability: 0.78,
    };

    it('should accept valid qualification output', () => {
      const result = qualificationOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.qualified).toBe(true);
        expect(result.data.qualificationLevel).toBe('HIGH');
        expect(result.data.confidence).toBe(0.92);
      }
    });

    it('should accept empty arrays for strengths, concerns, nextSteps', () => {
      const output = {
        ...validOutput,
        strengths: [],
        concerns: [],
        recommendedActions: [],
        nextSteps: [],
      };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject confidence above 1', () => {
      const output = { ...validOutput, confidence: 1.5 };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject estimatedConversionProbability above 1', () => {
      const output = { ...validOutput, estimatedConversionProbability: 1.1 };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject estimatedConversionProbability below 0', () => {
      const output = { ...validOutput, estimatedConversionProbability: -0.1 };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject invalid qualificationLevel', () => {
      const output = { ...validOutput, qualificationLevel: 'EXCELLENT' };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject recommendedAction with invalid priority', () => {
      const output = {
        ...validOutput,
        recommendedActions: [{ action: 'Call', priority: 'URGENT', reasoning: 'reason' }],
      };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = qualificationOutputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept boundary conversion probability of 0', () => {
      const output = { ...validOutput, estimatedConversionProbability: 0 };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept boundary conversion probability of 1', () => {
      const output = { ...validOutput, estimatedConversionProbability: 1 };
      const result = qualificationOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Email Writer Output
  // ==========================================================================

  describe('emailWriterOutputSchema', () => {
    const validOutput = {
      subject: 'Partnership Opportunity with IntelliFlow',
      body: 'Dear Sarah,\n\nI hope this email finds you well...',
      callToAction: 'Would you be available for a 15-minute call next week?',
      confidence: 0.88,
      reasoning: 'Personalized based on recent LinkedIn activity.',
      alternativeSubjects: ['Quick question about your CRM needs'],
      personalizationElements: ['Recent company expansion', 'Industry expertise'],
      requiresHumanReview: false,
    };

    it('should accept valid email writer output', () => {
      const result = emailWriterOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Partnership Opportunity with IntelliFlow');
        expect(result.data.requiresHumanReview).toBe(false);
      }
    });

    it('should accept with optional suggestedSendTime', () => {
      const output = { ...validOutput, suggestedSendTime: '2026-02-10T09:00:00Z' };
      const result = emailWriterOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept with optional reviewReasons', () => {
      const output = {
        ...validOutput,
        requiresHumanReview: true,
        reviewReasons: ['Low confidence', 'Sensitive topic'],
      };
      const result = emailWriterOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept empty alternativeSubjects and personalizationElements', () => {
      const output = {
        ...validOutput,
        alternativeSubjects: [],
        personalizationElements: [],
      };
      const result = emailWriterOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject confidence below 0', () => {
      const output = { ...validOutput, confidence: -0.5 };
      const result = emailWriterOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = emailWriterOutputSchema.safeParse({ subject: 'Test' });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Follow-up Output
  // ==========================================================================

  describe('followupOutputSchema', () => {
    const validOutput = {
      shouldFollowUp: true,
      urgency: 'HIGH' as const,
      recommendedAction: 'PHONE_CALL' as const,
      reasoning: 'Lead has been inactive for 7 days after demo.',
      confidence: 0.85,
      suggestedTiming: {
        optimalDay: 'TUESDAY' as const,
        optimalTimeSlot: 'MORNING' as const,
        reasonForTiming: 'Historically higher response rates on Tuesday mornings.',
      },
      nextSteps: [{ action: 'Call lead', deadline: '2026-02-10', owner: 'Sales Rep' }],
      riskFactors: ['Competitor evaluation in progress'],
      opportunitySignals: ['Expanded team size recently'],
    };

    it('should accept valid follow-up output', () => {
      const result = followupOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shouldFollowUp).toBe(true);
        expect(result.data.urgency).toBe('HIGH');
        expect(result.data.recommendedAction).toBe('PHONE_CALL');
      }
    });

    it('should accept with optional emailSuggestions', () => {
      const output = {
        ...validOutput,
        emailSuggestions: {
          subject: 'Following up on our demo',
          keyPoints: ['Recap demo highlights', 'Address concerns'],
          tone: 'PROFESSIONAL' as const,
        },
      };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept with optional callScript', () => {
      const output = {
        ...validOutput,
        callScript: {
          opening: 'Hi, this is Alex from IntelliFlow.',
          keyQuestions: ['How did the demo go?', 'Any questions?'],
          objectionsToAnticipate: ['Budget constraints', 'Timeline'],
          closingStatement: 'Shall we schedule a follow-up meeting?',
        },
      };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject invalid urgency', () => {
      const output = { ...validOutput, urgency: 'VERY_HIGH' };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject invalid recommendedAction', () => {
      const output = { ...validOutput, recommendedAction: 'TEXT_MESSAGE' };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject invalid optimalDay', () => {
      const output = {
        ...validOutput,
        suggestedTiming: { ...validOutput.suggestedTiming, optimalDay: 'SATURDAY' },
      };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject missing suggestedTiming', () => {
      const { suggestedTiming, ...withoutTiming } = validOutput;
      const result = followupOutputSchema.safeParse(withoutTiming);
      expect(result.success).toBe(false);
    });

    it('should accept empty riskFactors and opportunitySignals', () => {
      const output = { ...validOutput, riskFactors: [], opportunitySignals: [] };
      const result = followupOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Qualification Input
  // ==========================================================================

  describe('qualificationInputSchema', () => {
    const validInput = {
      leadId: VALID_UUID,
      email: 'sarah@techcorp.com',
    };

    it('should accept minimal valid input', () => {
      const result = qualificationInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.leadId).toBe(VALID_UUID);
        expect(result.data.email).toBe('sarah@techcorp.com');
      }
    });

    it('should accept input with all optional fields', () => {
      const input = {
        ...validInput,
        firstName: 'Sarah',
        lastName: 'Johnson',
        company: 'TechCorp',
        title: 'VP of Sales',
        phone: '+44 20 7946 0958',
        industry: 'Technology',
        companySize: '500-1000',
        website: 'https://techcorp.com',
        source: 'Website',
        notes: 'Interested in enterprise plan.',
        interactionHistory: [
          { type: 'MEETING', date: '2026-01-15', description: 'Initial demo call' },
        ],
      };
      const result = qualificationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID for leadId', () => {
      const input = { ...validInput, leadId: 'not-a-uuid' };
      const result = qualificationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const input = { ...validInput, email: 'not-an-email' };
      const result = qualificationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid website URL', () => {
      const input = { ...validInput, website: 'not-a-url' };
      const result = qualificationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing leadId', () => {
      const result = qualificationInputSchema.safeParse({ email: 'test@test.com' });
      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const result = qualificationInputSchema.safeParse({ leadId: VALID_UUID });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Email Writer Input
  // ==========================================================================

  describe('emailWriterInputSchema', () => {
    const validInput = {
      leadId: VALID_UUID,
      recipientName: 'Sarah Johnson',
      recipientEmail: 'sarah@techcorp.com',
      senderName: 'Alex Smith',
      senderCompany: 'IntelliFlow CRM',
      purpose: 'INTRODUCTION' as const,
    };

    it('should accept valid email writer input', () => {
      const result = emailWriterInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recipientName).toBe('Sarah Johnson');
        expect(result.data.purpose).toBe('INTRODUCTION');
      }
    });

    it('should accept with all optional fields', () => {
      const input = {
        ...validInput,
        recipientCompany: 'TechCorp',
        recipientTitle: 'VP of Sales',
        senderTitle: 'Account Executive',
        previousInteractions: [
          { type: 'MEETING', date: '2026-01-10', summary: 'Initial call went well' },
        ],
        keyPoints: ['AI-powered CRM', 'Quick implementation'],
        tone: 'PROFESSIONAL' as const,
        urgency: 'HIGH' as const,
      };
      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid recipientEmail', () => {
      const input = { ...validInput, recipientEmail: 'bad-email' };
      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid purpose', () => {
      const input = { ...validInput, purpose: 'SPAM' };
      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tone', () => {
      const input = { ...validInput, tone: 'AGGRESSIVE' };
      const result = emailWriterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = emailWriterInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Follow-up Input
  // ==========================================================================

  describe('followupInputSchema', () => {
    const validInput = {
      leadId: VALID_UUID,
      leadName: 'Sarah Johnson',
      leadEmail: 'sarah@techcorp.com',
      currentStatus: 'QUALIFIED',
      score: 75,
    };

    it('should accept valid follow-up input', () => {
      const result = followupInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(75);
        expect(result.data.currentStatus).toBe('QUALIFIED');
      }
    });

    it('should accept with all optional fields', () => {
      const input = {
        ...validInput,
        leadCompany: 'TechCorp',
        lastContactDate: '2026-01-20',
        interactionHistory: [
          { type: 'CALL', date: '2026-01-15', outcome: 'Positive', notes: 'Asked for demo' },
        ],
        dealValue: 50000,
        dealStage: 'PROPOSAL',
        assignedTo: 'Alex Smith',
      };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept score at boundary 0', () => {
      const input = { ...validInput, score: 0 };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept score at boundary 100', () => {
      const input = { ...validInput, score: 100 };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject score above 100', () => {
      const input = { ...validInput, score: 101 };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative score', () => {
      const input = { ...validInput, score: -1 };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid leadEmail', () => {
      const input = { ...validInput, leadEmail: 'invalid' };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid leadId', () => {
      const input = { ...validInput, leadId: 'not-uuid' };
      const result = followupInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Churn Risk Schemas
  // ==========================================================================

  describe('churnRiskLevelSchema', () => {
    it('should accept all valid risk levels', () => {
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'].forEach((v) => {
        expect(churnRiskLevelSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid risk level', () => {
      expect(churnRiskLevelSchema.safeParse('NONE').success).toBe(false);
    });
  });

  describe('riskFactorImpactSchema', () => {
    it('should accept HIGH, MEDIUM, LOW', () => {
      ['HIGH', 'MEDIUM', 'LOW'].forEach((v) => {
        expect(riskFactorImpactSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject CRITICAL', () => {
      expect(riskFactorImpactSchema.safeParse('CRITICAL').success).toBe(false);
    });
  });

  describe('dataQualityLevelSchema', () => {
    it('should accept COMPLETE, PARTIAL, MINIMAL', () => {
      ['COMPLETE', 'PARTIAL', 'MINIMAL'].forEach((v) => {
        expect(dataQualityLevelSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid value', () => {
      expect(dataQualityLevelSchema.safeParse('NONE').success).toBe(false);
    });
  });

  describe('riskFactorSchema', () => {
    it('should accept valid risk factor with string value', () => {
      const factor = {
        factor: 'Login frequency decline',
        value: 'decreased by 50%',
        impact: 'HIGH' as const,
        reasoning: 'User engagement dropping significantly.',
      };
      const result = riskFactorSchema.safeParse(factor);
      expect(result.success).toBe(true);
    });

    it('should accept valid risk factor with number value', () => {
      const factor = {
        factor: 'Days since last login',
        value: 30,
        impact: 'MEDIUM' as const,
        reasoning: 'Extended inactivity period.',
      };
      const result = riskFactorSchema.safeParse(factor);
      expect(result.success).toBe(true);
    });

    it('should reject missing fields', () => {
      const result = riskFactorSchema.safeParse({ factor: 'Test' });
      expect(result.success).toBe(false);
    });
  });

  describe('churnRiskOutputSchema', () => {
    const validOutput = {
      riskScore: 0.72,
      riskLevel: 'HIGH' as const,
      confidence: 0.88,
      topRiskFactors: [
        {
          factor: 'Login decline',
          value: 'down 60%',
          impact: 'HIGH' as const,
          reasoning: 'Significant drop',
        },
      ],
      explanation: 'Account shows multiple churn risk indicators.',
      recommendations: ['Schedule retention call', 'Offer training session'],
      primaryAction: 'Schedule urgent retention call with account manager.',
      slaHours: 48,
    };

    it('should accept valid churn risk output without optional metadata', () => {
      const result = churnRiskOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.riskScore).toBe(0.72);
        expect(result.data.riskLevel).toBe('HIGH');
      }
    });

    it('should accept with optional metadata', () => {
      const output = {
        ...validOutput,
        metadata: {
          modelVersion: 'v1.2.0',
          promptVersion: 'churn-v3',
          latencyMs: 350,
          tokenCount: 1200,
          dataQuality: 'COMPLETE' as const,
        },
      };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should accept metadata without optional fields', () => {
      const output = {
        ...validOutput,
        metadata: {
          modelVersion: 'v1.0.0',
          latencyMs: 200,
          dataQuality: 'PARTIAL' as const,
        },
      };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject riskScore above 1', () => {
      const output = { ...validOutput, riskScore: 1.5 };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject riskScore below 0', () => {
      const output = { ...validOutput, riskScore: -0.1 };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject non-positive slaHours', () => {
      const output = { ...validOutput, slaHours: 0 };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject negative slaHours', () => {
      const output = { ...validOutput, slaHours: -24 };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject invalid riskLevel', () => {
      const output = { ...validOutput, riskLevel: 'EXTREME' };
      const result = churnRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  describe('churnRiskInputSchema', () => {
    const validInput = {
      entityType: 'lead' as const,
      entityId: VALID_UUID,
      tenantId: VALID_UUID,
    };

    it('should accept minimal valid input', () => {
      const result = churnRiskInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept all entity types', () => {
      ['lead', 'contact', 'opportunity', 'account'].forEach((t) => {
        const input = { ...validInput, entityType: t };
        expect(churnRiskInputSchema.safeParse(input).success).toBe(true);
      });
    });

    it('should accept with all optional engagement metrics', () => {
      const input = {
        ...validInput,
        daysSinceLastLogin: 14,
        loginFrequency30d: 3,
        sessionDurationAvg: 25.5,
        featureUsageScore: 65,
        emailOpenRate: 0.45,
        usageTrendSlope: -0.3,
        sessionTimeTrend: -0.1,
        supportTickets30d: 5,
        npsScore: 7,
        csatAvg: 3.8,
        accountAgeMonths: 24,
        planTier: 'Professional',
        metadata: { customField: 'value' },
      };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject featureUsageScore above 100', () => {
      const input = { ...validInput, featureUsageScore: 101 };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject featureUsageScore below 0', () => {
      const input = { ...validInput, featureUsageScore: -1 };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject emailOpenRate above 1', () => {
      const input = { ...validInput, emailOpenRate: 1.1 };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject npsScore above 10', () => {
      const input = { ...validInput, npsScore: 11 };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject csatAvg above 5', () => {
      const input = { ...validInput, csatAvg: 5.1 };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid entityType', () => {
      const input = { ...validInput, entityType: 'deal' };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid entityId', () => {
      const input = { ...validInput, entityId: 'bad-id' };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid tenantId', () => {
      const input = { ...validInput, tenantId: 'bad-id' };
      const result = churnRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept boundary values for npsScore (0 and 10)', () => {
      expect(churnRiskInputSchema.safeParse({ ...validInput, npsScore: 0 }).success).toBe(true);
      expect(churnRiskInputSchema.safeParse({ ...validInput, npsScore: 10 }).success).toBe(true);
    });

    it('should accept boundary values for csatAvg (0 and 5)', () => {
      expect(churnRiskInputSchema.safeParse({ ...validInput, csatAvg: 0 }).success).toBe(true);
      expect(churnRiskInputSchema.safeParse({ ...validInput, csatAvg: 5 }).success).toBe(true);
    });
  });

  // ==========================================================================
  // Next Best Action Schemas
  // ==========================================================================

  describe('nbaActionTypeSchema', () => {
    it('should accept all valid action types', () => {
      const types = [
        'CALL',
        'EMAIL',
        'SCHEDULE_MEETING',
        'SEND_PROPOSAL',
        'FOLLOW_UP',
        'ESCALATE',
        'NURTURE',
        'CLOSE_DEAL',
        'RE_ENGAGE',
        'PROVIDE_DEMO',
        'SEND_CONTENT',
        'RESEARCH',
        'WAIT',
      ];
      types.forEach((v) => {
        expect(nbaActionTypeSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid action type', () => {
      expect(nbaActionTypeSchema.safeParse('PHONE').success).toBe(false);
    });
  });

  describe('nbaPrioritySchema', () => {
    it('should accept all valid priorities', () => {
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach((v) => {
        expect(nbaPrioritySchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject URGENT (not in NBA priorities)', () => {
      expect(nbaPrioritySchema.safeParse('URGENT').success).toBe(false);
    });
  });

  describe('nbaRecommendationSchema', () => {
    const validRec = {
      action: 'EMAIL' as const,
      priority: 'HIGH' as const,
      title: 'Send follow-up email',
      description: 'Reach out with a personalized follow-up.',
      rationale: 'Lead has not responded in 5 days.',
      confidence: 0.9,
    };

    it('should accept valid recommendation', () => {
      const result = nbaRecommendationSchema.safeParse(validRec);
      expect(result.success).toBe(true);
    });

    it('should accept with optional deadline and successProbability', () => {
      const rec = {
        ...validRec,
        deadline: '2026-02-15T10:00:00Z',
        successProbability: 0.65,
      };
      const result = nbaRecommendationSchema.safeParse(rec);
      expect(result.success).toBe(true);
    });

    it('should reject successProbability above 1', () => {
      const rec = { ...validRec, successProbability: 1.5 };
      const result = nbaRecommendationSchema.safeParse(rec);
      expect(result.success).toBe(false);
    });

    it('should reject invalid deadline format (not datetime)', () => {
      const rec = { ...validRec, deadline: 'next week' };
      const result = nbaRecommendationSchema.safeParse(rec);
      expect(result.success).toBe(false);
    });
  });

  describe('nextBestActionOutputSchema', () => {
    const validOutput = {
      entitySummary: 'High-value enterprise lead in technology sector.',
      currentState: 'Demo completed, awaiting proposal.',
      recommendations: [
        {
          action: 'SEND_PROPOSAL' as const,
          priority: 'HIGH' as const,
          title: 'Send customized proposal',
          description: 'Prepare and send a tailored proposal.',
          rationale: 'Demo went well. Strike while interest is high.',
          confidence: 0.92,
        },
      ],
      confidence: 0.88,
      analysisTimestamp: '2026-02-05T14:30:00Z',
      modelVersion: 'nba-v2.1.0',
    };

    it('should accept valid next best action output', () => {
      const result = nextBestActionOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entitySummary).toContain('enterprise lead');
        expect(result.data.recommendations).toHaveLength(1);
        expect(result.data.modelVersion).toBe('nba-v2.1.0');
      }
    });

    it('should accept empty recommendations array', () => {
      const output = { ...validOutput, recommendations: [] };
      const result = nextBestActionOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject invalid analysisTimestamp', () => {
      const output = { ...validOutput, analysisTimestamp: 'yesterday' };
      const result = nextBestActionOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const output = { ...validOutput, confidence: 1.1 };
      const result = nextBestActionOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject missing modelVersion', () => {
      const { modelVersion, ...withoutVersion } = validOutput;
      const result = nextBestActionOutputSchema.safeParse(withoutVersion);
      expect(result.success).toBe(false);
    });

    it('should reject missing analysisTimestamp', () => {
      const { analysisTimestamp, ...withoutTimestamp } = validOutput;
      const result = nextBestActionOutputSchema.safeParse(withoutTimestamp);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // AI Insights Summary
  // ==========================================================================

  describe('aiInsightsSummarySchema', () => {
    const validSummary = {
      churnRisk: {
        score: 35,
        level: 'LOW' as const,
      },
      nextBestAction: {
        action: 'FOLLOW_UP' as const,
        title: 'Schedule a check-in call',
        priority: 'MEDIUM' as const,
      },
      recommendations: ['Send monthly newsletter', 'Invite to webinar'],
      confidence: 0.82,
      lastUpdatedAt: '2026-02-05T12:00:00Z',
    };

    it('should accept valid insights summary', () => {
      const result = aiInsightsSummarySchema.safeParse(validSummary);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.churnRisk.score).toBe(35);
        expect(result.data.churnRisk.level).toBe('LOW');
      }
    });

    it('should accept with all optional fields', () => {
      const summary = {
        ...validSummary,
        churnRisk: {
          ...validSummary.churnRisk,
          trend: 'IMPROVING' as const,
          lastAssessedAt: '2026-02-04T10:00:00Z',
        },
        nextBestAction: {
          ...validSummary.nextBestAction,
          deadline: '2026-02-10',
        },
        conversionProbability: 72,
        lifetimeValue: 15000,
        sentiment: 'POSITIVE' as const,
        engagementScore: 85,
      };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('should accept all valid sentiment values', () => {
      const sentiments = ['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE'];
      sentiments.forEach((s) => {
        const summary = { ...validSummary, sentiment: s };
        expect(aiInsightsSummarySchema.safeParse(summary).success).toBe(true);
      });
    });

    it('should accept all valid trend values', () => {
      ['IMPROVING', 'STABLE', 'DECLINING'].forEach((t) => {
        const summary = {
          ...validSummary,
          churnRisk: { ...validSummary.churnRisk, trend: t },
        };
        expect(aiInsightsSummarySchema.safeParse(summary).success).toBe(true);
      });
    });

    it('should reject churnRisk score above 100', () => {
      const summary = {
        ...validSummary,
        churnRisk: { ...validSummary.churnRisk, score: 101 },
      };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject churnRisk score below 0', () => {
      const summary = {
        ...validSummary,
        churnRisk: { ...validSummary.churnRisk, score: -1 },
      };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject invalid churnRisk level', () => {
      const summary = {
        ...validSummary,
        churnRisk: { ...validSummary.churnRisk, level: 'EXTREME' },
      };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject invalid lastUpdatedAt format', () => {
      const summary = { ...validSummary, lastUpdatedAt: 'today' };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject engagementScore above 100', () => {
      const summary = { ...validSummary, engagementScore: 101 };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject conversionProbability above 100', () => {
      const summary = { ...validSummary, conversionProbability: 101 };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('should reject missing required recommendations array', () => {
      const { recommendations, ...withoutRecs } = validSummary;
      const result = aiInsightsSummarySchema.safeParse(withoutRecs);
      expect(result.success).toBe(false);
    });

    it('should accept empty recommendations array', () => {
      const summary = { ...validSummary, recommendations: [] };
      const result = aiInsightsSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('should reject missing churnRisk', () => {
      const { churnRisk, ...withoutChurn } = validSummary;
      const result = aiInsightsSummarySchema.safeParse(withoutChurn);
      expect(result.success).toBe(false);
    });

    it('should reject missing nextBestAction', () => {
      const { nextBestAction, ...withoutNBA } = validSummary;
      const result = aiInsightsSummarySchema.safeParse(withoutNBA);
      expect(result.success).toBe(false);
    });
  });
});
