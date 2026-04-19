/**
 * Sentiment Analysis Chain (IFC-039)
 *
 * Analyzes sentiment in text content using LLM-based classification.
 * Provides multi-dimensional sentiment scoring with confidence metrics.
 *
 * Features:
 * - Multi-class sentiment classification (positive, neutral, negative)
 * - Emotion detection (joy, anger, fear, sadness, surprise)
 * - Urgency scoring for prioritization
 * - Structured output with reasoning
 *
 * @module chains/sentiment
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { resolveRateLimit } from '../lib/tenant-ai-config.js';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
import pino from 'pino';

// Import domain constants (DRY architecture compliance)
import {
  SENTIMENT_LABELS,
  EMOTION_LABELS,
  URGENCY_LEVELS,
  type SentimentLabel,
} from '@intelliflow/domain';

// Re-export for consumers
export { SENTIMENT_LABELS, EMOTION_LABELS, URGENCY_LEVELS } from '@intelliflow/domain';
export type { SentimentLabel, EmotionLabel, UrgencyLevel } from '@intelliflow/domain';

const logger = pino({
  name: 'sentiment-chain',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Sentiment analysis input schema
 */
export const sentimentInputSchema = z.object({
  text: z.string().min(1).max(10000),
  context: z.string().optional(),
  source: z
    .enum(['email', 'chat', 'note', 'ticket', 'call_transcript', 'other'])
    .optional()
    .default('other'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SentimentInput = z.infer<typeof sentimentInputSchema>;

/**
 * Sentiment analysis result schema
 */
export const sentimentResultSchema = z.object({
  // Core sentiment
  sentiment: z.enum(SENTIMENT_LABELS),
  sentimentScore: z.number().min(-1).max(1), // -1 = very negative, +1 = very positive

  // Emotions detected
  emotions: z.array(
    z.object({
      emotion: z.enum(EMOTION_LABELS),
      intensity: z.number().min(0).max(1),
    })
  ),
  primaryEmotion: z.enum(EMOTION_LABELS),

  // Business context
  urgency: z.enum(URGENCY_LEVELS),
  urgencyScore: z.number().min(0).max(1),

  // Key phrases
  keyPhrases: z.array(
    z.object({
      phrase: z.string(),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
    })
  ),

  // Confidence & reasoning
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),

  // Metadata
  textLength: z.number(),
  modelVersion: z.string(),
});

export type SentimentResult = z.infer<typeof sentimentResultSchema>;

/**
 * Output schema for LLM parsing (subset of sentimentResultSchema)
 * Excludes metadata fields that are added post-processing
 */
const llmOutputSchema = z.object({
  sentiment: z.enum(SENTIMENT_LABELS),
  sentimentScore: z.number(),
  emotions: z.array(
    z.object({
      emotion: z.enum(EMOTION_LABELS),
      intensity: z.number(),
    })
  ),
  primaryEmotion: z.enum(EMOTION_LABELS),
  urgency: z.enum(URGENCY_LEVELS),
  urgencyScore: z.number(),
  keyPhrases: z.array(
    z.object({
      phrase: z.string(),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
    })
  ),
  confidence: z.number(),
  reasoning: z.string(),
});

// =============================================================================
// Sentiment Analysis Chain
// =============================================================================

/**
 * LLM-based Sentiment Analysis Chain
 *
 * Analyzes text for sentiment, emotions, and urgency with structured output.
 */
export class SentimentAnalysisChain {
  private structuredModel: { invoke(input: unknown): Promise<unknown> };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;

  constructor(options?: { tenantId?: string }) {
    this.tenantId = options?.tenantId;

    // Initialize LLM via factory — provider/tier routing handled centrally
    const llm = createLLM('structured', 'free', {
      temperature: 0.1,
      maxTokens: 1000,
      timeout: aiConfig.openai.timeout,
    });
    this.structuredModel = (llm as any).withStructuredOutput(llmOutputSchema);

    // Define the analysis prompt
    this.prompt = new PromptTemplate({
      template: `You are an expert sentiment analyst for a CRM system. Analyze the following text for sentiment, emotions, and business urgency.

TEXT TO ANALYZE:
{text}

CONTEXT (if provided):
{context}

SOURCE TYPE: {source}

ANALYSIS INSTRUCTIONS:

1. SENTIMENT CLASSIFICATION:
   - VERY_POSITIVE: Enthusiastic, delighted, highly satisfied
   - POSITIVE: Satisfied, pleased, agreeable
   - NEUTRAL: Factual, informational, no clear emotion
   - NEGATIVE: Dissatisfied, concerned, unhappy
   - VERY_NEGATIVE: Angry, frustrated, threatening to leave

2. EMOTION DETECTION:
   - Identify 1-3 primary emotions from: JOY, TRUST, ANTICIPATION, SURPRISE, SADNESS, FEAR, ANGER, DISGUST, NEUTRAL
   - Rate intensity from 0.0 (barely detectable) to 1.0 (very strong)

3. URGENCY ASSESSMENT:
   - CRITICAL: Immediate action required, escalation threats
   - HIGH: Same-day response needed, significant concerns
   - MEDIUM: Response within 2-3 days acceptable
   - LOW: No time pressure, general inquiry
   - NONE: Purely informational, no action required

4. KEY PHRASES:
   - Extract 2-5 phrases that strongly indicate sentiment
   - Classify each phrase as positive, neutral, or negative

5. CONFIDENCE:
   - 0.9-1.0: Very clear sentiment signals
   - 0.7-0.9: Clear with some ambiguity
   - 0.5-0.7: Mixed signals
   - Below 0.5: Highly ambiguous

Respond with a structured JSON object containing sentiment, sentimentScore, emotions, primaryEmotion, urgency, urgencyScore, keyPhrases, confidence, and reasoning.`,
      inputVariables: ['text', 'context', 'source'],
    });

    logger.info('Sentiment Analysis Chain initialized');
  }

  /**
   * Resolve tenant-versioned prompt override (falls back to default on any error).
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const config = await getVersionLoader().getChainConfig(CHAIN_TYPE_MAP.SENTIMENT_ANALYSIS, {
        tenantId: this.tenantId,
      });
      return config.prompt ?? null;
    } catch {
      logger.warn(
        {
          chainType: 'SENTIMENT_ANALYSIS',
          tenantId: this.tenantId,
          reason: 'no active version, using default',
        },
        'VersionLoader: failed to load versioned config'
      );
      return null;
    }
  }

  /**
   * Analyze text for sentiment
   */
  async analyze(input: SentimentInput): Promise<SentimentResult> {
    const startTime = Date.now();

    try {
      logger.info(
        {
          textLength: input.text.length,
          source: input.source,
        },
        'Starting sentiment analysis'
      );

      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      if (this.tenantId) {
        const tenantModel = await createLLMForTenant('structured', 'free', {
          tenantId: this.tenantId,
          temperature: 0.1,
          maxTokens: 1000,
          timeout: aiConfig.openai.timeout,
        });
        this.structuredModel = (tenantModel as any).withStructuredOutput(llmOutputSchema);
      }

      // Validate input
      const validatedInput = sentimentInputSchema.parse(input);

      // Resolve tenant-versioned prompt if tenantId is available; fall back to default
      const versionedText = await this.resolveVersionedPrompt();
      const activePrompt = versionedText
        ? new PromptTemplate({
            template: versionedText,
            inputVariables: this.prompt.inputVariables,
          })
        : this.prompt;

      // Generate the prompt
      const formattedPrompt = await activePrompt.format({
        text: validatedInput.text,
        context: validatedInput.context || 'No additional context provided',
        source: validatedInput.source,
      });

      // Call the LLM with structured output — returns typed object directly
      const parsed = (await this.structuredModel.invoke(formattedPrompt)) as {
        sentiment: (typeof SENTIMENT_LABELS)[number];
        sentimentScore: number;
        emotions: Array<{ emotion: (typeof EMOTION_LABELS)[number]; intensity: number }>;
        primaryEmotion: (typeof EMOTION_LABELS)[number];
        urgency: (typeof URGENCY_LEVELS)[number];
        urgencyScore: number;
        keyPhrases: Array<{ phrase: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
        confidence: number;
        reasoning: string;
      };

      const result: SentimentResult = {
        sentiment: parsed.sentiment,
        sentimentScore: parsed.sentimentScore,
        emotions: parsed.emotions,
        primaryEmotion: parsed.primaryEmotion,
        urgency: parsed.urgency,
        urgencyScore: parsed.urgencyScore,
        keyPhrases: parsed.keyPhrases,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        textLength: validatedInput.text.length,
        modelVersion: `structured-free:sentiment:v1`,
      };

      const duration = Date.now() - startTime;

      logger.info(
        {
          sentiment: result.sentiment,
          confidence: result.confidence,
          urgency: result.urgency,
          duration,
        },
        'Sentiment analysis completed'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          textLength: input.text.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Sentiment analysis failed'
      );

      // Return a neutral fallback on error
      return {
        sentiment: 'NEUTRAL',
        sentimentScore: 0,
        emotions: [{ emotion: 'NEUTRAL', intensity: 0.5 }],
        primaryEmotion: 'NEUTRAL',
        urgency: 'MEDIUM',
        urgencyScore: 0.5,
        keyPhrases: [],
        confidence: 0,
        reasoning: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        textLength: input.text.length,
        modelVersion: 'error:v1',
      };
    }
  }

  /**
   * Batch analyze multiple texts
   */
  async analyzeBatch(inputs: SentimentInput[]): Promise<SentimentResult[]> {
    logger.info({ count: inputs.length }, 'Starting batch sentiment analysis');

    const results: SentimentResult[] = [];

    // P2.8 — resolve per-tenant rate limit once per batch; falls back to global default.
    const globalDefault = aiConfig.performance.rateLimitPerMinute ?? 60;
    const effectiveRateLimit = this.tenantId
      ? await resolveRateLimit(this.tenantId, 'scoring', globalDefault)
      : globalDefault;

    for (const input of inputs) {
      const result = await this.analyze(input);
      results.push(result);

      if (effectiveRateLimit) {
        const delayMs = (60 * 1000) / effectiveRateLimit;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Get aggregate sentiment for multiple texts
   */
  aggregateSentiment(results: SentimentResult[]): {
    avgScore: number;
    distribution: Record<SentimentLabel, number>;
    overallSentiment: SentimentLabel;
    avgConfidence: number;
  } {
    if (results.length === 0) {
      return {
        avgScore: 0,
        distribution: {
          VERY_POSITIVE: 0,
          POSITIVE: 0,
          NEUTRAL: 0,
          NEGATIVE: 0,
          VERY_NEGATIVE: 0,
        },
        overallSentiment: 'NEUTRAL',
        avgConfidence: 0,
      };
    }

    // Calculate distribution
    const distribution = SENTIMENT_LABELS.reduce(
      (acc, label) => {
        acc[label] = results.filter((r) => r.sentiment === label).length;
        return acc;
      },
      {} as Record<SentimentLabel, number>
    );

    // Calculate averages
    const avgScore = results.reduce((sum, r) => sum + r.sentimentScore, 0) / results.length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    // Determine overall sentiment from average score
    let overallSentiment: SentimentLabel;
    if (avgScore >= 0.6) overallSentiment = 'VERY_POSITIVE';
    else if (avgScore >= 0.2) overallSentiment = 'POSITIVE';
    else if (avgScore >= -0.2) overallSentiment = 'NEUTRAL';
    else if (avgScore >= -0.6) overallSentiment = 'NEGATIVE';
    else overallSentiment = 'VERY_NEGATIVE';

    return {
      avgScore,
      distribution,
      overallSentiment,
      avgConfidence,
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Lazy-initialized sentiment analysis chain
 */
let _sentimentChain: SentimentAnalysisChain | null = null;

export function getSentimentChain(): SentimentAnalysisChain {
  _sentimentChain ??= new SentimentAnalysisChain();
  return _sentimentChain;
}

/**
 * Lazy proxy for global access
 */
function createLazySentimentProxy(): SentimentAnalysisChain {
  return new Proxy({} as SentimentAnalysisChain, {
    get(_target, prop) {
      const chain = getSentimentChain();
      const value = (chain as any)[prop];
      return typeof value === 'function' ? value.bind(chain) : value;
    },
  });
}

export const sentimentChain = createLazySentimentProxy();
