/**
 * Chain Utility Functions
 *
 * Pure functions extracted from AI chains for testability.
 * These functions contain business logic that doesn't require LLM calls.
 *
 * @module chains/chain-utils
 */

import { z } from 'zod';
import { leadScoreSchema } from '@intelliflow/validators';
import {
  SENTIMENT_LABELS,
  type SentimentLabel,
} from '@intelliflow/domain';

// =============================================================================
// Lead Scoring Utilities
// =============================================================================

/**
 * Lead data input for scoring
 */
export const leadInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * Scoring result with confidence and reasoning
 */
export type ScoringResult = z.infer<typeof leadScoreSchema>;

/**
 * Format lead information for the scoring prompt
 */
export function formatLeadInfo(lead: LeadInput): string {
  const parts: string[] = [];

  if (lead.email) {
    parts.push(`Email: ${lead.email}`);
    const domain = lead.email.split('@')[1];
    parts.push(`Email Domain: ${domain}`);
  }

  if (lead.firstName || lead.lastName) {
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    parts.push(`Name: ${name}`);
  }

  if (lead.company) {
    parts.push(`Company: ${lead.company}`);
  }

  if (lead.title) {
    parts.push(`Title: ${lead.title}`);
  }

  if (lead.phone) {
    parts.push(`Phone: Available`);
  }

  parts.push(`Source: ${lead.source}`);

  if (lead.metadata) {
    parts.push(`Additional Data: ${JSON.stringify(lead.metadata)}`);
  }

  return parts.join('\n');
}

/**
 * Validate scoring result meets quality thresholds
 */
export function validateScoringResult(result: ScoringResult): {
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

// =============================================================================
// Embedding Utilities
// =============================================================================

/**
 * Calculate cosine similarity between two embedding vectors
 * Returns value between -1 (opposite) and 1 (identical)
 */
export function calculateSimilarity(vector1: number[], vector2: number[]): number {
  if (vector1.length !== vector2.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] * vector1[i];
    magnitude2 += vector2[i] * vector2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Simple text chunking utility
 * Splits text into overlapping chunks for embedding
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;

    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Format embedding vector for pgvector insertion
 * pgvector expects array format: [0.1, 0.2, ...]
 */
export function formatForPgvector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Parse pgvector string to number array
 */
export function parseFromPgvector(pgvectorString: string): number[] {
  // Remove brackets and split by comma
  const cleaned = pgvectorString.replace(/[[\]]/g, '');
  return cleaned.split(',').map((val) => parseFloat(val.trim()));
}

// =============================================================================
// Sentiment Analysis Utilities
// =============================================================================

/**
 * Sentiment result for aggregation
 */
export interface SentimentResultForAggregation {
  sentiment: SentimentLabel;
  sentimentScore: number;
  confidence: number;
}

/**
 * Get aggregate sentiment for multiple analysis results
 */
export function aggregateSentiment(results: SentimentResultForAggregation[]): {
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

// =============================================================================
// RAG Context Utilities
// =============================================================================

/**
 * Context item for RAG formatting
 */
export interface ContextItemForFormatting {
  title: string;
  source: string;
  content: string;
  relevanceScore: number;
  citation: string;
}

/**
 * Estimate token count for context (rough approximation)
 * ~4 chars per token for English text
 */
export function estimateTokens(context: ContextItemForFormatting[]): number {
  const totalChars = context.reduce(
    (sum, item) => sum + item.content.length + item.title.length,
    0
  );
  return Math.ceil(totalChars / 4);
}

/**
 * Format context items for LLM prompt injection
 */
export function formatContextForPrompt(context: ContextItemForFormatting[]): string {
  if (context.length === 0) {
    return 'No relevant context found.';
  }

  const formatted = context.map((item, index) => {
    return `[${index + 1}] ${item.title}
Source: ${item.source}
Relevance: ${(item.relevanceScore * 100).toFixed(0)}%
${item.content}
Citation: ${item.citation}`;
  });

  return `RETRIEVED CONTEXT (${context.length} items):\n\n${formatted.join('\n\n---\n\n')}`;
}
