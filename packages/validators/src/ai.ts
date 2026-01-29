/**
 * AI Output Schemas
 *
 * Centralized Zod schemas for all AI agent outputs.
 * These ensure type-safe, validated responses from AI systems.
 * All enums derive from @intelliflow/domain constants (single source of truth).
 *
 * @module @intelliflow/validators/ai-outputs
 */

import { z } from 'zod';
import {
  AI_PRIORITIES,
  QUALIFICATION_LEVELS,
  FOLLOWUP_URGENCIES,
  RECOMMENDED_ACTIONS,
  OPTIMAL_DAYS,
  OPTIMAL_TIME_SLOTS,
  COMMUNICATION_TONES,
  EMAIL_PURPOSES,
  EMAIL_WRITER_PURPOSES,
  AGENT_URGENCIES,
  EMAIL_LENGTHS,
  LEAD_FOLLOWUP_STATUSES,
  INTERACTION_TYPES,
} from '@intelliflow/domain';

// ============================================================================
// Shared Schemas - derived from domain constants
// ============================================================================

/**
 * Priority schema used across multiple AI outputs
 */
export const prioritySchema = z.enum(AI_PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

/**
 * Confidence score schema - all AI outputs must include confidence in [0, 1]
 */
export const confidenceSchema = z.number().min(0).max(1);

/**
 * Qualification level schema
 */
export const qualificationLevelSchema = z.enum(QUALIFICATION_LEVELS);
export type QualificationLevel = z.infer<typeof qualificationLevelSchema>;

/**
 * Follow-up urgency schema
 */
export const followupUrgencySchema = z.enum(FOLLOWUP_URGENCIES);
export type FollowupUrgency = z.infer<typeof followupUrgencySchema>;

/**
 * Recommended action schema
 */
export const recommendedActionSchema = z.enum(RECOMMENDED_ACTIONS);
export type RecommendedAction = z.infer<typeof recommendedActionSchema>;

/**
 * Optimal day schema
 */
export const optimalDaySchema = z.enum(OPTIMAL_DAYS);
export type OptimalDay = z.infer<typeof optimalDaySchema>;

/**
 * Optimal time slot schema
 */
export const optimalTimeSlotSchema = z.enum(OPTIMAL_TIME_SLOTS);
export type OptimalTimeSlot = z.infer<typeof optimalTimeSlotSchema>;

/**
 * Communication tone schema
 */
export const communicationToneSchema = z.enum(COMMUNICATION_TONES);
export type CommunicationTone = z.infer<typeof communicationToneSchema>;

/**
 * Email purpose schema
 */
export const emailPurposeSchema = z.enum(EMAIL_PURPOSES);
export type EmailPurpose = z.infer<typeof emailPurposeSchema>;

/**
 * Email writer purpose schema (agent-specific)
 */
export const emailWriterPurposeSchema = z.enum(EMAIL_WRITER_PURPOSES);
export type EmailWriterPurpose = z.infer<typeof emailWriterPurposeSchema>;

/**
 * Agent urgency schema (simple 3-level)
 */
export const agentUrgencySchema = z.enum(AGENT_URGENCIES);
export type AgentUrgency = z.infer<typeof agentUrgencySchema>;

/**
 * Email length schema
 */
export const emailLengthSchema = z.enum(EMAIL_LENGTHS);
export type EmailLength = z.infer<typeof emailLengthSchema>;

/**
 * Lead follow-up status schema
 */
export const leadFollowupStatusSchema = z.enum(LEAD_FOLLOWUP_STATUSES);
export type LeadFollowupStatus = z.infer<typeof leadFollowupStatusSchema>;

/**
 * Interaction type schema
 */
export const interactionTypeSchema = z.enum(INTERACTION_TYPES);
export type InteractionType = z.infer<typeof interactionTypeSchema>;

// ============================================================================
// Qualification Agent Output
// ============================================================================

/**
 * Lead qualification output schema
 * Defines the structured output for lead qualification analysis
 */
export const qualificationOutputSchema = z.object({
  qualified: z.boolean(),
  qualificationLevel: qualificationLevelSchema,
  confidence: confidenceSchema,
  reasoning: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      action: z.string(),
      // Qualification actions should stick to a simple 3-level priority model
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      reasoning: z.string(),
    })
  ),
  nextSteps: z.array(z.string()),
  estimatedConversionProbability: z.number().min(0).max(1),
});

export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;

// ============================================================================
// Email Writer Agent Output
// ============================================================================

/**
 * Email writer output schema
 * Defines the structured output for AI-generated emails
 */
export const emailWriterOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  callToAction: z.string(),
  confidence: confidenceSchema,
  reasoning: z.string(),
  suggestedSendTime: z.string().optional(),
  alternativeSubjects: z.array(z.string()),
  personalizationElements: z.array(z.string()),
  requiresHumanReview: z.boolean(),
  reviewReasons: z.array(z.string()).optional(),
});

export type EmailWriterOutput = z.infer<typeof emailWriterOutputSchema>;

// ============================================================================
// Follow-up Agent Output
// ============================================================================

/**
 * Follow-up agent output schema
 * Defines the structured output for follow-up recommendations
 */
export const followupOutputSchema = z.object({
  shouldFollowUp: z.boolean(),
  urgency: followupUrgencySchema,
  recommendedAction: recommendedActionSchema,
  reasoning: z.string(),
  confidence: confidenceSchema,
  suggestedTiming: z.object({
    optimalDay: optimalDaySchema,
    optimalTimeSlot: optimalTimeSlotSchema,
    reasonForTiming: z.string(),
  }),
  emailSuggestions: z
    .object({
      subject: z.string(),
      keyPoints: z.array(z.string()),
      tone: communicationToneSchema,
    })
    .optional(),
  callScript: z
    .object({
      opening: z.string(),
      keyQuestions: z.array(z.string()),
      objectionsToAnticipate: z.array(z.string()),
      closingStatement: z.string(),
    })
    .optional(),
  nextSteps: z.array(
    z.object({
      action: z.string(),
      deadline: z.string(),
      owner: z.string(),
    })
  ),
  riskFactors: z.array(z.string()),
  opportunitySignals: z.array(z.string()),
});

export type FollowupOutput = z.infer<typeof followupOutputSchema>;

// ============================================================================
// Input Schemas (for completeness)
// ============================================================================

/**
 * Qualification input schema
 * Defines the input for lead qualification analysis
 */
export const qualificationInputSchema = z.object({
  leadId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  website: z.string().url().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  interactionHistory: z
    .array(
      z.object({
        type: z.string(),
        date: z.string(),
        description: z.string(),
      })
    )
    .optional(),
});

export type QualificationInput = z.infer<typeof qualificationInputSchema>;

/**
 * Email writer input schema
 * Defines the input for AI email generation
 */
export const emailWriterInputSchema = z.object({
  leadId: z.string().uuid(),
  recipientName: z.string(),
  recipientEmail: z.string().email(),
  recipientCompany: z.string().optional(),
  recipientTitle: z.string().optional(),
  senderName: z.string(),
  senderTitle: z.string().optional(),
  senderCompany: z.string(),
  purpose: emailPurposeSchema,
  previousInteractions: z
    .array(
      z.object({
        type: z.string(),
        date: z.string(),
        summary: z.string(),
      })
    )
    .optional(),
  keyPoints: z.array(z.string()).optional(),
  tone: communicationToneSchema.optional(),
  urgency: agentUrgencySchema.optional(),
});

export type EmailWriterInput = z.infer<typeof emailWriterInputSchema>;

/**
 * Follow-up input schema
 * Defines the input for follow-up recommendations
 */
export const followupInputSchema = z.object({
  leadId: z.string().uuid(),
  leadName: z.string(),
  leadEmail: z.string().email(),
  leadCompany: z.string().optional(),
  currentStatus: z.string(),
  score: z.number().min(0).max(100),
  lastContactDate: z.string().optional(),
  interactionHistory: z
    .array(
      z.object({
        type: z.string(),
        date: z.string(),
        outcome: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  dealValue: z.number().optional(),
  dealStage: z.string().optional(),
  assignedTo: z.string().optional(),
});

export type FollowupInput = z.infer<typeof followupInputSchema>;
