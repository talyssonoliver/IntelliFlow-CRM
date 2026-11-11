/**
 * Insight Generation Chain
 *
 * Generates AI-powered CRM insights from pipeline, lead, contact, and task data.
 * Uses LangChain structured outputs to produce actionable recommendations with
 * confidence scores and natural language analysis.
 *
 * Features:
 * - Multi-category insight generation (deal health, lead scoring, engagement, performance)
 * - Confidence scoring (0-1)
 * - Actionable recommendations with priority ranking
 * - Fallback heuristic generation when LLM is unavailable
 * - Production guard to prevent mock provider usage
 *
 * @module chains/insight-generation
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { BUILTIN_CHAIN_TEMPLATES } from '@intelliflow/application';
import { z } from 'zod';
import { aiConfig, type AIProvider } from '../config/ai.config';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
import { usableVersionedPrompt } from '../versioning/versioned-prompt';
import pino from 'pino';

const logger = pino({
  name: 'insight-generation-chain',
  level: process.env.LOG_LEVEL || 'info',
});

// =============================================================================
// Production Guard
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

/** Entity types that can be analyzed for insights */
const INSIGHT_ENTITY_TYPES = ['opportunity', 'lead', 'contact', 'task', 'deal'] as const;

/** Insight types produced by the chain */
const INSIGHT_TYPES = ['warning', 'opportunity', 'reminder', 'achievement'] as const;

/** Priority levels for insights */
const INSIGHT_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Summary of a deal for insight analysis
 */
const DealSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  daysSinceUpdate: z.number(),
  stage: z.string().optional(),
  value: z.number().optional(),
});

/**
 * Summary of a lead for insight analysis
 */
const LeadSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
  company: z.string().optional(),
  status: z.string().optional(),
});

/**
 * Summary of a contact for insight analysis
 */
const ContactSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  daysSinceContact: z.number().nullable(),
  hasOpenOpportunities: z.boolean().optional(),
});

/**
 * Input schema for insight generation
 */
export const InsightGenerationInputSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  dealsAtRisk: z.array(DealSummarySchema).default([]),
  hotLeads: z.array(LeadSummarySchema).default([]),
  overdueTasksCount: z.number().default(0),
  staleContacts: z.array(ContactSummarySchema).default([]),
});

export type InsightGenerationInput = z.infer<typeof InsightGenerationInputSchema>;

/**
 * Single generated insight from the LLM
 */
export const GeneratedInsightSchema = z.object({
  entityId: z.string().nullable(),
  entityType: z.enum(INSIGHT_ENTITY_TYPES).nullable(),
  type: z.enum(INSIGHT_TYPES),
  title: z.string(),
  description: z.string(),
  suggestedActions: z.array(z.string()).max(3),
  confidence: z.number().min(0).max(1),
  priority: z.enum(INSIGHT_PRIORITIES),
  reasoning: z.string(),
});

export type GeneratedInsight = z.infer<typeof GeneratedInsightSchema>;

export interface InsightGenerationResult {
  insights: GeneratedInsight[];
  source: 'llm' | 'fallback';
  executionTimeMs: number;
  error?: string;
}

const DEFAULT_REASONING = 'AI-generated insight based on current CRM activity.';

/**
 * Output schema for LLM parsing
 */
const LLMInsightOutputSchema = z.object({
  insights: z.array(
    z.object({
      entityId: z.string().nullable().optional().default(null),
      entityType: z.enum(INSIGHT_ENTITY_TYPES).nullable().optional().default(null),
      type: z.enum(INSIGHT_TYPES),
      title: z.string(),
      description: z.string(),
      suggestedActions: z.array(z.string()).optional().default([]),
      confidence: z.number(),
      priority: z.enum(INSIGHT_PRIORITIES),
      reasoning: z.string().optional().default(DEFAULT_REASONING),
    })
  ),
});

// =============================================================================
// Insight Generation Chain
// =============================================================================

/**
 * LLM-based Insight Generation Chain
 *
 * Analyzes CRM pipeline data and produces actionable insights with
 * natural language explanations and confidence scores.
 */
export class InsightGenerationChain {
  private structuredModel: { invoke(input: unknown): Promise<unknown> };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;
  /** Optional provider override (job-level fallback, #324). */
  private readonly provider?: AIProvider;

  constructor(options?: { tenantId?: string; provider?: AIProvider }) {
    this.tenantId = options?.tenantId;
    this.provider = options?.provider;
    validateProviderForProduction();

    // Initialize LLM via factory — provider/tier routing handled centrally
    const llm = createLLM('reasoning', 'free', {
      temperature: 0.4,
      maxTokens: 2000,
      timeout: aiConfig.openai.timeout,
      provider: this.provider,
    });
    this.structuredModel = (llm as any).withStructuredOutput(LLMInsightOutputSchema);

    this.prompt = new PromptTemplate({
      template: BUILTIN_CHAIN_TEMPLATES.INSIGHT_GENERATION,
      inputVariables: ['dealsData', 'leadsData', 'overdueTasksCount', 'contactsData'],
    });

    logger.info('Insight Generation Chain initialized');
  }

  /**
   * Resolve tenant-versioned prompt override (falls back to default on any error).
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const config = await getVersionLoader().getChainConfig(CHAIN_TYPE_MAP.INSIGHT_GENERATION, {
        tenantId: this.tenantId,
      });
      return usableVersionedPrompt('INSIGHT_GENERATION', config.prompt, this.prompt.inputVariables);
    } catch {
      logger.warn(
        {
          chainType: 'INSIGHT_GENERATION',
          tenantId: this.tenantId,
          reason: 'no active version, using default',
        },
        'VersionLoader: failed to load versioned config'
      );
      return null;
    }
  }

  /**
   * Generate insights from CRM data
   */
  async generateInsights(input: InsightGenerationInput): Promise<GeneratedInsight[]> {
    const result = await this.generateInsightsWithMeta(input);
    return result.insights;
  }

  async generateInsightsWithMeta(input: InsightGenerationInput): Promise<InsightGenerationResult> {
    const startTime = Date.now();

    try {
      logger.info(
        {
          tenantId: input.tenantId,
          dealsCount: input.dealsAtRisk.length,
          leadsCount: input.hotLeads.length,
          overdueTasksCount: input.overdueTasksCount,
          contactsCount: input.staleContacts.length,
        },
        'Starting insight generation'
      );

      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      if (this.tenantId) {
        const tenantModel = await createLLMForTenant('reasoning', 'free', {
          tenantId: this.tenantId,
          temperature: 0.4,
          maxTokens: 2000,
          timeout: aiConfig.openai.timeout,
          provider: this.provider,
        });
        this.structuredModel = (tenantModel as any).withStructuredOutput(LLMInsightOutputSchema);
      }

      const validatedInput = InsightGenerationInputSchema.parse(input);

      // Fix #12: sanitize all user-provided text fields interpolated into the prompt.
      const dealsData =
        validatedInput.dealsAtRisk.length > 0
          ? validatedInput.dealsAtRisk
              .map(
                (d) =>
                  `- ${sanitizeStringField(d.name, 200)} (ID: ${d.id}): ${d.daysSinceUpdate} days since last update` +
                  (d.stage ? `, stage: ${sanitizeStringField(d.stage, 100)}` : '') +
                  (d.value ? `, value: $${d.value.toLocaleString('en-GB')}` : '')
              )
              .join('\n')
          : 'No deals at risk';

      const leadsData =
        validatedInput.hotLeads.length > 0
          ? validatedInput.hotLeads
              .map(
                (l) =>
                  `- ${sanitizeStringField(l.name, 200)} (ID: ${l.id}): score ${l.score}` +
                  (l.company ? `, company: ${sanitizeStringField(l.company, 200)}` : '') +
                  (l.status ? `, status: ${sanitizeStringField(l.status, 100)}` : '')
              )
              .join('\n')
          : 'No hot leads';

      const contactsData =
        validatedInput.staleContacts.length > 0
          ? validatedInput.staleContacts
              .map(
                (c) =>
                  `- ${sanitizeStringField(c.name, 200)} (ID: ${c.id}): ` +
                  (c.daysSinceContact === null
                    ? 'never contacted'
                    : `${c.daysSinceContact} days since last contact`)
              )
              .join('\n')
          : 'No stale contacts';

      // Resolve tenant-versioned prompt if tenantId is available; fall back to default
      const versionedText = await this.resolveVersionedPrompt();
      const activePrompt = versionedText
        ? new PromptTemplate({
            template: versionedText,
            inputVariables: this.prompt.inputVariables,
          })
        : this.prompt;

      const formattedPrompt = await activePrompt.format({
        dealsData,
        leadsData,
        overdueTasksCount: String(validatedInput.overdueTasksCount),
        contactsData,
      });

      // Use structured output model — returns typed object directly
      const parsed = (await this.structuredModel.invoke(formattedPrompt)) as z.infer<
        typeof LLMInsightOutputSchema
      >;

      const executionTimeMs = Date.now() - startTime;

      // Cost is metered by the tracing wrapper on the model call itself (PG-199,
      // lib/usage-metering.ts); this used to record 0/0 tokens under the wrong purpose.

      logger.info(
        {
          insightCount: parsed.insights.length,
          executionTimeMs,
        },
        'Insight generation completed'
      );

      return {
        insights: parsed.insights.map((insight) => ({
          ...insight,
          entityId: insight.entityId ?? null,
          entityType: insight.entityType ?? null,
          confidence: Math.min(1, Math.max(0, insight.confidence)),
          suggestedActions: insight.suggestedActions.slice(0, 3),
          reasoning: insight.reasoning || DEFAULT_REASONING,
        })),
        source: 'llm',
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          error: errorMessage,
          executionTimeMs,
        },
        'Insight generation failed, using fallback heuristics'
      );

      return {
        insights: this.generateFallbackInsights(input),
        source: 'fallback',
        executionTimeMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate fallback insights using heuristic rules when LLM is unavailable
   */
  generateFallbackInsights(input: InsightGenerationInput): GeneratedInsight[] {
    const insights: GeneratedInsight[] = [];

    input.dealsAtRisk.forEach((deal) => {
      insights.push({
        entityId: deal.id,
        entityType: 'opportunity',
        type: 'warning',
        title: `Deal at Risk: ${deal.name}`,
        description: `Last interaction was ${deal.daysSinceUpdate} days ago. Consider scheduling a follow-up.`,
        suggestedActions: [
          'Schedule a check-in call',
          'Send a progress update email',
          'Review deal timeline',
        ],
        confidence: 0.4,
        priority: deal.daysSinceUpdate > 21 ? 'critical' : 'high',
        reasoning: 'Heuristic: deal inactive beyond threshold',
      });
    });

    input.hotLeads.forEach((lead) => {
      insights.push({
        entityId: lead.id,
        entityType: 'lead',
        type: 'opportunity',
        title: `Hot Lead: ${lead.name}`,
        description: `Score of ${lead.score} indicates strong buying signals.`,
        suggestedActions: [
          'Send personalized follow-up',
          'Schedule a discovery call',
          'Prepare a proposal',
        ],
        confidence: 0.4,
        priority: lead.score >= 90 ? 'critical' : 'high',
        reasoning: 'Heuristic: lead score above threshold',
      });
    });

    if (input.overdueTasksCount > 0) {
      insights.push({
        entityId: null,
        entityType: 'task',
        type: 'reminder',
        title: `${input.overdueTasksCount} Overdue Task${input.overdueTasksCount > 1 ? 's' : ''}`,
        description: `You have tasks past their due date. Review and update your task list.`,
        suggestedActions: [
          'Review overdue tasks',
          'Reprioritize or reschedule',
          'Delegate if possible',
        ],
        confidence: 0.4,
        priority: input.overdueTasksCount > 5 ? 'high' : 'medium',
        reasoning: 'Heuristic: overdue task count',
      });
    }

    input.staleContacts.forEach((contact) => {
      insights.push({
        entityId: contact.id,
        entityType: 'contact',
        type: 'warning',
        title: `Stale Contact: ${contact.name}`,
        description:
          contact.daysSinceContact === null
            ? `Never contacted. This contact has open opportunities.`
            : `No interaction in ${contact.daysSinceContact} days. This contact has open opportunities.`,
        suggestedActions: [
          'Schedule a follow-up',
          'Send a re-engagement email',
          'Review opportunity status',
        ],
        confidence: 0.4,
        priority: 'medium',
        reasoning: 'Heuristic: contact inactive beyond threshold',
      });
    });

    // Nothing flagged gives no insight, never a reassurance: the caller says what was checked.
    return insights;
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let _insightGenerationChain: InsightGenerationChain | null = null;

export function getInsightGenerationChain(): InsightGenerationChain {
  _insightGenerationChain ??= new InsightGenerationChain();
  return _insightGenerationChain;
}

/**
 * Lazy proxy for global access
 */
function createLazyInsightProxy(): InsightGenerationChain {
  return new Proxy({} as InsightGenerationChain, {
    get(_target, prop) {
      const chain = getInsightGenerationChain();
      const key = prop as keyof InsightGenerationChain;
      const value = chain[key];
      return typeof value === 'function' ? value.bind(chain) : value;
    },
  });
}

export const insightGenerationChain = createLazyInsightProxy();
