/**
 * Churn Risk Prediction Chain (IFC-095)
 *
 * Predicts customer churn risk using engagement patterns, behavioral data,
 * and historical interactions. Returns risk score with actionable recommendations.
 *
 * Features:
 * - Multi-factor risk scoring (0-1)
 * - Risk level categorization (CRITICAL, HIGH, MEDIUM, LOW, MINIMAL)
 * - Confidence scoring
 * - Next Best Action recommendations based on risk level
 * - Production guard to prevent mock provider usage
 *
 * @module chains/churn-risk
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
import pino from 'pino';

// Import domain constants (IFC-095: DRY pattern)
import { CHURN_RISK_LEVELS, type ChurnRiskLevel } from '@intelliflow/domain';

const logger = pino({
  name: 'churn-risk-chain',
  level: process.env.LOG_LEVEL || 'info',
});

// =============================================================================
// Production Guard (IFC-095 P1 requirement)
// =============================================================================

/**
 * Throws error if mock provider is used in production
 */
function validateProviderForProduction(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isMockProvider = aiConfig.provider === 'mock';

  if (isProduction && isMockProvider) {
    throw new Error(
      'SECURITY: Mock AI provider cannot be used in production environment. ' +
        'Configure AI_PROVIDER to use "openai" or "ollama" for production workloads.'
    );
  }
}

// =============================================================================
// Types and Schemas
// =============================================================================

// Re-export domain types for backward compatibility
export { CHURN_RISK_LEVELS } from '@intelliflow/domain';
export type { ChurnRiskLevel } from '@intelliflow/domain';

// Note: LLM output parsing uses lowercase risk levels internally,
// but final results use uppercase domain constants (CRITICAL, HIGH, etc.)

/**
 * Risk level configuration with thresholds and SLAs
 * Maps uppercase domain constants to configuration
 */
export const RISK_LEVEL_CONFIG: Record<ChurnRiskLevel, { threshold: number; slaHours: number }> = {
  CRITICAL: { threshold: 0.8, slaHours: 24 },
  HIGH: { threshold: 0.6, slaHours: 48 },
  MEDIUM: { threshold: 0.4, slaHours: 168 }, // 7 days
  LOW: { threshold: 0.2, slaHours: 336 }, // 14 days
  MINIMAL: { threshold: 0, slaHours: 720 }, // 30 days
};

/**
 * Input schema for churn risk prediction
 */
export const churnRiskInputSchema = z.object({
  entityType: z.enum(['lead', 'contact', 'opportunity', 'account']),
  entityId: z.uuid(),

  // Engagement metrics
  daysSinceLastLogin: z.number().optional(),
  loginFrequency30d: z.number().optional(),
  sessionDurationAvg: z.number().optional(),
  featureUsageScore: z.number().min(0).max(100).optional(),
  emailOpenRate: z.number().min(0).max(1).optional(),

  // Behavioral patterns
  usageTrendSlope: z.number().optional(), // negative = declining
  sessionTimeTrend: z.number().optional(),

  // Transaction history
  totalRevenue: z.number().optional(),
  paymentConsistency: z.number().min(0).max(1).optional(),
  billingIssuesCount: z.number().optional(),
  contractLengthMonths: z.number().optional(),

  // Support interactions
  supportTickets30d: z.number().optional(),
  ticketResolutionSatisfaction: z.number().min(0).max(1).optional(),
  escalationCount: z.number().optional(),
  npsScore: z.number().min(0).max(10).optional(),
  csatAvg: z.number().min(0).max(5).optional(),

  // Account attributes
  accountAgeMonths: z.number().optional(),
  planTier: z.string().optional(),
  userCount: z.number().optional(),

  // Context
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChurnRiskInput = z.infer<typeof churnRiskInputSchema>;

/**
 * Risk factor impact levels (lowercase for LLM parsing)
 */
const RISK_IMPACTS_LOWER = ['high', 'medium', 'low'] as const;

/**
 * Risk factor with impact assessment
 */
export const riskFactorSchema = z.object({
  factor: z.string(),
  value: z.union([z.string(), z.number()]),
  impact: z.enum(RISK_IMPACTS_LOWER),
  reasoning: z.string(),
});

export type RiskFactor = z.infer<typeof riskFactorSchema>;

/**
 * Churn risk prediction result
 */
export const churnRiskResultSchema = z.object({
  // Core prediction
  riskScore: z.number().min(0).max(1),
  riskLevel: z.enum(CHURN_RISK_LEVELS),
  confidence: z.number().min(0).max(1),

  // Analysis
  topRiskFactors: z.array(riskFactorSchema),
  explanation: z.string(),

  // Recommendations
  recommendations: z.array(z.string()),
  primaryAction: z.string(),
  slaHours: z.number(),

  // Metadata (IFC-095 P1: include prediction metadata)
  executionTimeMs: z.number(),
  modelVersion: z.string(),
  dataQuality: z.enum(['complete', 'partial', 'minimal']).optional(),
  tokenCount: z.number().optional(),
});

export type ChurnRiskResult = z.infer<typeof churnRiskResultSchema>;

/**
 * Output schema for LLM parsing (subset of churnRiskResultSchema)
 * Excludes metadata fields added post-processing
 */
const llmOutputSchema = z.object({
  riskScore: z.number(),
  confidence: z.number(),
  topRiskFactors: z.array(
    z.object({
      factor: z.string(),
      value: z.union([z.string(), z.number()]),
      impact: z.enum(['high', 'medium', 'low']),
      reasoning: z.string(),
    })
  ),
  explanation: z.string(),
  recommendations: z.array(z.string()),
  primaryAction: z.string(),
});

// =============================================================================
// Churn Risk Chain
// =============================================================================

/**
 * LLM-based Churn Risk Prediction Chain
 *
 * Analyzes customer data to predict churn probability and generate
 * actionable recommendations.
 */
export class ChurnRiskChain {
  private structuredModel: { invoke(input: unknown): Promise<unknown> };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;

  constructor(options?: { tenantId?: string }) {
    this.tenantId = options?.tenantId;

    // Production guard: prevent mock provider in production (IFC-095 P1)
    validateProviderForProduction();

    // Initialize LLM via factory — provider/tier routing handled centrally
    const llm = createLLM('scoring', 'free', {
      temperature: 0.3,
      maxTokens: 1500,
      timeout: aiConfig.openai.timeout,
    });
    this.structuredModel = (llm as any).withStructuredOutput(llmOutputSchema);

    // Define the prediction prompt
    this.prompt = new PromptTemplate({
      template: `You are an expert customer success analyst specializing in churn prediction for a CRM system.
Analyze the following customer data to predict their churn risk.

CUSTOMER DATA:
Entity Type: {entityType}
Entity ID: {entityId}

ENGAGEMENT METRICS:
{engagementData}

BEHAVIORAL PATTERNS:
{behavioralData}

TRANSACTION HISTORY:
{transactionData}

SUPPORT INTERACTIONS:
{supportData}

ACCOUNT ATTRIBUTES:
{accountData}

ANALYSIS INSTRUCTIONS:

1. RISK SCORE (0.0 to 1.0):
   - 0.8-1.0: Critical risk - Immediate intervention required
   - 0.6-0.79: High risk - Urgent attention needed
   - 0.4-0.59: Medium risk - Proactive engagement recommended
   - 0.2-0.39: Low risk - Standard monitoring
   - 0.0-0.19: Minimal risk - Customer is healthy

2. RISK FACTORS:
   - Identify the top 3-5 factors contributing to churn risk
   - Classify each factor's impact as high, medium, or low
   - Provide specific reasoning for each factor

3. RECOMMENDATIONS:
   - Provide 3-5 actionable recommendations
   - Prioritize by impact and urgency
   - Be specific and actionable

4. PRIMARY ACTION:
   - State the single most important action to take
   - This should be immediately executable

5. CONFIDENCE:
   - 0.9-1.0: Very high confidence (comprehensive data)
   - 0.7-0.89: High confidence (good data coverage)
   - 0.5-0.69: Moderate confidence (some data gaps)
   - Below 0.5: Low confidence (significant data missing)

Respond with a structured JSON object containing riskScore, confidence, topRiskFactors, explanation, recommendations, and primaryAction.`,
      inputVariables: [
        'entityType',
        'entityId',
        'engagementData',
        'behavioralData',
        'transactionData',
        'supportData',
        'accountData',
      ],
    });

    logger.info('Churn Risk Chain initialized');
  }

  /**
   * Resolve tenant-versioned prompt override (falls back to default on any error).
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const config = await getVersionLoader().getChainConfig(CHAIN_TYPE_MAP.CHURN_RISK, {
        tenantId: this.tenantId,
      });
      return config.prompt ?? null;
    } catch {
      logger.warn(
        {
          chainType: 'CHURN_RISK',
          tenantId: this.tenantId,
          reason: 'no active version, using default',
        },
        'VersionLoader: failed to load versioned config'
      );
      return null;
    }
  }

  /**
   * Predict churn risk for a given entity
   */
  async predictChurnRisk(input: ChurnRiskInput): Promise<ChurnRiskResult> {
    const startTime = Date.now();

    try {
      logger.info(
        {
          entityType: input.entityType,
          entityId: input.entityId,
        },
        'Starting churn risk prediction'
      );

      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      if (this.tenantId) {
        const tenantModel = await createLLMForTenant('scoring', 'free', {
          tenantId: this.tenantId,
          temperature: 0.3,
          maxTokens: 1500,
          timeout: aiConfig.openai.timeout,
        });
        this.structuredModel = (tenantModel as any).withStructuredOutput(llmOutputSchema);
      }

      // Validate input
      const validatedInput = churnRiskInputSchema.parse(input);

      // Format data sections
      const engagementData = this.formatEngagementData(validatedInput);
      const behavioralData = this.formatBehavioralData(validatedInput);
      const transactionData = this.formatTransactionData(validatedInput);
      const supportData = this.formatSupportData(validatedInput);
      const accountData = this.formatAccountData(validatedInput);

      // Resolve tenant-versioned prompt override; fall back to default
      const versionedText = await this.resolveVersionedPrompt();
      const activePrompt = versionedText
        ? new PromptTemplate({
            template: versionedText,
            inputVariables: this.prompt.inputVariables,
          })
        : this.prompt;

      // Generate the prompt
      const formattedPrompt = await activePrompt.format({
        entityType: validatedInput.entityType,
        entityId: validatedInput.entityId,
        engagementData,
        behavioralData,
        transactionData,
        supportData,
        accountData,
      });

      // Call the LLM with structured output — returns typed object directly
      const parsed = (await this.structuredModel.invoke(formattedPrompt)) as {
        riskScore: number;
        confidence: number;
        topRiskFactors: RiskFactor[];
        explanation: string;
        recommendations: string[];
        primaryAction: string;
      };

      // Determine risk level from score
      const riskLevel = this.determineRiskLevel(parsed.riskScore);
      const slaHours = RISK_LEVEL_CONFIG[riskLevel].slaHours;

      const executionTimeMs = Date.now() - startTime;

      // Assess data quality based on available fields
      const dataQuality = this.assessDataQuality(validatedInput);

      const result: ChurnRiskResult = {
        riskScore: Math.min(1, Math.max(0, parsed.riskScore)),
        riskLevel,
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        topRiskFactors: parsed.topRiskFactors,
        explanation: parsed.explanation,
        recommendations: parsed.recommendations,
        primaryAction: parsed.primaryAction,
        slaHours,
        executionTimeMs,
        modelVersion: `${aiConfig.provider}:churn-risk:v2`,
        dataQuality,
      };

      logger.info(
        {
          entityId: input.entityId,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          executionTimeMs,
        },
        'Churn risk prediction completed'
      );

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      logger.error(
        {
          entityId: input.entityId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Churn risk prediction failed'
      );

      // Return fallback result based on heuristics
      return this.generateFallbackResult(input, executionTimeMs, error);
    }
  }

  /**
   * Determine risk level from score
   * Returns uppercase domain constant (CRITICAL, HIGH, MEDIUM, LOW, MINIMAL)
   */
  private determineRiskLevel(score: number): ChurnRiskLevel {
    for (const level of CHURN_RISK_LEVELS) {
      if (score >= RISK_LEVEL_CONFIG[level].threshold) {
        return level;
      }
    }
    return 'MINIMAL';
  }

  /**
   * Assess data quality based on available input fields
   */
  private assessDataQuality(input: ChurnRiskInput): 'complete' | 'partial' | 'minimal' {
    const optionalFields = [
      'daysSinceLastLogin',
      'loginFrequency30d',
      'sessionDurationAvg',
      'featureUsageScore',
      'emailOpenRate',
      'usageTrendSlope',
      'sessionTimeTrend',
      'totalRevenue',
      'paymentConsistency',
      'billingIssuesCount',
      'contractLengthMonths',
      'supportTickets30d',
      'ticketResolutionSatisfaction',
      'escalationCount',
      'npsScore',
      'csatAvg',
      'accountAgeMonths',
      'planTier',
      'userCount',
    ];

    const providedCount = optionalFields.filter(
      (field) => input[field as keyof ChurnRiskInput] !== undefined
    ).length;

    const coverage = providedCount / optionalFields.length;

    if (coverage >= 0.7) return 'complete';
    if (coverage >= 0.3) return 'partial';
    return 'minimal';
  }

  /**
   * Format engagement data for prompt
   */
  private formatEngagementData(input: ChurnRiskInput): string {
    const parts: string[] = [];

    if (input.daysSinceLastLogin !== undefined) {
      parts.push(`Days since last login: ${input.daysSinceLastLogin}`);
    }
    if (input.loginFrequency30d !== undefined) {
      parts.push(`Login frequency (30d): ${input.loginFrequency30d}`);
    }
    if (input.sessionDurationAvg !== undefined) {
      parts.push(`Avg session duration: ${input.sessionDurationAvg} minutes`);
    }
    if (input.featureUsageScore !== undefined) {
      parts.push(`Feature usage score: ${input.featureUsageScore}/100`);
    }
    if (input.emailOpenRate !== undefined) {
      parts.push(`Email open rate: ${(input.emailOpenRate * 100).toFixed(1)}%`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No engagement data available';
  }

  /**
   * Format behavioral data for prompt
   */
  private formatBehavioralData(input: ChurnRiskInput): string {
    const parts: string[] = [];

    if (input.usageTrendSlope !== undefined) {
      let trend: string;
      if (input.usageTrendSlope > 0) {
        trend = 'increasing';
      } else if (input.usageTrendSlope < 0) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
      parts.push(`Usage trend: ${trend} (slope: ${input.usageTrendSlope.toFixed(2)})`);
    }
    if (input.sessionTimeTrend !== undefined) {
      let trend: string;
      if (input.sessionTimeTrend > 0) {
        trend = 'increasing';
      } else if (input.sessionTimeTrend < 0) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
      parts.push(`Session time trend: ${trend}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No behavioral data available';
  }

  /**
   * Format transaction data for prompt
   */
  private formatTransactionData(input: ChurnRiskInput): string {
    const parts: string[] = [];

    if (input.totalRevenue !== undefined) {
      parts.push(`Total revenue: $${input.totalRevenue.toLocaleString('en-US')}`);
    }
    if (input.paymentConsistency !== undefined) {
      parts.push(`Payment consistency: ${(input.paymentConsistency * 100).toFixed(0)}%`);
    }
    if (input.billingIssuesCount !== undefined) {
      parts.push(`Billing issues: ${input.billingIssuesCount}`);
    }
    if (input.contractLengthMonths !== undefined) {
      parts.push(`Contract length: ${input.contractLengthMonths} months`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No transaction data available';
  }

  /**
   * Format support data for prompt
   */
  private formatSupportData(input: ChurnRiskInput): string {
    const parts: string[] = [];

    if (input.supportTickets30d !== undefined) {
      parts.push(`Support tickets (30d): ${input.supportTickets30d}`);
    }
    if (input.ticketResolutionSatisfaction !== undefined) {
      parts.push(`Ticket satisfaction: ${(input.ticketResolutionSatisfaction * 100).toFixed(0)}%`);
    }
    if (input.escalationCount !== undefined) {
      parts.push(`Escalations: ${input.escalationCount}`);
    }
    if (input.npsScore !== undefined) {
      parts.push(`NPS Score: ${input.npsScore}/10`);
    }
    if (input.csatAvg !== undefined) {
      parts.push(`CSAT Average: ${input.csatAvg.toFixed(1)}/5`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No support data available';
  }

  /**
   * Format account data for prompt.
   * Sanitizes user-provided string fields against prompt injection (Fix #12).
   */
  private formatAccountData(input: ChurnRiskInput): string {
    const parts: string[] = [];

    if (input.accountAgeMonths !== undefined) {
      parts.push(`Account age: ${input.accountAgeMonths} months`);
    }
    if (input.planTier) {
      parts.push(`Plan tier: ${sanitizeStringField(input.planTier, 500)}`);
    }
    if (input.userCount !== undefined) {
      parts.push(`User count: ${input.userCount}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No account data available';
  }

  /**
   * Generate fallback result when LLM fails
   */
  private generateFallbackResult(
    input: ChurnRiskInput,
    executionTimeMs: number,
    _error: unknown
  ): ChurnRiskResult {
    // Use heuristics to estimate risk
    let riskScore = 0.3; // Default medium-low risk
    const factors: RiskFactor[] = [];

    // High days since login = high risk
    if (input.daysSinceLastLogin !== undefined && input.daysSinceLastLogin > 30) {
      riskScore += 0.25;
      factors.push({
        factor: 'days_since_last_login',
        value: input.daysSinceLastLogin,
        impact: 'high',
        reasoning: 'Extended period without login indicates potential disengagement',
      });
    }

    // Low NPS = high risk
    if (input.npsScore !== undefined && input.npsScore < 6) {
      riskScore += 0.2;
      factors.push({
        factor: 'nps_score',
        value: input.npsScore,
        impact: 'high',
        reasoning: 'Low NPS score indicates customer dissatisfaction',
      });
    }

    // Many support tickets = elevated risk
    if (input.supportTickets30d !== undefined && input.supportTickets30d > 5) {
      riskScore += 0.15;
      factors.push({
        factor: 'support_tickets',
        value: input.supportTickets30d,
        impact: 'medium',
        reasoning: 'High support ticket volume may indicate product issues',
      });
    }

    // Declining usage = elevated risk
    if (input.usageTrendSlope !== undefined && input.usageTrendSlope < -0.2) {
      riskScore += 0.15;
      factors.push({
        factor: 'usage_trend',
        value: input.usageTrendSlope,
        impact: 'medium',
        reasoning: 'Declining usage pattern suggests waning interest',
      });
    }

    // Normalize score
    riskScore = Math.min(1, Math.max(0, riskScore));
    const riskLevel = this.determineRiskLevel(riskScore);

    return {
      riskScore,
      riskLevel,
      confidence: 0.4, // Low confidence for fallback
      topRiskFactors:
        factors.length > 0
          ? factors
          : [
              {
                factor: 'insufficient_data',
                value: 'N/A',
                impact: 'low',
                reasoning: 'Unable to assess risk due to limited data',
              },
            ],
      explanation: `Fallback analysis due to: ${_error instanceof Error ? _error.message : 'Unknown error'}. Risk estimated using available heuristics.`,
      recommendations: [
        'Schedule a customer check-in call',
        'Review recent support interactions',
        'Send personalized engagement content',
      ],
      primaryAction: 'Schedule customer health check call',
      slaHours: RISK_LEVEL_CONFIG[riskLevel].slaHours,
      executionTimeMs,
      modelVersion: 'fallback:heuristic:v2',
      dataQuality: this.assessDataQuality(input),
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Lazy-initialized churn risk chain
 */
let _churnRiskChain: ChurnRiskChain | null = null;

export function getChurnRiskChain(): ChurnRiskChain {
  _churnRiskChain ??= new ChurnRiskChain();
  return _churnRiskChain;
}

/**
 * Lazy proxy for global access
 */
function createLazyChurnRiskProxy(): ChurnRiskChain {
  return new Proxy({} as ChurnRiskChain, {
    get(_target, prop) {
      const chain = getChurnRiskChain();
      const key = prop as keyof ChurnRiskChain;
      const value = chain[key];
      return typeof value === 'function' ? value.bind(chain) : value;
    },
  });
}

export const churnRiskChain = createLazyChurnRiskProxy();
