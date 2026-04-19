/**
 * @vitest-environment node
 *
 * Tests for AIMonitoringPayloadSchema (M10)
 */
import { describe, it, expect } from 'vitest';
import { AIMonitoringPayloadSchema } from '../ai-monitoring-payload.schema';

describe('AIMonitoringPayloadSchema', () => {
  it('accepts a fully valid payload', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      provider: 'litellm',
      tier: 'free',
      purpose: 'lead-scoring',
      modelName: 'gpt-4-turbo',
      latencyMs: 340,
      inputTokens: 120,
      outputTokens: 80,
      costUsd: 0.003,
      hallucinationDetected: false,
      driftScore: 0.12,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = AIMonitoringPayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a partial payload (only provider + tier)', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      provider: 'openai',
      tier: 'premium',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe('openai');
      expect(result.data.tier).toBe('premium');
    }
  });

  it('rejects an unknown provider enum value', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      provider: 'anthropic', // not in the enum
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const providerIssue = result.error.issues.find((i) => i.path[0] === 'provider');
      expect(providerIssue).toBeDefined();
    }
  });

  it('rejects an unknown tier enum value', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      tier: 'enterprise', // not in the enum
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const tierIssue = result.error.issues.find((i) => i.path[0] === 'tier');
      expect(tierIssue).toBeDefined();
    }
  });

  it('rejects non-number latencyMs', () => {
    const result = AIMonitoringPayloadSchema.safeParse({ latencyMs: 'fast' });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean hallucinationDetected', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      hallucinationDetected: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('preserves unknown extra fields via passthrough', () => {
    const result = AIMonitoringPayloadSchema.safeParse({
      provider: 'ollama',
      customMetric: 42,
      experimentId: 'exp-007',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).customMetric).toBe(42);
      expect((result.data as any).experimentId).toBe('exp-007');
    }
  });

  it('parse() throws ZodError for invalid payload (for direct use cases)', () => {
    expect(() => AIMonitoringPayloadSchema.parse({ provider: 'bad-value' })).toThrow();
  });
});
