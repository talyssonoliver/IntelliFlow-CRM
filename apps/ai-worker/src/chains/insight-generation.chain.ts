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

import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import { getOpenAIClientSettings } from '../utils/openai-client';
import pino from 'pino';

/**
 * Interface for LLM model invocation
 * Supports both real LangChain models and mock implementations
 */
interface LLMModel {
  invoke(input: BaseMessage[] | string): Promise<{ content: string | unknown[] }>;
}

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
const INSIGHT_ENTITY_TYPES = ['opportunity', 'lead', 'contact', 'task'] as const;

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

/**
 * Output schema for LLM parsing
 */
const LLMInsightOutputSchema = z.object({
  insights: z.array(
    z.object({
      entityId: z.string().nullable(),
      entityType: z.enum(INSIGHT_ENTITY_TYPES).nullable(),
      type: z.enum(INSIGHT_TYPES),
      title: z.string(),
      description: z.string(),
      suggestedActions: z.array(z.string()),
      confidence: z.number(),
      priority: z.enum(INSIGHT_PRIORITIES),
      reasoning: z.string(),
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
  private readonly model: LLMModel;
  private readonly parser: StructuredOutputParser<typeof LLMInsightOutputSchema>;
  private readonly prompt: PromptTemplate;

  constructor() {
    validateProviderForProduction();

    if (aiConfig.provider === 'openai') {
      const openAIClientSettings = getOpenAIClientSettings();
      this.model = new ChatOpenAI({
        modelName: aiConfig.openai.model,
        temperature: 0.4,
        maxTokens: 2000,
        timeout: aiConfig.openai.timeout,
        apiKey: openAIClientSettings.apiKey,
        configuration: openAIClientSettings.configuration,
        callbacks: aiConfig.features.enableChainLogging
          ? [
              {
                handleLLMEnd: async (output) => {
                  const usage = output.llmOutput?.tokenUsage;
                  if (usage && aiConfig.costTracking.enabled) {
                    costTracker.recordUsage({
                      model: aiConfig.openai.model,
                      inputTokens: usage.promptTokens || 0,
                      outputTokens: usage.completionTokens || 0,
                      operationType: 'insight_generation',
                    });
                  }
                },
              },
            ]
          : undefined,
      });
    } else if (aiConfig.provider === 'ollama') {
      this.model = new ChatOllama({
        baseUrl: aiConfig.ollama.baseUrl,
        model: aiConfig.ollama.model,
        temperature: 0.4,
      });

      logger.info(
        {
          baseUrl: aiConfig.ollama.baseUrl,
          model: aiConfig.ollama.model,
        },
        'Initialized Ollama provider for insight generation'
      );
    } else if (aiConfig.provider === 'mock') {
      this.model = {
        invoke: async () => ({ content: this.getMockResponse() }),
      };
    } else {
      throw new Error(`Unsupported AI provider: ${aiConfig.provider}`);
    }

    this.parser = StructuredOutputParser.fromZodSchema(LLMInsightOutputSchema);

    this.prompt = new PromptTemplate({
      template: `You are an expert CRM sales coach analyzing a user's pipeline health. Based on the data below, generate actionable insights that explain WHY items need attention and WHAT specific actions to take.

CRM DATA SNAPSHOT:

DEALS AT RISK (no interaction in 14+ days):
{dealsData}

HOT LEADS (score >= 80, not yet converted):
{leadsData}

OVERDUE TASKS: {overdueTasksCount}

STALE CONTACTS (30+ days without contact, with open opportunities):
{contactsData}

ANALYSIS INSTRUCTIONS:

1. For each flagged item, produce ONE insight explaining:
   - WHY it matters (not just "it's been X days" — explain the business impact)
   - WHAT specific action to take (not generic "follow up")
   - Confidence (0.7-0.95 for LLM analysis, based on data quality)

2. Insight types:
   - "warning": Deal/contact at risk — explain revenue impact
   - "opportunity": Hot lead — explain buying signals
   - "reminder": Overdue tasks — explain priority
   - "achievement": Everything looks good (only if no flagged items)

3. Priority levels:
   - "critical": Immediate action required (large deal, high-score lead)
   - "high": Action within 24 hours
   - "medium": Action within a week
   - "low": Informational

4. suggestedActions: Provide up to 3 specific, actionable steps

5. If no items are flagged, produce a single "achievement" insight

{format_instructions}`,
      inputVariables: ['dealsData', 'leadsData', 'overdueTasksCount', 'contactsData'],
      partialVariables: {
        format_instructions: this.parser.getFormatInstructions(),
      },
    });

    logger.info('Insight Generation Chain initialized');
  }

  /**
   * Generate insights from CRM data
   */
  async generateInsights(input: InsightGenerationInput): Promise<GeneratedInsight[]> {
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

      const validatedInput = InsightGenerationInputSchema.parse(input);

      const dealsData =
        validatedInput.dealsAtRisk.length > 0
          ? validatedInput.dealsAtRisk
              .map(
                (d) =>
                  `- ${d.name} (ID: ${d.id}): ${d.daysSinceUpdate} days since last update${d.stage ? `, stage: ${d.stage}` : ''}${d.value ? `, value: $${d.value.toLocaleString()}` : ''}`
              )
              .join('\n')
          : 'No deals at risk';

      const leadsData =
        validatedInput.hotLeads.length > 0
          ? validatedInput.hotLeads
              .map(
                (l) =>
                  `- ${l.name} (ID: ${l.id}): score ${l.score}${l.company ? `, company: ${l.company}` : ''}${l.status ? `, status: ${l.status}` : ''}`
              )
              .join('\n')
          : 'No hot leads';

      const contactsData =
        validatedInput.staleContacts.length > 0
          ? validatedInput.staleContacts
              .map(
                (c) =>
                  `- ${c.name} (ID: ${c.id}): ${c.daysSinceContact !== null ? `${c.daysSinceContact} days since last contact` : 'never contacted'}`
              )
              .join('\n')
          : 'No stale contacts';

      const formattedPrompt = await this.prompt.format({
        dealsData,
        leadsData,
        overdueTasksCount: String(validatedInput.overdueTasksCount),
        contactsData,
      });

      const response = await this.model.invoke(formattedPrompt);

      const parsed = await this.parser.parse(response.content as string);

      const executionTimeMs = Date.now() - startTime;

      // Record cost tracking
      if (aiConfig.costTracking.enabled) {
        costTracker.recordUsage({
          model: aiConfig.provider === 'openai' ? aiConfig.openai.model : aiConfig.ollama.model,
          inputTokens: 0,
          outputTokens: 0,
          operationType: 'insight_generation',
        });
      }

      logger.info(
        {
          insightCount: parsed.insights.length,
          executionTimeMs,
        },
        'Insight generation completed'
      );

      return parsed.insights.map((insight) => ({
        ...insight,
        confidence: Math.min(1, Math.max(0, insight.confidence)),
        suggestedActions: insight.suggestedActions.slice(0, 3),
      }));
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          executionTimeMs,
        },
        'Insight generation failed, using fallback heuristics'
      );

      return this.generateFallbackInsights(input);
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
          contact.daysSinceContact !== null
            ? `No interaction in ${contact.daysSinceContact} days. This contact has open opportunities.`
            : `Never contacted. This contact has open opportunities.`,
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

    if (insights.length === 0) {
      insights.push({
        entityId: null,
        entityType: null,
        type: 'achievement',
        title: "You're on track!",
        description: 'No urgent items need your attention. Keep up the great work!',
        suggestedActions: [],
        confidence: 0.4,
        priority: 'low',
        reasoning: 'Heuristic: no flagged items',
      });
    }

    return insights;
  }

  /**
   * Mock response for testing
   */
  private getMockResponse(): string {
    return JSON.stringify({
      insights: [
        {
          entityId: 'mock-deal-1',
          entityType: 'opportunity',
          type: 'warning',
          title: 'Deal at Risk: Enterprise License Renewal',
          description:
            'This high-value renewal has been dormant for 18 days. The client may be evaluating competitors.',
          suggestedActions: [
            'Schedule an executive check-in call within 24 hours',
            'Prepare a competitive value comparison document',
            'Offer a renewal incentive or early-bird discount',
          ],
          confidence: 0.85,
          priority: 'critical',
          reasoning:
            'High-value deal with extended inactivity suggests potential competitive evaluation',
        },
        {
          entityId: 'mock-lead-1',
          entityType: 'lead',
          type: 'opportunity',
          title: 'Hot Lead: Acme Corp',
          description:
            'This lead scored 92 and has visited pricing pages 3 times this week. Strong purchase intent.',
          suggestedActions: [
            'Send a personalized demo invitation',
            'Share relevant case studies',
            'Connect on LinkedIn for relationship building',
          ],
          confidence: 0.88,
          priority: 'high',
          reasoning: 'High score combined with pricing page visits indicates active evaluation',
        },
      ],
    });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let _insightGenerationChain: InsightGenerationChain | null = null;

export function getInsightGenerationChain(): InsightGenerationChain {
  if (!_insightGenerationChain) {
    _insightGenerationChain = new InsightGenerationChain();
  }
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
