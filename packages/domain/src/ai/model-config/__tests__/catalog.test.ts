import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  LLM_PURPOSES,
  LLM_TIERS,
  DEFAULT_MODEL,
  CALLER_DEFAULT_TIERS,
  getCatalogEntry,
  priceOf,
} from '../index';

describe('MODEL_CATALOG (PG-199)', () => {
  it('pins catalog ids and integer micro-USD prices (append-only snapshot)', () => {
    const snapshot = MODEL_CATALOG.map((m) => [
      m.id,
      m.kind,
      m.priceMicroUsdPer1k.input,
      m.priceMicroUsdPer1k.output,
    ]);
    expect(snapshot).toEqual([
      ['llama-3.1-8b-instant', 'chat', 50, 80],
      ['llama-3.3-70b-versatile', 'chat', 590, 790],
      ['gpt-oss-20b-free', 'chat', 0, 0],
      ['gemini-2.5-flash', 'chat', 75, 300],
      ['mistral-small', 'chat', 200, 600],
      ['mistral-medium', 'chat', 1000, 3000],
      ['claude-haiku-4-5', 'chat', 800, 4000],
      ['gpt-4o-mini', 'chat', 150, 600],
      ['gpt-4o', 'chat', 2500, 10000],
      ['claude-sonnet-4-5', 'chat', 3000, 15000],
      ['nomic-embed-text', 'embedding', 0, 0],
      ['text-embedding-3-small', 'embedding', 20, 0],
      ['gemini-embedding-001', 'embedding', 150, 0],
    ]);
  });

  it('has unique ids, integer non-negative prices and at least one purpose each', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODEL_CATALOG) {
      expect(Number.isInteger(m.priceMicroUsdPer1k.input)).toBe(true);
      expect(Number.isInteger(m.priceMicroUsdPer1k.output)).toBe(true);
      expect(m.priceMicroUsdPer1k.input).toBeGreaterThanOrEqual(0);
      expect(m.purposes.length).toBeGreaterThan(0);
      expect(m.pricingKey.length).toBeGreaterThan(0);
    }
  });

  it('routes every chat model through a dedicated catalog-<id> LiteLLM alias', () => {
    for (const m of MODEL_CATALOG.filter((x) => x.kind === 'chat')) {
      expect(m.providers.litellm).toBe(`catalog-${m.id}`);
    }
  });

  it('only maps OpenRouter ids that exist (mistral and gpt-oss free stay unmapped)', () => {
    expect(getCatalogEntry('claude-haiku-4-5')?.providers.openrouter).toBe(
      'anthropic/claude-haiku-4.5'
    );
    expect(getCatalogEntry('mistral-small')?.providers.openrouter).toBeUndefined();
    expect(getCatalogEntry('mistral-medium')?.providers.openrouter).toBeUndefined();
    expect(getCatalogEntry('gpt-oss-20b-free')?.providers.openrouter).toBeUndefined();
  });

  it('keeps embeddings rag-only with their vector dimensions', () => {
    for (const m of MODEL_CATALOG.filter((x) => x.kind === 'embedding')) {
      expect(m.purposes).toEqual(['rag']);
      expect(m.dimensions).toBeGreaterThan(0);
    }
    expect(
      MODEL_CATALOG.filter((x) => x.kind === 'chat').some((m) => m.purposes.includes('rag'))
    ).toBe(false);
  });

  it('keeps deprecated entries resolvable and priced (a stored pin never silently loses its rank)', () => {
    for (const m of MODEL_CATALOG.filter((x) => x.deprecated)) {
      expect(getCatalogEntry(m.id)).toBe(m);
      expect(priceOf(m.id)).toBe(m.priceMicroUsdPer1k.input + m.priceMicroUsdPer1k.output);
    }
    // priceOf never looks at the flag: every entry, deprecated or not, is priced.
    for (const m of MODEL_CATALOG) expect(priceOf(m.id)).toBeDefined();
  });

  it('returns undefined for an id outside the catalog', () => {
    expect(getCatalogEntry('not-a-model')).toBeUndefined();
  });
});

describe('defaults (PG-199)', () => {
  it('lists the 6 purposes and 3 tiers', () => {
    expect(LLM_PURPOSES).toEqual([
      'scoring',
      'qualification',
      'email',
      'reasoning',
      'structured',
      'rag',
    ]);
    expect(LLM_TIERS).toEqual(['free', 'standard', 'premium']);
  });

  it('maps every default alias to a catalog model allowed for that purpose', () => {
    for (const purpose of LLM_PURPOSES) {
      for (const tier of LLM_TIERS) {
        const id = DEFAULT_MODEL[purpose][tier];
        if (id === undefined) continue;
        const entry = getCatalogEntry(id);
        expect(entry, `${purpose}-${tier}`).toBeDefined();
        expect(entry?.purposes).toContain(purpose);
      }
    }
  });

  it('has no rag-standard alias (partial table)', () => {
    expect(DEFAULT_MODEL.rag.standard).toBeUndefined();
    expect(DEFAULT_MODEL.rag.free).toBe('nomic-embed-text');
  });

  it('records the tiers each purpose is called with', () => {
    expect(CALLER_DEFAULT_TIERS).toEqual({
      scoring: ['free', 'standard'],
      qualification: ['free', 'standard'],
      email: ['free', 'standard'],
      reasoning: ['free', 'premium'],
      structured: ['free', 'standard'],
      rag: ['free'],
    });
  });
});
