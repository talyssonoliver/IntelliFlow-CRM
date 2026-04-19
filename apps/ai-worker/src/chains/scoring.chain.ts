import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { chainMonitor, withMonitoring } from '../monitoring/chain-monitor';
import type { MonitoredResult } from '../monitoring/chain-monitor';
import { leadScoreSchema } from '@intelliflow/validators';
import { requiresHumanReview } from '@intelliflow/domain';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { resolveRateLimit } from '../lib/tenant-ai-config.js';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
import pino from 'pino';

const logger = pino({
  name: 'scoring-chain',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Lead data input for scoring
 */
export const leadInputSchema = z.object({
  email: z.email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * Scoring result with confidence and reasoning
 */
export type ScoringResult = z.infer<typeof leadScoreSchema>;

/**
 * Lead Scoring Chain
 * Uses LangChain to score leads based on multiple factors with structured output
 */
export class LeadScoringChain {
  private readonly model: BaseChatModel;
  private structuredModel: { invoke(input: unknown): Promise<unknown> };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;

  /** Default prompt template used when no versioned config is available */
  private static readonly DEFAULT_PROMPT = `You are an expert lead scoring AI for a CRM system. Analyze the provided lead information and assign a score from 0-100 based on the lead's quality and conversion potential.

Consider the following factors:
1. Contact Information Completeness (0-25 points)
   - Email quality and domain
   - Phone number availability
   - Professional title
   - Company information

2. Engagement Indicators (0-25 points)
   - Source quality (direct website > referral > social > cold call)
   - Email domain (corporate email > free email)

3. Qualification Signals (0-25 points)
   - Job title indicates decision-making authority
   - Company size and industry indicators
   - Professional email domain

4. Data Quality (0-25 points)
   - Completeness of profile
   - Consistency of information
   - Recency indicators

Lead Information:
{lead_info}

Respond with a structured JSON object containing the score, confidence, factors, and modelVersion fields.`;

  constructor(options?: { tenantId?: string }) {
    this.tenantId = options?.tenantId;

    // Initialize LLM via factory — provider/tier routing handled centrally
    this.model = createLLM('scoring', 'free', {
      temperature: aiConfig.openai.temperature,
      maxTokens: aiConfig.openai.maxTokens,
      timeout: aiConfig.openai.timeout,
    });

    this.structuredModel = (this.model as any).withStructuredOutput(leadScoreSchema);

    // Define the scoring prompt (may be overridden per-tenant in scoreLead)
    this.prompt = new PromptTemplate({
      template: LeadScoringChain.DEFAULT_PROMPT,
      inputVariables: ['lead_info'],
    });
  }

  /**
   * Resolve the tenant-versioned prompt override (if any).
   * Falls back silently to the default prompt when no active version exists.
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const loader = getVersionLoader();
      const config = await loader.getChainConfig(CHAIN_TYPE_MAP.LEAD_SCORING, {
        tenantId: this.tenantId,
      });
      return config.prompt ?? null;
    } catch {
      logger.warn(
        {
          chainType: 'LEAD_SCORING',
          tenantId: this.tenantId,
          reason: 'no active version, using default',
        },
        'VersionLoader: failed to load versioned config'
      );
      return null;
    }
  }

  /**
   * Score a lead and return structured results
   */
  async scoreLead(lead: LeadInput): Promise<ScoringResult> {
    const startTime = Date.now();

    try {
      logger.info({ leadEmail: lead.email }, 'Starting lead scoring');

      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      if (this.tenantId) {
        const tenantModel = await createLLMForTenant('scoring', 'free', {
          tenantId: this.tenantId,
          temperature: aiConfig.openai.temperature,
          maxTokens: aiConfig.openai.maxTokens,
          timeout: aiConfig.openai.timeout,
        });
        this.structuredModel = (tenantModel as any).withStructuredOutput(leadScoreSchema);
      }

      // Format lead information for the prompt
      const leadInfo = this.formatLeadInfo(lead);

      // Resolve tenant-versioned prompt if tenantId is available; fall back to default
      const versionedPromptText = await this.resolveVersionedPrompt();
      const activePrompt = versionedPromptText
        ? new PromptTemplate({ template: versionedPromptText, inputVariables: ['lead_info'] })
        : this.prompt;

      // Generate the prompt
      const formattedPrompt = await activePrompt.format({
        lead_info: leadInfo,
      });

      // Wrap LLM call + parsing with monitoring (IFC-117)
      const monitoredConfig = chainMonitor.getConfig();
      const monitored: MonitoredResult<ScoringResult> = await withMonitoring(async () => {
        // Call the LLM with structured output — returns typed object directly
        const result = (await this.structuredModel.invoke(formattedPrompt)) as unknown as Omit<
          ScoringResult,
          'modelVersion'
        >;

        // Add model version
        return {
          ...result,
          modelVersion: `${aiConfig.provider}:scoring-free:v1`,
        };
      }, monitoredConfig);

      const scoringResult = monitored.result;
      const duration = Date.now() - startTime;

      // Fix #15: Check if result requires human review based on confidence threshold
      // and propagate the flag through the result object so callers can act on it.
      const needsReview = requiresHumanReview(scoringResult.confidence, 'LEAD_SCORING');

      logger.info(
        {
          leadEmail: lead.email,
          score: scoringResult.score,
          confidence: scoringResult.confidence,
          requiresHumanReview: needsReview,
          duration,
          monitoringMetrics: {
            operationId: monitored.metrics.operationId,
            latencyMs: monitored.metrics.latencyMs,
            driftScore: monitored.metrics.driftScore,
          },
        },
        'Lead scoring completed'
      );

      return { ...scoringResult, requiresReview: needsReview };
    } catch (error) {
      logger.error(
        {
          leadEmail: lead.email,
          error: error instanceof Error ? error.message : String(error),
        },
        'Lead scoring failed'
      );

      // Return a default low-confidence score on error
      return {
        score: 0,
        confidence: 0,
        factors: [
          {
            name: 'error',
            impact: 0,
            reasoning: `Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        modelVersion: 'error:v1',
      };
    }
  }

  /**
   * Batch score multiple leads
   */
  async scoreLeads(leads: LeadInput[]): Promise<ScoringResult[]> {
    logger.info({ count: leads.length }, 'Starting batch lead scoring');

    // Process leads sequentially to avoid rate limits
    // In production, consider using a queue system like BullMQ
    const results: ScoringResult[] = [];

    // P2.8 — resolve per-tenant rate limit once per batch; falls back to global default.
    const globalDefault = aiConfig.performance.rateLimitPerMinute ?? 60;
    const effectiveRateLimit = this.tenantId
      ? await resolveRateLimit(this.tenantId, 'scoring', globalDefault)
      : globalDefault;

    for (const lead of leads) {
      const result = await this.scoreLead(lead);
      results.push(result);

      if (effectiveRateLimit) {
        const delayMs = (60 * 1000) / effectiveRateLimit;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Format lead information for the prompt.
   * Sanitizes all user-provided string fields against prompt injection (Fix #12).
   */
  private formatLeadInfo(lead: LeadInput): string {
    const parts: string[] = [];

    if (lead.email) {
      const domain = lead.email.split('@')[1];
      parts.push(`Email Domain: ${domain}`);
      parts.push(`Has Email: Yes`);
    }

    if (lead.firstName || lead.lastName) {
      parts.push(`Has Name: Yes`);
    }

    if (lead.company) {
      parts.push(`Company: ${sanitizeStringField(lead.company, 500)}`);
    }

    if (lead.title) {
      parts.push(`Title: ${sanitizeStringField(lead.title, 500)}`);
    }

    if (lead.phone) {
      parts.push(`Phone: Available`);
    }

    parts.push(`Source: ${sanitizeStringField(lead.source, 500)}`);

    return parts.join('\n');
  }

  /**
   * Validate scoring result meets quality thresholds
   */
  validateScoringResult(result: ScoringResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check confidence threshold
    if (result.confidence < 0.5) {
      issues.push(`Low confidence score: ${result.confidence}`);
    }

    // Check if factors were provided
    if (result.factors.length === 0) {
      issues.push('No scoring factors provided');
    }

    // Check if factors have reasoning
    const factorsWithoutReasoning = result.factors.filter(
      (f) => !f.reasoning || f.reasoning.length < 10
    );
    if (factorsWithoutReasoning.length > 0) {
      issues.push(`${factorsWithoutReasoning.length} factors lack detailed reasoning`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

/**
 * Global scoring chain instance (lazy initialized)
 * Use getLeadScoringChain() to access when Ollama is configured
 */
let _leadScoringChain: LeadScoringChain | null = null;

/**
 * Get or create the global lead scoring chain instance
 * @throws Error if Ollama is not configured (provider='ollama' but no OpenAI API key)
 */
export function getLeadScoringChain(): LeadScoringChain {
  _leadScoringChain ??= new LeadScoringChain();
  return _leadScoringChain;
}

/**
 * Creates a new lead scoring chain proxy that lazily initializes
 * This allows the module to be imported without throwing
 */
function createLazyChainProxy(): LeadScoringChain {
  return new Proxy({} as LeadScoringChain, {
    get(_target, prop) {
      const chain = getLeadScoringChain();
      const value = (chain as any)[prop];
      return typeof value === 'function' ? value.bind(chain) : value;
    },
  });
}

/**
 * Global scoring chain instance
 * Note: This is lazily initialized - will throw on first method call if Ollama not available
 */
export const leadScoringChain = createLazyChainProxy();
