import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import { PromptTemplate } from '@langchain/core/prompts';
import { BUILTIN_CHAIN_TEMPLATES } from '@intelliflow/application';
import { recordedChainRun } from '../monitoring/chain-run-recorder.js';
import { z } from 'zod';
import { aiConfig, resolvePricingKey, type AIProvider } from '../config/ai.config';
import { chainMonitor, withMonitoring } from '../monitoring/chain-monitor';
import type { MonitoredResult, MonitoringContext, TokenUsage } from '../monitoring/chain-monitor';
import { classifyError, recordInference } from '../monitoring/otel-ai-metrics';
import { leadScoreSchema } from '@intelliflow/validators';
import { requiresHumanReview } from '@intelliflow/domain';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { resolveRateLimit, resolveEffectiveTier } from '../lib/tenant-ai-config.js';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
import { usableVersionedPrompt } from '../versioning/versioned-prompt';
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
  /**
   * The lead's engagement history as prompt lines (lib/lead-activity-context.ts): status, last
   * contact, pipeline stage, counts and recent activities. Already sanitized.
   */
  activity: z.string().max(8000).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * Scoring result with confidence and reasoning
 */
export type ScoringResult = z.infer<typeof leadScoreSchema>;

/**
 * The model answered in the right shape but gave no usable score: confidence 0, or no factors.
 * #1218: such an answer was stored as a real score of 0 and could auto-disqualify the lead.
 */
export class ScoringInconclusiveError extends Error {
  readonly reason: 'ZERO_CONFIDENCE' | 'NO_FACTORS';
  /** An expected outcome, not a fault: monitoring logs it as a warning (chain-monitor). */
  readonly expected = true;
  constructor(reason: 'ZERO_CONFIDENCE' | 'NO_FACTORS') {
    super(`Model gave no usable score (${reason})`);
    this.name = 'ScoringInconclusiveError';
    this.reason = reason;
  }
}

/** Throws ScoringInconclusiveError when a parsed answer carries no usable score. */
export function assertUsableScore(result: { confidence?: unknown; factors?: unknown }): void {
  if (typeof result.confidence !== 'number' || !(result.confidence > 0)) {
    throw new ScoringInconclusiveError('ZERO_CONFIDENCE');
  }
  if (!Array.isArray(result.factors) || result.factors.length === 0) {
    throw new ScoringInconclusiveError('NO_FACTORS');
  }
}

/**
 * Loggable facts about a scoring failure, without any value from the lead or the answer:
 * the inconclusive reason, or for a schema error the paths and codes of the failing fields.
 */
export function scoringFailureShape(error: unknown): Record<string, unknown> {
  if (error instanceof ScoringInconclusiveError) return { inconclusive: error.reason };
  const issues = (error as { issues?: unknown } | null)?.issues;
  if (Array.isArray(issues)) {
    return {
      schemaIssues: issues.slice(0, 10).map((issue) => {
        const i = issue as { path?: unknown; code?: unknown };
        return {
          path: Array.isArray(i.path) ? i.path.join('.') : undefined,
          code: typeof i.code === 'string' ? i.code : undefined,
        };
      }),
    };
  }
  const llmOutput = (error as { llmOutput?: unknown } | null)?.llmOutput;
  return typeof llmOutput === 'string' ? { rawOutputLength: llmOutput.length } : {};
}

/**
 * Captures LLM token usage from LangChain callbacks so withMonitoring() can
 * compute a real tokenCost (IFC-215). Usage metadata lives in the callback
 * because withStructuredOutput().invoke() returns only the parsed output.
 */
export class TokenUsageCallbackHandler extends BaseCallbackHandler {
  name = 'TokenUsageCallbackHandler';
  private captured: TokenUsage | null = null;
  private readonly modelName: string;
  private readonly provider: AIProvider | undefined;
  private invokedModel: string | undefined;

  /**
   * @param modelName The pricing alias (`scoring-<tier>`) used when the served model is unknown.
   * @param provider  The provider serving the call; Ollama runs locally and costs nothing.
   */
  constructor(modelName: string, provider?: AIProvider) {
    super();
    this.modelName = modelName;
    this.provider = provider;
  }

  handleChatModelStart(
    _llm: unknown,
    _messages: unknown,
    _runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): void {
    const params = extraParams?.['invocation_params'] as { model?: unknown } | undefined;
    if (typeof params?.model === 'string') this.invokedModel = params.model;
  }

  /**
   * Price what actually served the call, like usage-metering.ts: a free model costs 0 and a known
   * served deployment uses its own pricing key. The label stays bounded: a MODEL_PRICING key or
   * the alias, never the raw served name.
   */
  private pricingFor(served: string | undefined): Pick<TokenUsage, 'model' | 'free'> {
    // Provider model ids are case-insensitive: `:FREE` is still the free variant.
    const isFreeModel = [served, this.invokedModel].some((name) =>
      name?.trim().toLowerCase().endsWith(':free')
    );
    if (this.provider === 'ollama' || isFreeModel) return { model: this.modelName, free: true };
    const key = resolvePricingKey(served);
    if (key) return { model: key, free: false };
    return { model: this.modelName, free: false };
  }

  handleLLMEnd(output: LLMResult): void {
    // Accept both tokenUsage (standard path) and estimatedTokenUsage (Responses API / streaming
    // fallback path used by @langchain/openai on streaming responses).
    type TokenCounts = { promptTokens?: number; completionTokens?: number };
    const usage =
      (output.llmOutput?.tokenUsage as TokenCounts | undefined) ??
      (output.llmOutput?.estimatedTokenUsage as TokenCounts | undefined);
    if (usage) {
      const generation = output.generations?.[0]?.[0] as
        | { message?: { response_metadata?: { model_name?: unknown } } }
        | undefined;
      const served = generation?.message?.response_metadata?.model_name;
      this.captured = {
        inputTokens: usage.promptTokens ?? 0,
        outputTokens: usage.completionTokens ?? 0,
        ...this.pricingFor(typeof served === 'string' ? served : undefined),
      };
    }
  }

  /**
   * A response that completed but was unusable (a Claude refusal or cut-off answer) never
   * reaches handleLLMEnd, yet it was billed. Its error carries the usage as `billedResult`
   * (AnthropicIncompleteResponseError), so chain monitoring still records that spend once.
   */
  handleLLMError(err: unknown): void {
    const billed = (err as { billedResult?: BilledResult } | null)?.billedResult;
    const usage = billed?.usage_metadata;
    if (!usage) return;
    const served = billed.response_metadata?.model_name;
    this.captured = {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      ...this.pricingFor(typeof served === 'string' ? served : undefined),
    };
  }

  getUsage(): TokenUsage | null {
    return this.captured;
  }
}

/** The usage a provider error carries for a billed response (see handleLLMError). */
interface BilledResult {
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
  response_metadata?: { model_name?: unknown };
}

/**
 * Lead Scoring Chain
 * Uses LangChain to score leads based on multiple factors with structured output
 */
export class LeadScoringChain {
  private readonly model: BaseChatModel;
  private structuredModel: {
    invoke(input: unknown, options?: { callbacks?: unknown[] }): Promise<unknown>;
  };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;
  /** Optional provider override (job-level fallback, #324). */
  private readonly provider?: AIProvider;
  /** false on the job-level fallback chain so a provider switch is not read as drift (IFC-117). */
  private readonly recordDrift: boolean;

  /** Default prompt template used when no versioned config is available */
  static readonly DEFAULT_PROMPT = BUILTIN_CHAIN_TEMPLATES.LEAD_SCORING;

  constructor(options?: { tenantId?: string; provider?: AIProvider; recordDrift?: boolean }) {
    this.tenantId = options?.tenantId;
    this.provider = options?.provider;
    this.recordDrift = options?.recordDrift ?? true;

    // Initialize LLM via factory — provider/tier routing handled centrally
    this.model = createLLM('scoring', 'free', {
      temperature: aiConfig.openai.temperature,
      maxTokens: aiConfig.openai.maxTokens,
      timeout: aiConfig.openai.timeout,
      provider: this.provider,
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
   * Falls back to the default prompt when no version exists, or when the loader's prompt has
   * no {lead_info} slot (the loader's own fallback has none: the model then saw no lead).
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const loader = getVersionLoader();
      const config = await loader.getChainConfig(CHAIN_TYPE_MAP.LEAD_SCORING, {
        tenantId: this.tenantId,
      });
      return usableVersionedPrompt('LEAD_SCORING', config.prompt, ['lead_info']);
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
  async scoreLead(lead: LeadInput, options: { leadId?: string } = {}): Promise<ScoringResult> {
    // Logs identify the lead by id, never by email or other contact data (IFC-117 NF-002).
    const { leadId } = options;
    const startTime = Date.now();
    // withMonitoring counts its own failures; errors before it are counted in the catch below.
    let monitoredCallStarted = false;

    try {
      logger.info({ leadId }, 'Starting lead scoring');

      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      // Capture the effective tier so monitoring uses the correct pricing key (IFC-215 AC-004).
      let effectiveTierLabel = 'free';
      if (this.tenantId) {
        const resolved = await resolveEffectiveTier(this.tenantId, 'scoring', 'free');
        effectiveTierLabel = resolved.tier;
        const tenantModel = await createLLMForTenant('scoring', resolved.tier, {
          tenantId: this.tenantId,
          temperature: aiConfig.openai.temperature,
          maxTokens: aiConfig.openai.maxTokens,
          timeout: aiConfig.openai.timeout,
          provider: this.provider,
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

      // Wrap LLM call + parsing with monitoring (IFC-117, IFC-215)
      const monitoredConfig = chainMonitor.getConfig();
      // Use the logical pricing key (tier-aware) so calculateCost() matches the pricing table
      // (IFC-215 AC-004). The full versioned string is stored in modelVersion for audit tracing.
      const costModelKey = `scoring-${effectiveTierLabel}`;
      // The provider that actually served this call (a fallback chain overrides the global one).
      const modelVersion = `${this.provider ?? aiConfig.provider}:${costModelKey}:v1`;
      const usageHandler = new TokenUsageCallbackHandler(
        costModelKey,
        this.provider ?? aiConfig.provider
      );
      const monitoringContext: MonitoringContext = {
        modelName: costModelKey,
        chain: 'lead_scoring',
        valueType: 'lead_scored',
        recordDrift: this.recordDrift,
        getUsage: () => usageHandler.getUsage(),
        // The prompt the model saw (rubric + sanitized lead text): the reasoning is written
        // against the rubric, so grounding it in the lead fields alone flagged correct output
        // (IFC-117 alert, 2026-11-01). The checker keeps only a hash of it.
        inputContext: formattedPrompt,
        extractText: (r: unknown): string | null => {
          // leadScoreSchema nests reasoning inside factors[].reasoning (not top-level)
          if (r && typeof r === 'object' && 'factors' in r) {
            const factors = (r as { factors?: unknown[] }).factors;
            if (Array.isArray(factors)) {
              const lines = factors
                .map((f) => {
                  if (
                    f &&
                    typeof f === 'object' &&
                    'reasoning' in f &&
                    typeof (f as { reasoning: unknown }).reasoning === 'string'
                  ) {
                    const factor = f as { name?: unknown; reasoning: string };
                    const label = typeof factor.name === 'string' ? `${factor.name}: ` : '';
                    return `${label}${factor.reasoning}`;
                  }
                  return null;
                })
                .filter((line): line is string => line !== null);
              return lines.length > 0 ? lines.join('\n') : null;
            }
          }
          return null;
        },
      };
      monitoredCallStarted = true;
      const monitored: MonitoredResult<ScoringResult> = await withMonitoring(
        async () => {
          // Call the LLM with structured output; usageHandler captures token usage via callback
          const result = (await recordedChainRun('LEAD_SCORING', this.tenantId, (callbacks) =>
            this.structuredModel.invoke(formattedPrompt, {
              callbacks: [usageHandler, ...callbacks],
            })
          )) as unknown as Omit<ScoringResult, 'modelVersion'>;

          // #1218: a schema-valid answer can still be no score at all (the model answered
          // confidence 0, or gave no factors). That is a failed scoring, not a score of 0, and
          // it throws here, inside the monitored call, so no ROI value is booked for it.
          assertUsableScore(result);

          // Add model version (versioned string for audit; costModelKey used for pricing above)
          return {
            ...result,
            modelVersion,
          };
        },
        monitoredConfig,
        monitoringContext
      );

      const scoringResult = monitored.result;
      const duration = Date.now() - startTime;

      // Fix #15: Check if result requires human review based on confidence threshold
      // and propagate the flag through the result object so callers can act on it.
      const needsReview = requiresHumanReview(scoringResult.confidence, 'LEAD_SCORING');

      logger.info(
        {
          leadId,
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
      if (!monitoredCallStarted) {
        // Tenant tier, LLM creation or prompt preparation failed before the monitored call.
        recordInference({
          model: undefined,
          chain: 'lead_scoring',
          outcome: 'error',
          latencyMs: Date.now() - startTime,
        });
      }
      // The class and shape only, never the message: an error can echo lead text (NF-002).
      // An inconclusive answer is an expected outcome (the model answered, with no usable
      // score), so it is a warning with its reason; anything else is a fault.
      const failure = { leadId, errorClass: classifyError(error), ...scoringFailureShape(error) };
      if (error instanceof ScoringInconclusiveError) {
        logger.warn(failure, 'Lead scoring inconclusive: the model gave no usable score');
      } else {
        logger.error(failure, 'Lead scoring failed');
      }

      // #1218: a failure is never returned as a score of 0. It propagates, so the job can try
      // the fallback provider and, if that fails too, report the scoring as FAILED.
      throw error;
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

    // The engagement history, built and sanitized by lib/lead-activity-context.ts.
    if (lead.activity) parts.push(lead.activity);

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
