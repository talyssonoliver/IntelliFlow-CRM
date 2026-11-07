/**
 * The lead score schema is also the structured-output format the scoring model receives.
 * #1218: with no descriptions and no minimums, a placeholder answer (confidence 0, no
 * factors) matched the format exactly, and the free model returned one.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { leadScoreSchema } from '../lead';

type JsonProperty = {
  description?: string;
  exclusiveMinimum?: number;
  minItems?: number;
  items?: { properties?: Record<string, JsonProperty> };
};

const properties = (z.toJSONSchema(leadScoreSchema) as { properties: Record<string, JsonProperty> })
  .properties;

describe('leadScoreSchema as the model output format', () => {
  it('tells the model confidence must be above 0, and what it means', () => {
    expect(properties.confidence.exclusiveMinimum).toBe(0);
    expect(properties.confidence.description).toMatch(/how sure/i);
    expect(properties.confidence.description).toMatch(/never 0/i);
  });

  it('tells the model to give at least one factor', () => {
    expect(properties.factors.minItems).toBe(1);
    expect(properties.factors.description).toMatch(/at least one/i);
  });

  it('describes the score and every factor field', () => {
    expect(properties.score.description).toMatch(/0 to 100/);
    const factor = properties.factors.items?.properties ?? {};
    for (const field of ['name', 'impact', 'reasoning']) {
      expect(factor[field]?.description, field).toBeTruthy();
    }
  });

  it('still parses a placeholder answer, so the chain can report it as inconclusive', () => {
    // A schema error here would be counted by the shared circuit breaker as a provider fault.
    const placeholder = { score: 0, confidence: 0, factors: [], modelVersion: 'm' };
    expect(leadScoreSchema.safeParse(placeholder).success).toBe(true);
  });
});
