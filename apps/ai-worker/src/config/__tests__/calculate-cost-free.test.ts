/**
 * calculateCost and the scoring chain's TokenUsageCallbackHandler must agree on what a free
 * model is: provider model ids are case-insensitive, so `:FREE` is the free variant too.
 */
import { describe, it, expect } from 'vitest';

import { calculateCost } from '../ai.config';

describe('calculateCost — OpenRouter free variants', () => {
  it.each(['openai/gpt-oss-120b:free', 'openai/gpt-oss-120b:FREE', 'OpenAI/GPT-OSS-120B:Free'])(
    'costs nothing for %s',
    (model) => {
      expect(calculateCost(model, 2000, 500)).toBe(0);
    }
  );

  it('still prices a paid model', () => {
    expect(calculateCost('gpt-4o', 1000, 1000)).toBeGreaterThan(0);
  });
});
