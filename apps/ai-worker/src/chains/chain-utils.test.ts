/**
 * Chain Utility Functions Tests
 *
 * Tests for pure functions extracted from AI chains.
 * These don't require external LLM services and can run in any environment.
 */

import { describe, it, expect } from 'vitest';
import {
  // Lead scoring utilities
  formatLeadInfo,
  validateScoringResult,
  type LeadInput,
  type ScoringResult,
  // Embedding utilities
  calculateSimilarity,
  chunkText,
  formatForPgvector,
  parseFromPgvector,
  // Sentiment utilities
  aggregateSentiment,
  type SentimentResultForAggregation,
  // RAG utilities
  estimateTokens,
  formatContextForPrompt,
  type ContextItemForFormatting,
} from './chain-utils';

// =============================================================================
// Lead Scoring Utilities Tests
// =============================================================================

describe('formatLeadInfo', () => {
  it('should format a complete lead profile', () => {
    const lead: LeadInput = {
      email: 'john.doe@acme.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'VP of Sales',
      phone: '+1-555-0123',
      source: 'WEBSITE',
      metadata: { industry: 'Technology' },
    };

    const result = formatLeadInfo(lead);

    expect(result).toContain('Email: john.doe@acme.com');
    expect(result).toContain('Email Domain: acme.com');
    expect(result).toContain('Name: John Doe');
    expect(result).toContain('Company: Acme Corp');
    expect(result).toContain('Title: VP of Sales');
    expect(result).toContain('Phone: Available');
    expect(result).toContain('Source: WEBSITE');
    expect(result).toContain('Additional Data:');
    expect(result).toContain('Technology');
  });

  it('should handle minimal lead data', () => {
    const lead: LeadInput = {
      email: 'test@gmail.com',
      source: 'COLD_CALL',
    };

    const result = formatLeadInfo(lead);

    expect(result).toContain('Email: test@gmail.com');
    expect(result).toContain('Email Domain: gmail.com');
    expect(result).toContain('Source: COLD_CALL');
    expect(result).not.toContain('Name:');
    expect(result).not.toContain('Company:');
  });

  it('should handle first name only', () => {
    const lead: LeadInput = {
      email: 'jane@example.com',
      firstName: 'Jane',
      source: 'REFERRAL',
    };

    const result = formatLeadInfo(lead);

    expect(result).toContain('Name: Jane');
  });

  it('should handle last name only', () => {
    const lead: LeadInput = {
      email: 'smith@example.com',
      lastName: 'Smith',
      source: 'WEBSITE',
    };

    const result = formatLeadInfo(lead);

    expect(result).toContain('Name: Smith');
  });
});

describe('validateScoringResult', () => {
  it('should validate a good scoring result', () => {
    const result: ScoringResult = {
      score: 85,
      confidence: 0.9,
      factors: [
        {
          name: 'Contact Completeness',
          impact: 25,
          reasoning: 'Complete contact information with corporate email and phone',
        },
      ],
      modelVersion: 'openai:gpt-4:v1',
    };

    const validation = validateScoringResult(result);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it('should flag low confidence results', () => {
    const result: ScoringResult = {
      score: 50,
      confidence: 0.3,
      factors: [
        {
          name: 'Data Quality',
          impact: 10,
          reasoning: 'Incomplete information provided',
        },
      ],
      modelVersion: 'openai:gpt-4:v1',
    };

    const validation = validateScoringResult(result);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some(issue => issue.includes('Low confidence'))).toBe(true);
  });

  it('should flag missing factors', () => {
    const result: ScoringResult = {
      score: 75,
      confidence: 0.8,
      factors: [],
      modelVersion: 'openai:gpt-4:v1',
    };

    const validation = validateScoringResult(result);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some(issue => issue.includes('No scoring factors'))).toBe(true);
  });

  it('should flag factors without detailed reasoning', () => {
    const result: ScoringResult = {
      score: 70,
      confidence: 0.8,
      factors: [
        {
          name: 'Quality',
          impact: 15,
          reasoning: 'Good',  // Too short
        },
      ],
      modelVersion: 'openai:gpt-4:v1',
    };

    const validation = validateScoringResult(result);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some(issue => issue.includes('lack detailed reasoning'))).toBe(true);
  });

  it('should detect multiple issues', () => {
    const result: ScoringResult = {
      score: 20,
      confidence: 0.2,
      factors: [],
      modelVersion: 'error:v1',
    };

    const validation = validateScoringResult(result);

    expect(validation.valid).toBe(false);
    expect(validation.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Embedding Utilities Tests
// =============================================================================

describe('calculateSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vector = [1, 2, 3, 4, 5];
    const similarity = calculateSimilarity(vector, vector);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const vector1 = [1, 2, 3];
    const vector2 = [-1, -2, -3];
    const similarity = calculateSimilarity(vector1, vector2);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const vector1 = [1, 0, 0];
    const vector2 = [0, 1, 0];
    const similarity = calculateSimilarity(vector1, vector2);
    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should handle zero vectors', () => {
    const zero = [0, 0, 0];
    const nonzero = [1, 2, 3];
    expect(calculateSimilarity(zero, nonzero)).toBe(0);
    expect(calculateSimilarity(nonzero, zero)).toBe(0);
    expect(calculateSimilarity(zero, zero)).toBe(0);
  });

  it('should throw for different dimensions', () => {
    const vector1 = [1, 2, 3];
    const vector2 = [1, 2];
    expect(() => calculateSimilarity(vector1, vector2)).toThrow('same dimensions');
  });

  it('should calculate similarity for realistic embedding vectors', () => {
    // Simulating two similar embeddings
    const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const vec2 = [0.15, 0.25, 0.35, 0.45, 0.55];
    const similarity = calculateSimilarity(vec1, vec2);
    expect(similarity).toBeGreaterThan(0.99); // Very similar vectors
  });
});

describe('chunkText', () => {
  it('should chunk text without overlap', () => {
    const text = 'ABCDEFGHIJ';
    const chunks = chunkText(text, 5, 0);
    expect(chunks).toEqual(['ABCDE', 'FGHIJ']);
  });

  it('should chunk text with overlap', () => {
    const text = 'ABCDEFGHIJ';
    const chunks = chunkText(text, 5, 2);
    // Overlap of 2: starts at 0, 3, 6, 9 -> chunks include trailing fragment
    expect(chunks).toEqual(['ABCDE', 'DEFGH', 'GHIJ', 'J']);
  });

  it('should handle text shorter than chunk size', () => {
    const text = 'ABC';
    const chunks = chunkText(text, 10, 2);
    expect(chunks).toEqual(['ABC']);
  });

  it('should handle empty text', () => {
    const chunks = chunkText('', 5, 2);
    expect(chunks).toEqual([]);
  });

  it('should handle text exactly equal to chunk size', () => {
    const text = 'ABCDE';
    const chunks = chunkText(text, 5, 0);
    expect(chunks).toEqual(['ABCDE']);
  });

  it('should handle large overlap', () => {
    const text = 'ABCDEFGH';
    const chunks = chunkText(text, 4, 3);
    // Each chunk advances by 1 character, includes trailing fragments
    expect(chunks).toEqual(['ABCD', 'BCDE', 'CDEF', 'DEFG', 'EFGH', 'FGH', 'GH', 'H']);
  });
});

describe('formatForPgvector', () => {
  it('should format vector as pgvector string', () => {
    const vector = [0.1, 0.2, 0.3];
    const result = formatForPgvector(vector);
    expect(result).toBe('[0.1,0.2,0.3]');
  });

  it('should handle empty vector', () => {
    const result = formatForPgvector([]);
    expect(result).toBe('[]');
  });

  it('should handle single element', () => {
    const result = formatForPgvector([0.5]);
    expect(result).toBe('[0.5]');
  });

  it('should handle scientific notation', () => {
    const vector = [1e-10, 1e10];
    const result = formatForPgvector(vector);
    expect(result).toContain('1e-10');
    expect(result).toContain('10000000000');
  });
});

describe('parseFromPgvector', () => {
  it('should parse pgvector string to array', () => {
    const pgvector = '[0.1,0.2,0.3]';
    const result = parseFromPgvector(pgvector);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('should handle spaces', () => {
    const pgvector = '[0.1, 0.2, 0.3]';
    const result = parseFromPgvector(pgvector);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('should handle empty vector', () => {
    const result = parseFromPgvector('[]');
    expect(result).toEqual([NaN]); // Empty string parses to NaN
  });

  it('should roundtrip with formatForPgvector', () => {
    const original = [0.123, 0.456, 0.789];
    const formatted = formatForPgvector(original);
    const parsed = parseFromPgvector(formatted);
    expect(parsed).toEqual(original);
  });
});

// =============================================================================
// Sentiment Utilities Tests
// =============================================================================

describe('aggregateSentiment', () => {
  it('should return neutral for empty array', () => {
    const result = aggregateSentiment([]);

    expect(result.avgScore).toBe(0);
    expect(result.overallSentiment).toBe('NEUTRAL');
    expect(result.avgConfidence).toBe(0);
    expect(result.distribution.NEUTRAL).toBe(0);
  });

  it('should calculate correct distribution', () => {
    const results: SentimentResultForAggregation[] = [
      { sentiment: 'POSITIVE', sentimentScore: 0.5, confidence: 0.8 },
      { sentiment: 'POSITIVE', sentimentScore: 0.6, confidence: 0.9 },
      { sentiment: 'NEUTRAL', sentimentScore: 0, confidence: 0.7 },
      { sentiment: 'NEGATIVE', sentimentScore: -0.4, confidence: 0.8 },
    ];

    const result = aggregateSentiment(results);

    expect(result.distribution.POSITIVE).toBe(2);
    expect(result.distribution.NEUTRAL).toBe(1);
    expect(result.distribution.NEGATIVE).toBe(1);
    expect(result.distribution.VERY_POSITIVE).toBe(0);
    expect(result.distribution.VERY_NEGATIVE).toBe(0);
  });

  it('should calculate correct averages', () => {
    const results: SentimentResultForAggregation[] = [
      { sentiment: 'POSITIVE', sentimentScore: 0.4, confidence: 0.8 },
      { sentiment: 'POSITIVE', sentimentScore: 0.6, confidence: 1.0 },
    ];

    const result = aggregateSentiment(results);

    expect(result.avgScore).toBeCloseTo(0.5, 5);
    expect(result.avgConfidence).toBeCloseTo(0.9, 5);
  });

  it('should determine VERY_POSITIVE overall sentiment', () => {
    const results: SentimentResultForAggregation[] = [
      { sentiment: 'VERY_POSITIVE', sentimentScore: 0.8, confidence: 0.9 },
      { sentiment: 'VERY_POSITIVE', sentimentScore: 0.9, confidence: 0.95 },
    ];

    const result = aggregateSentiment(results);

    expect(result.overallSentiment).toBe('VERY_POSITIVE');
  });

  it('should determine VERY_NEGATIVE overall sentiment', () => {
    const results: SentimentResultForAggregation[] = [
      { sentiment: 'VERY_NEGATIVE', sentimentScore: -0.8, confidence: 0.9 },
      { sentiment: 'VERY_NEGATIVE', sentimentScore: -0.9, confidence: 0.95 },
    ];

    const result = aggregateSentiment(results);

    expect(result.overallSentiment).toBe('VERY_NEGATIVE');
  });

  it('should handle mixed sentiment correctly', () => {
    const results: SentimentResultForAggregation[] = [
      { sentiment: 'VERY_POSITIVE', sentimentScore: 0.9, confidence: 0.9 },
      { sentiment: 'VERY_NEGATIVE', sentimentScore: -0.9, confidence: 0.9 },
    ];

    const result = aggregateSentiment(results);

    expect(result.avgScore).toBeCloseTo(0, 5);
    expect(result.overallSentiment).toBe('NEUTRAL');
  });
});

// =============================================================================
// RAG Utilities Tests
// =============================================================================

describe('estimateTokens', () => {
  it('should estimate tokens for context items', () => {
    const context: ContextItemForFormatting[] = [
      {
        title: 'Test Title',      // 10 chars
        source: 'documents',
        content: 'Test content here', // 17 chars
        relevanceScore: 0.9,
        citation: '[test]',
      },
    ];

    const tokens = estimateTokens(context);
    // (10 + 17) / 4 = 6.75 -> ceil = 7
    expect(tokens).toBe(7);
  });

  it('should return 0 for empty context', () => {
    const tokens = estimateTokens([]);
    expect(tokens).toBe(0);
  });

  it('should aggregate multiple items', () => {
    const context: ContextItemForFormatting[] = [
      {
        title: 'A'.repeat(40),    // 40 chars
        source: 'documents',
        content: 'B'.repeat(160), // 160 chars
        relevanceScore: 0.9,
        citation: '[1]',
      },
      {
        title: 'C'.repeat(40),    // 40 chars
        source: 'notes',
        content: 'D'.repeat(160), // 160 chars
        relevanceScore: 0.8,
        citation: '[2]',
      },
    ];

    const tokens = estimateTokens(context);
    // Total: (40+160) + (40+160) = 400 chars -> 400/4 = 100 tokens
    expect(tokens).toBe(100);
  });
});

describe('formatContextForPrompt', () => {
  it('should return placeholder for empty context', () => {
    const result = formatContextForPrompt([]);
    expect(result).toBe('No relevant context found.');
  });

  it('should format single context item', () => {
    const context: ContextItemForFormatting[] = [
      {
        title: 'CRM Guide',
        source: 'documents',
        content: 'Use CRM consistently for best results.',
        relevanceScore: 0.92,
        citation: '[Guide, Section 1]',
      },
    ];

    const result = formatContextForPrompt(context);

    expect(result).toContain('RETRIEVED CONTEXT (1 items)');
    expect(result).toContain('[1] CRM Guide');
    expect(result).toContain('Source: documents');
    expect(result).toContain('Relevance: 92%');
    expect(result).toContain('Use CRM consistently');
    expect(result).toContain('Citation: [Guide, Section 1]');
  });

  it('should format multiple context items with separators', () => {
    const context: ContextItemForFormatting[] = [
      {
        title: 'Item One',
        source: 'documents',
        content: 'First content.',
        relevanceScore: 0.9,
        citation: '[1]',
      },
      {
        title: 'Item Two',
        source: 'notes',
        content: 'Second content.',
        relevanceScore: 0.8,
        citation: '[2]',
      },
    ];

    const result = formatContextForPrompt(context);

    expect(result).toContain('RETRIEVED CONTEXT (2 items)');
    expect(result).toContain('[1] Item One');
    expect(result).toContain('[2] Item Two');
    expect(result).toContain('---'); // Separator
  });

  it('should round relevance score correctly', () => {
    const context: ContextItemForFormatting[] = [
      {
        title: 'Test',
        source: 'test',
        content: 'Content',
        relevanceScore: 0.856,
        citation: '[test]',
      },
    ];

    const result = formatContextForPrompt(context);

    expect(result).toContain('Relevance: 86%'); // Rounds to nearest integer
  });
});
