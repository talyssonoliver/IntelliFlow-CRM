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

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import pino from 'pino';

// Import domain constants (DRY architecture compliance)
import {
  SENTIMENT_LABELS,
  EMOTION_LABELS,
  URGENCY_LEVELS,
  type SentimentLabel,
  type EmotionLabel,
  type UrgencyLevel,
} from '@intelliflow/domain';

// Re-export for consumers
export { SENTIMENT_LABELS, EMOTION_LABELS, URGENCY_LEVELS };
export type { SentimentLabel, EmotionLabel, UrgencyLevel };

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
  source: z.enum(['email', 'chat', 'note', 'ticket', 'call_transcript', 'other']).optional().default('other'),
  metadata: z.record(z.unknown()).optional(),
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
  emotions: z.array(z.object({
    emotion: z.enum(EMOTION_LABELS),
    intensity: z.number().min(0).max(1),
  })),
  primaryEmotion: z.enum(EMOTION_LABELS),

  // Business context
  urgency: z.enum(URGENCY_LEVELS),
  urgencyScore: z.number().min(0).max(1),

  // Key phrases
  keyPhrases: z.array(z.object({
    phrase: z.string(),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
  })),

  // Confidence & reasoning
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),

  // Metadata
  textLength: z.number(),
  modelVersion: z.string(),
});

export type SentimentResult = z.infer<typeof sentimentResultSchema>;

// =============================================================================
// Sentiment Analysis Chain
// =============================================================================

/**
 * LLM-based Sentiment Analysis Chain
 *
 * Analyzes text for sentiment, emotions, and urgency with structured output.
 */
export class SentimentAnalysisChain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly parser: StructuredOutputParser<any>;
  private readonly prompt: PromptTemplate;

  constructor() {
    // Initialize the appropriate model
    if (aiConfig.provider === 'openai') {
      this.model = new ChatOpenAI({
        modelName: aiConfig.openai.model,
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 1000,
        timeout: aiConfig.openai.timeout,
        openAIApiKey: aiConfig.openai.apiKey,
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
                      operationType: 'sentiment_analysis',
                    });
                  }
                },
              },
            ]
          : undefined,
      });
    } else if (aiConfig.provider === 'mock') {
      this.model = {
        invoke: async () => ({ content: this.getMockResponse() }),
      };
    } else {
      throw new Error(`Provider ${aiConfig.provider} not supported for sentiment analysis`);
    }

    // Create structured output parser
    const outputSchema = z.object({
      sentiment: z.enum(SENTIMENT_LABELS),
      sentimentScore: z.number(),
      emotions: z.array(z.object({
        emotion: z.enum(EMOTION_LABELS),
        intensity: z.number(),
      })),
      primaryEmotion: z.enum(EMOTION_LABELS),
      urgency: z.enum(URGENCY_LEVELS),
      urgencyScore: z.number(),
      keyPhrases: z.array(z.object({
        phrase: z.string(),
        sentiment: z.enum(['positive', 'neutral', 'negative']),
      })),
      confidence: z.number(),
      reasoning: z.string(),
    });

    this.parser = StructuredOutputParser.fromZodSchema(outputSchema);

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

{format_instructions}`,
      inputVariables: ['text', 'context', 'source'],
      partialVariables: {
        format_instructions: this.parser.getFormatInstructions(),
      },
    });

    logger.info('Sentiment Analysis Chain initialized');
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

      // Validate input
      const validatedInput = sentimentInputSchema.parse(input);

      // Generate the prompt
      const formattedPrompt = await this.prompt.format({
        text: validatedInput.text,
        context: validatedInput.context || 'No additional context provided',
        source: validatedInput.source,
      });

      // Call the LLM
      const response = await this.model.invoke(formattedPrompt);

      // Parse the structured output
      const parsed = await this.parser.parse(response.content as string) as {
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
        modelVersion: `${aiConfig.provider}:sentiment:v1`,
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

    for (const input of inputs) {
      const result = await this.analyze(input);
      results.push(result);

      // Rate limiting
      if (aiConfig.performance.rateLimitPerMinute) {
        const delayMs = (60 * 1000) / aiConfig.performance.rateLimitPerMinute;
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
    const distribution = SENTIMENT_LABELS.reduce((acc, label) => {
      acc[label] = results.filter(r => r.sentiment === label).length;
      return acc;
    }, {} as Record<SentimentLabel, number>);

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

  /**
   * Mock response for testing
   */
  private getMockResponse(): string {
    return JSON.stringify({
      sentiment: 'POSITIVE',
      sentimentScore: 0.7,
      emotions: [
        { emotion: 'TRUST', intensity: 0.8 },
        { emotion: 'ANTICIPATION', intensity: 0.6 },
      ],
      primaryEmotion: 'TRUST',
      urgency: 'MEDIUM',
      urgencyScore: 0.4,
      keyPhrases: [
        { phrase: 'looking forward to working together', sentiment: 'positive' },
        { phrase: 'excited about the opportunity', sentiment: 'positive' },
      ],
      confidence: 0.85,
      reasoning: 'The text shows positive engagement with forward-looking language and trust signals.',
    });
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
  if (!_sentimentChain) {
    _sentimentChain = new SentimentAnalysisChain();
  }
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
