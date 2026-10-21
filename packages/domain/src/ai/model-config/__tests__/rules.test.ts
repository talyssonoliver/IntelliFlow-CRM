import { describe, it, expect } from 'vitest';
import {
  priceOf,
  effectiveModel,
  defaultModelsFor,
  primaryModelsFor,
  currentPrimaryPrice,
  isDowngrade,
  findDowngrades,
  isModelAllowedForPurpose,
  purposeSpendKey,
  purposeSpendPeriod,
  MODEL_CONFIG_LIMITS,
  LLM_PURPOSES,
} from '../index';

describe('priceOf (Q7: input + output micro-USD per 1k)', () => {
  it('sums input and output', () => {
    expect(priceOf('gpt-4o-mini')).toBe(750);
    expect(priceOf('mistral-small')).toBe(800);
    expect(priceOf('gpt-oss-20b-free')).toBe(0);
  });

  it('is undefined outside the catalog', () => {
    expect(priceOf('retired-model')).toBeUndefined();
  });
});

describe('effectiveModel', () => {
  it('prefers the pin', () => {
    expect(effectiveModel('scoring', 'free', 'gpt-4o')).toBe('gpt-4o');
  });

  it('falls back to the tier alias when unpinned', () => {
    expect(effectiveModel('scoring', 'standard', null)).toBe('mistral-small');
  });

  it('is null when both tier and pin are null (caller default decides)', () => {
    expect(effectiveModel('scoring', null, null)).toBeNull();
  });

  it('is null for a missing alias (rag-standard)', () => {
    expect(effectiveModel('rag', 'standard', null)).toBeNull();
  });
});

describe('primaryModelsFor (the models fallbacks must differ from)', () => {
  it('is the pin when one is set', () => {
    expect(primaryModelsFor('qualification', 'premium', 'claude-sonnet-4-5')).toEqual([
      'claude-sonnet-4-5',
    ]);
  });

  it('is the default of a stored tier override (rows written before PG-199)', () => {
    expect(primaryModelsFor('qualification', 'premium', null)).toEqual(['gpt-4o']);
  });

  it('is every caller default when unpinned with no tier, or the tier has no alias', () => {
    expect(primaryModelsFor('qualification', null, null)).toEqual(
      defaultModelsFor('qualification')
    );
    expect(primaryModelsFor('rag', 'standard', null)).toEqual(defaultModelsFor('rag'));
  });
});

describe('defaultModelsFor / currentPrimaryPrice (A1)', () => {
  it('lists the distinct default models over the caller tiers', () => {
    expect(defaultModelsFor('scoring')).toEqual(['llama-3.1-8b-instant', 'mistral-small']);
    expect(defaultModelsFor('reasoning')).toEqual(['gpt-oss-20b-free', 'claude-sonnet-4-5']);
  });

  it('prices an unpinned purpose at the most expensive caller default', () => {
    expect(currentPrimaryPrice('scoring', null)).toBe(800); // mistral-small > llama-8b
    expect(currentPrimaryPrice('reasoning', null)).toBe(18000); // sonnet
  });

  it('prices a pin at its own price and an unknown pin as undefined', () => {
    expect(currentPrimaryPrice('scoring', 'gpt-4o-mini')).toBe(750);
    expect(currentPrimaryPrice('scoring', 'retired-model')).toBeUndefined();
  });
});

describe('isDowngrade (Q7)', () => {
  it('is true when strictly cheaper', () => {
    expect(isDowngrade(800, 'gpt-4o-mini')).toBe(true); // mistral-small 800 -> 4o-mini 750
  });

  it('is false for equal price (lateral) and for more expensive', () => {
    expect(isDowngrade(0, 'gpt-oss-20b-free')).toBe(false); // free -> free
    expect(isDowngrade(750, 'mistral-small')).toBe(false);
  });

  it('treats an unknown current model as a downgrade (safe toward confirm)', () => {
    expect(isDowngrade(undefined, 'claude-sonnet-4-5')).toBe(true);
  });

  it('treats paid -> free as a downgrade', () => {
    expect(isDowngrade(130, 'gpt-oss-20b-free')).toBe(true);
  });
});

describe('findDowngrades', () => {
  const none = { modelId: null, fallbackModelIds: [] as string[] };

  it('returns nothing when nothing changes', () => {
    expect(findDowngrades('scoring', none, none)).toEqual([]);
  });

  it('flags scoring standard default -> gpt-4o-mini pin (price inversion)', () => {
    const d = findDowngrades('scoring', none, { modelId: 'gpt-4o-mini', fallbackModelIds: [] });
    expect(d).toEqual([
      {
        purpose: 'scoring',
        slot: 'primary',
        from: null,
        to: 'gpt-4o-mini',
        fromPrice: 800,
        toPrice: 750,
      },
    ]);
  });

  it('does not flag an upgrade of the primary', () => {
    expect(
      findDowngrades(
        'reasoning',
        { modelId: 'claude-haiku-4-5', fallbackModelIds: [] },
        { modelId: 'claude-sonnet-4-5', fallbackModelIds: [] }
      )
    ).toEqual([]);
  });

  it('flags moving a pin back to defaults when any caller default is cheaper', () => {
    const d = findDowngrades('scoring', { modelId: 'gpt-4o', fallbackModelIds: [] }, none);
    expect(d).toEqual([
      {
        purpose: 'scoring',
        slot: 'primary',
        from: 'gpt-4o',
        to: null,
        fromPrice: 12500,
        toPrice: 130,
      },
    ]);
  });

  it('does not flag moving to defaults when every default costs at least the pin', () => {
    expect(
      findDowngrades('scoring', { modelId: 'llama-3.1-8b-instant', fallbackModelIds: [] }, none)
    ).toEqual([]);
  });

  it('flags a new fallback cheaper than the effective primary (Q4)', () => {
    const d = findDowngrades(
      'reasoning',
      { modelId: 'claude-sonnet-4-5', fallbackModelIds: [] },
      { modelId: 'claude-sonnet-4-5', fallbackModelIds: ['claude-haiku-4-5'] }
    );
    expect(d).toEqual([
      {
        purpose: 'reasoning',
        slot: 0,
        from: null,
        to: 'claude-haiku-4-5',
        fromPrice: 18000,
        toPrice: 4800,
      },
    ]);
  });

  it('never re-prompts for an unchanged fallback', () => {
    const pick = { modelId: 'claude-sonnet-4-5', fallbackModelIds: ['claude-haiku-4-5'] };
    expect(findDowngrades('reasoning', pick, pick)).toEqual([]);
  });

  it('flags a changed fallback in position', () => {
    const d = findDowngrades(
      'reasoning',
      { modelId: 'claude-sonnet-4-5', fallbackModelIds: ['claude-haiku-4-5'] },
      { modelId: 'claude-sonnet-4-5', fallbackModelIds: ['gpt-oss-20b-free'] }
    );
    expect(d.map((x) => [x.slot, x.from, x.to])).toEqual([
      [0, 'claude-haiku-4-5', 'gpt-oss-20b-free'],
    ]);
  });

  it('flags any pick from a retired current pin', () => {
    const d = findDowngrades(
      'reasoning',
      { modelId: 'retired-model', fallbackModelIds: [] },
      { modelId: 'claude-sonnet-4-5', fallbackModelIds: [] }
    );
    expect(d).toHaveLength(1);
    expect(d[0].fromPrice).toBeUndefined();
  });
});

describe('isModelAllowedForPurpose', () => {
  it('allows only catalog models routed for that purpose', () => {
    expect(isModelAllowedForPurpose('scoring', 'gpt-4o-mini')).toBe(true);
    expect(isModelAllowedForPurpose('scoring', 'claude-sonnet-4-5')).toBe(false);
    expect(isModelAllowedForPurpose('scoring', 'nope')).toBe(false);
  });
});

describe('purpose spend key and period', () => {
  it('builds one counter key per purpose', () => {
    expect(LLM_PURPOSES.map((purpose) => purposeSpendKey(purpose))).toEqual([
      'aiSpendCentiCents:scoring',
      'aiSpendCentiCents:qualification',
      'aiSpendCentiCents:email',
      'aiSpendCentiCents:reasoning',
      'aiSpendCentiCents:structured',
      'aiSpendCentiCents:rag',
    ]);
  });

  it('uses the UTC month and never "all" (A2)', () => {
    expect(purposeSpendPeriod(new Date('2026-10-31T23:59:59.999Z'))).toBe('2026-10');
    expect(purposeSpendPeriod(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11');
  });
});

describe('MODEL_CONFIG_LIMITS', () => {
  it('pins the shared bounds', () => {
    expect(MODEL_CONFIG_LIMITS).toEqual({
      temperatureMin: 0,
      temperatureMax: 2,
      maxTokensMin: 1,
      maxTokensMax: 32768,
      maxFallbacks: 3,
      ceilingCentsMin: 0,
      ceilingCentsMax: 2_000_000,
    });
  });
});
