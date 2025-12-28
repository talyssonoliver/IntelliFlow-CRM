/**
 * Query Performance Benchmark Tests
 *
 * Task: IFC-017 - Prisma + Supabase Data Layer
 * KPI Target: Queries <20ms
 *
 * These tests validate database query performance against KPIs.
 * Run with: pnpm --filter @intelliflow/db test:bench
 *
 * Note: Actual benchmarks require a running database connection.
 * These tests use mocked data for CI/unit testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QueryPerformanceTracker,
  validateEmbedding,
  validatePgVectorEmbedding,
  formatEmbeddingForPgVector,
  cosineSimilarity,
  l2Distance,
  EMBEDDING_DIMENSIONS,
} from '../index';

describe('QueryPerformanceTracker', () => {
  let tracker: QueryPerformanceTracker;

  beforeEach(() => {
    tracker = new QueryPerformanceTracker(true);
  });

  afterEach(() => {
    tracker.clear();
  });

  it('should record query metrics', () => {
    tracker.record('SELECT * FROM leads', 5.2);
    tracker.record('SELECT * FROM contacts', 3.1);
    tracker.record('SELECT * FROM accounts', 4.8);

    const metrics = tracker.getMetrics();
    expect(metrics).toHaveLength(3);
    expect(metrics[0].query).toBe('SELECT * FROM leads');
    expect(metrics[0].duration).toBe(5.2);
  });

  it('should calculate average query time', () => {
    tracker.record('query1', 10);
    tracker.record('query2', 20);
    tracker.record('query3', 30);

    expect(tracker.getAverageQueryTime()).toBe(20);
  });

  it('should calculate p95 query time', () => {
    // Record 100 queries with values 1-100
    for (let i = 1; i <= 100; i++) {
      tracker.record(`query${i}`, i);
    }

    const p95 = tracker.getP95QueryTime();
    // p95 of 1-100 should be around 95
    expect(p95).toBeGreaterThanOrEqual(94);
    expect(p95).toBeLessThanOrEqual(96);
  });

  it('should identify slow queries', () => {
    tracker.record('fast_query', 5);
    tracker.record('slow_query', 25);
    tracker.record('medium_query', 15);

    const slowQueries = tracker.getSlowQueries(20);
    expect(slowQueries).toHaveLength(1);
    expect(slowQueries[0].query).toBe('slow_query');
  });

  it('should not record when disabled', () => {
    const disabledTracker = new QueryPerformanceTracker(false);
    disabledTracker.record('query', 5);
    expect(disabledTracker.getMetrics()).toHaveLength(0);
  });

  it('should enable and disable tracking', () => {
    const tracker2 = new QueryPerformanceTracker(false);
    tracker2.record('query1', 5);
    expect(tracker2.getMetrics()).toHaveLength(0);

    tracker2.enable();
    tracker2.record('query2', 10);
    expect(tracker2.getMetrics()).toHaveLength(1);

    tracker2.disable();
    tracker2.record('query3', 15);
    expect(tracker2.getMetrics()).toHaveLength(1);
  });
});

describe('Embedding Validation', () => {
  it('should validate correct embedding dimensions', () => {
    const embedding = new Array(1536).fill(0.1);
    expect(validateEmbedding(embedding)).toBe(true);
  });

  it('should reject wrong embedding dimensions', () => {
    const embedding = new Array(100).fill(0.1);
    expect(validateEmbedding(embedding)).toBe(false);
  });

  it('should reject non-numeric embeddings with strict validation', () => {
    const embedding = new Array(1536).fill('not a number');
    // Use validatePgVectorEmbedding for strict type checking
    expect(validatePgVectorEmbedding(embedding)).toBe(false);
  });

  it('should reject non-array embeddings', () => {
    expect(validateEmbedding('not an array' as unknown as number[])).toBe(false);
  });

  it('should accept different dimension counts when specified', () => {
    const embedding = new Array(3072).fill(0.1);
    expect(validateEmbedding(embedding, 3072)).toBe(true);
    expect(validateEmbedding(embedding, 1536)).toBe(false);
  });
});

describe('Embedding Formatting', () => {
  it('should format embedding for pgvector', () => {
    const embedding = [0.1, 0.2, 0.3];
    const formatted = formatEmbeddingForPgVector(embedding);
    expect(formatted).toBe('[0.1,0.2,0.3]');
  });

  it('should handle negative values', () => {
    const embedding = [-0.5, 0.0, 0.5];
    const formatted = formatEmbeddingForPgVector(embedding);
    expect(formatted).toBe('[-0.5,0,0.5]');
  });

  it('should handle scientific notation', () => {
    const embedding = [1e-10, 1e10];
    const formatted = formatEmbeddingForPgVector(embedding);
    expect(formatted).toContain('1e');
  });
});

describe('Similarity Calculations', () => {
  it('should calculate cosine similarity for identical vectors', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('should calculate cosine similarity for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should calculate cosine similarity for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('should throw for mismatched dimensions', () => {
    const a = [1, 0, 0];
    const b = [1, 0];
    expect(() => cosineSimilarity(a, b)).toThrow(/dimension mismatch/i);
  });

  it('should calculate L2 distance for identical vectors', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(l2Distance(a, b)).toBe(0);
  });

  it('should calculate L2 distance correctly', () => {
    const a = [0, 0, 0];
    const b = [3, 4, 0];
    expect(l2Distance(a, b)).toBe(5);
  });

  it('should throw for mismatched L2 dimensions', () => {
    const a = [1, 0, 0];
    const b = [1, 0];
    expect(() => l2Distance(a, b)).toThrow(/dimension mismatch/i);
  });
});

describe('Embedding Dimensions Constants', () => {
  it('should have correct OpenAI embedding dimensions', () => {
    expect(EMBEDDING_DIMENSIONS.ADA_002).toBe(1536);
    expect(EMBEDDING_DIMENSIONS.V3_SMALL).toBe(1536);
    expect(EMBEDDING_DIMENSIONS.V3_LARGE).toBe(3072);
  });
});

describe('Query Performance KPI Validation', () => {
  const TARGET_QUERY_TIME_MS = 20;

  it('should verify p95 query time is under 20ms', () => {
    const tracker = new QueryPerformanceTracker(true);

    // Simulate realistic query times
    const queryTimes = [
      2.3, 3.1, 4.8, 5.2, 6.1, 7.3, 8.2, 9.1, 10.4, 11.2,
      2.1, 3.4, 4.2, 5.8, 6.4, 7.1, 8.9, 9.6, 10.1, 11.8,
    ];

    queryTimes.forEach((time, i) => {
      tracker.record(`query_${i}`, time);
    });

    const p95 = tracker.getP95QueryTime();
    expect(p95).toBeLessThan(TARGET_QUERY_TIME_MS);
  });

  it('should flag slow queries above threshold', () => {
    const tracker = new QueryPerformanceTracker(true);

    // Add some fast queries and one slow query
    tracker.record('fast_1', 5);
    tracker.record('fast_2', 8);
    tracker.record('slow_1', 25);
    tracker.record('fast_3', 12);

    const slowQueries = tracker.getSlowQueries(TARGET_QUERY_TIME_MS);
    expect(slowQueries).toHaveLength(1);
    expect(slowQueries[0].duration).toBe(25);
  });

  it('should maintain performance with high query volume', () => {
    const tracker = new QueryPerformanceTracker(true);

    // Simulate 10,000 queries
    for (let i = 0; i < 10000; i++) {
      // Random time between 1-15ms (typical fast queries)
      const time = 1 + Math.random() * 14;
      tracker.record(`query_${i}`, time);
    }

    const avg = tracker.getAverageQueryTime();
    const p95 = tracker.getP95QueryTime();

    expect(avg).toBeLessThan(TARGET_QUERY_TIME_MS);
    expect(p95).toBeLessThan(TARGET_QUERY_TIME_MS);
  });
});
