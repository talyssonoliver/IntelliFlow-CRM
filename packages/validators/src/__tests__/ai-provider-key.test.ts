/**
 * PG-199 BYOK validators: the pasted key is trimmed and shaped for an HTTP header, the provider
 * list is closed, and the masking helper never returns more than the last four characters.
 */
import { describe, it, expect } from 'vitest';
import {
  AI_KEY_PROVIDERS,
  AI_KEY_PROVIDER_LABELS,
  AI_KEY_STATUSES,
  aiProviderKeySecretSchema,
  keyLast4,
  setAIProviderKeySchema,
  updateAIProviderKeyOptionsSchema,
} from '../ai-provider-key';

const FAKE_KEY = 'x'.repeat(28) + 'wxyz';

describe('ai-provider-key validators', () => {
  it('lists the four providers and labels every one', () => {
    expect([...AI_KEY_PROVIDERS]).toEqual(['anthropic', 'openai', 'openrouter']);
    for (const provider of AI_KEY_PROVIDERS) expect(AI_KEY_PROVIDER_LABELS[provider]).toBeTruthy();
    expect([...AI_KEY_STATUSES]).toEqual(['ACTIVE', 'INVALID', 'RATE_LIMITED', 'QUOTA_EXCEEDED']);
  });

  it('trims the key and leaves fallback unset (the API defaults a first key to false)', () => {
    const parsed = setAIProviderKeySchema.parse({ provider: 'openai', apiKey: `  ${FAKE_KEY}\n` });
    expect(parsed).toEqual({ provider: 'openai', apiKey: FAKE_KEY });
    expect(
      setAIProviderKeySchema.parse({ provider: 'openai', apiKey: FAKE_KEY, allowFallback: true })
        .allowFallback
    ).toBe(true);
  });

  it.each([
    ['too short', 'abc'],
    ['inner space', FAKE_KEY.slice(0, 10) + ' ' + FAKE_KEY.slice(10)],
    ['newline inside', FAKE_KEY.slice(0, 10) + '\n' + FAKE_KEY.slice(10)],
    ['non-ascii', FAKE_KEY + 'é'],
    ['too long', 'y'.repeat(513)],
    ['empty', ''],
  ])('rejects a key that is %s', (_name, apiKey) => {
    expect(aiProviderKeySecretSchema.safeParse(apiKey).success).toBe(false);
  });

  it('rejects an unknown provider', () => {
    expect(setAIProviderKeySchema.safeParse({ provider: 'cohere', apiKey: FAKE_KEY }).success).toBe(
      false
    );
  });

  it('the options schema needs a boolean', () => {
    expect(updateAIProviderKeyOptionsSchema.parse({ allowFallback: true })).toEqual({
      allowFallback: true,
    });
    expect(updateAIProviderKeyOptionsSchema.safeParse({}).success).toBe(false);
  });

  it('keyLast4 returns at most the last four characters', () => {
    expect(keyLast4(FAKE_KEY)).toBe('wxyz');
    expect(keyLast4('ab')).toBe('ab');
  });
});
