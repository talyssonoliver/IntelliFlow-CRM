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
  // Churn Risk constants (IFC-095)
  CHURN_RISK_LEVELS,
  RISK_FACTOR_IMPACTS,
  DATA_QUALITY_LEVELS,
  // Next Best Action constants
  NBA_ACTION_TYPES,
  NBA_ACTION_PRIORITIES,
  // A/B Testing constants (IFC-025)
  SIGNIFICANCE_LEVELS,
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

// ============================================================================
// Churn Risk Schemas (IFC-095)
// ============================================================================

/**
 * Churn risk level schema - derived from domain constants
 */
export const churnRiskLevelSchema = z.enum(CHURN_RISK_LEVELS);
export type ChurnRiskLevelType = z.infer<typeof churnRiskLevelSchema>;

/**
 * Risk factor impact schema
 */
export const riskFactorImpactSchema = z.enum(RISK_FACTOR_IMPACTS);
export type RiskFactorImpactType = z.infer<typeof riskFactorImpactSchema>;

/**
 * Data quality level schema
 */
export const dataQualityLevelSchema = z.enum(DATA_QUALITY_LEVELS);
export type DataQualityLevelType = z.infer<typeof dataQualityLevelSchema>;

/**
 * Risk factor schema - individual factor contributing to churn risk
 */
export const riskFactorSchema = z.object({
  factor: z.string(),
  value: z.union([z.string(), z.number()]),
  impact: riskFactorImpactSchema,
  reasoning: z.string(),
});
export type RiskFactor = z.infer<typeof riskFactorSchema>;

/**
 * Churn risk output schema - structured output from churn risk chain
 */
export const churnRiskOutputSchema = z.object({
  // Core prediction
  riskScore: z.number().min(0).max(1),
  riskLevel: churnRiskLevelSchema,
  confidence: confidenceSchema,

  // Analysis
  topRiskFactors: z.array(riskFactorSchema),
  explanation: z.string(),

  // Recommendations
  recommendations: z.array(z.string()),
  primaryAction: z.string(),
  slaHours: z.number().positive(),

  // Metadata
  metadata: z
    .object({
      modelVersion: z.string(),
      promptVersion: z.string().optional(),
      latencyMs: z.number(),
      tokenCount: z.number().optional(),
      dataQuality: dataQualityLevelSchema,
    })
    .optional(),
});
export type ChurnRiskOutput = z.infer<typeof churnRiskOutputSchema>;

/**
 * Churn risk input schema - input for churn risk prediction
 */
export const churnRiskInputSchema = z.object({
  entityType: z.enum(['lead', 'contact', 'opportunity', 'account']),
  entityId: z.string().uuid(),
  tenantId: z.string().uuid(),

  // Engagement metrics
  daysSinceLastLogin: z.number().optional(),
  loginFrequency30d: z.number().optional(),
  sessionDurationAvg: z.number().optional(),
  featureUsageScore: z.number().min(0).max(100).optional(),
  emailOpenRate: z.number().min(0).max(1).optional(),

  // Behavioral patterns
  usageTrendSlope: z.number().optional(),
  sessionTimeTrend: z.number().optional(),

  // Support interactions
  supportTickets30d: z.number().optional(),
  npsScore: z.number().min(0).max(10).optional(),
  csatAvg: z.number().min(0).max(5).optional(),

  // Account attributes
  accountAgeMonths: z.number().optional(),
  planTier: z.string().optional(),

  // Context
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ChurnRiskInput = z.infer<typeof churnRiskInputSchema>;

// ============================================================================
// Next Best Action Schemas (IFC-095)
// ============================================================================

/**
 * NBA action type schema - derived from domain constants
 */
export const nbaActionTypeSchema = z.enum(NBA_ACTION_TYPES);
export type NBAActionTypeType = z.infer<typeof nbaActionTypeSchema>;

/**
 * NBA priority schema - derived from domain constants
 */
export const nbaPrioritySchema = z.enum(NBA_ACTION_PRIORITIES);
export type NBAPriorityType = z.infer<typeof nbaPrioritySchema>;

/**
 * NBA recommendation item schema
 */
export const nbaRecommendationSchema = z.object({
  action: nbaActionTypeSchema,
  priority: nbaPrioritySchema,
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  deadline: z.string().datetime().optional(),
  confidence: confidenceSchema,
  successProbability: z.number().min(0).max(1).optional(),
});
export type NBARecommendation = z.infer<typeof nbaRecommendationSchema>;

/**
 * Next best action output schema - structured output from NBA agent
 */
export const nextBestActionOutputSchema = z.object({
  // Entity summary
  entitySummary: z.string(),
  currentState: z.string(),

  // Recommendations (ordered by priority)
  recommendations: z.array(nbaRecommendationSchema),

  // Metadata
  confidence: confidenceSchema,
  analysisTimestamp: z.string().datetime(),
  modelVersion: z.string(),
});
export type NextBestActionOutput = z.infer<typeof nextBestActionOutputSchema>;

// ============================================================================
// A/B Testing Statistical Confidence (IFC-025)
// ============================================================================

/**
 * Significance level schema for A/B tests
 * Uses domain constants for standard statistical significance thresholds
 */
export const significanceLevelSchema = z
  .number()
  .refine(
    (val) =>
      val === SIGNIFICANCE_LEVELS.LOW ||
      val === SIGNIFICANCE_LEVELS.MEDIUM ||
      val === SIGNIFICANCE_LEVELS.HIGH,
    {
      message: `Significance level must be one of: ${SIGNIFICANCE_LEVELS.LOW} (90%), ${SIGNIFICANCE_LEVELS.MEDIUM} (95%), or ${SIGNIFICANCE_LEVELS.HIGH} (99%)`,
    }
  );

export type SignificanceLevelType = z.infer<typeof significanceLevelSchema>;

// ============================================================================
// AI Insights Summary Schema (IFC-095)
// ============================================================================

/**
 * AI insights summary schema - for Contact 360 page integration
 * Aggregates churn risk, NBA, and other AI insights
 */
export const aiInsightsSummarySchema = z.object({
  // Churn risk summary
  churnRisk: z.object({
    score: z.number().min(0).max(100),
    level: churnRiskLevelSchema,
    trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING']).optional(),
    lastAssessedAt: z.string().datetime().optional(),
  }),

  // Next best action summary
  nextBestAction: z.object({
    action: nbaActionTypeSchema,
    title: z.string(),
    deadline: z.string().optional(),
    priority: nbaPrioritySchema,
  }),

  // Additional insights
  conversionProbability: z.number().min(0).max(100).optional(),
  lifetimeValue: z.number().optional(),
  sentiment: z
    .enum(['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE'])
    .optional(),
  engagementScore: z.number().min(0).max(100).optional(),

  // Recommendations list
  recommendations: z.array(z.string()),

  // Metadata
  confidence: confidenceSchema,
  lastUpdatedAt: z.string().datetime(),
});
export type AIInsightsSummary = z.infer<typeof aiInsightsSummarySchema>;
