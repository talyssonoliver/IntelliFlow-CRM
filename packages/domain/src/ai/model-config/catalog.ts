/**
 * Model catalog (PG-199, ADR-082).
 *
 * The allow-list of concrete models a tenant may pin per AI purpose. Each entry
 * is a model that `infra/litellm/config.yaml` already routes to, so every pin is
 * proven for its purpose. Append-only: retire an entry with `deprecated: true`,
 * never delete it (a stored pin must keep resolving).
 *
 * Prices are integer micro-USD per 1k tokens, mirroring `MODEL_PRICING` in
 * `apps/ai-worker/src/config/ai.config.ts` (a parity test in ai-worker keeps the
 * two equal). The Never-Downgrade ranking compares input + output (owner Q7).
 *
 * OpenRouter ids are only mapped where the exact model exists in OpenRouter's
 * public model list (checked 2026-10-19). `*-latest` Mistral aliases and the
 * gpt-oss free slug have no unambiguous match, so they stay unmapped rather than
 * guessing a dated version.
 */

export const LLM_PURPOSES = [
  'scoring',
  'qualification',
  'email',
  'reasoning',
  'structured',
  'rag',
] as const;
export type LLMPurpose = (typeof LLM_PURPOSES)[number];

export const LLM_TIERS = ['free', 'standard', 'premium'] as const;
export type LLMTier = (typeof LLM_TIERS)[number];

export type ModelKind = 'chat' | 'embedding';

export interface ModelCatalogEntry {
  id: string;
  kind: ModelKind;
  purposes: readonly LLMPurpose[];
  /** Integer micro-USD per 1k tokens. */
  priceMicroUsdPer1k: { input: number; output: number };
  /** `MODEL_PRICING` key carrying the same price in ai-worker. */
  pricingKey: string;
  providers: { litellm?: string; openrouter?: string };
  /** Vector size, embeddings only. */
  dimensions?: number;
  deprecated?: true;
}

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'llama-3.1-8b-instant',
    kind: 'chat',
    purposes: ['scoring', 'email'],
    priceMicroUsdPer1k: { input: 50, output: 80 },
    pricingKey: 'scoring-free',
    providers: {
      litellm: 'catalog-llama-3.1-8b-instant',
      openrouter: 'meta-llama/llama-3.1-8b-instruct',
    },
  },
  {
    id: 'llama-3.3-70b-versatile',
    kind: 'chat',
    purposes: ['qualification', 'email'],
    priceMicroUsdPer1k: { input: 590, output: 790 },
    pricingKey: 'qualification-free',
    providers: {
      litellm: 'catalog-llama-3.3-70b-versatile',
      openrouter: 'meta-llama/llama-3.3-70b-instruct',
    },
  },
  {
    id: 'gpt-oss-20b-free',
    kind: 'chat',
    purposes: ['reasoning'],
    priceMicroUsdPer1k: { input: 0, output: 0 },
    pricingKey: 'reasoning-free',
    providers: { litellm: 'catalog-gpt-oss-20b-free' },
  },
  {
    id: 'gemini-2.5-flash',
    kind: 'chat',
    purposes: ['structured'],
    priceMicroUsdPer1k: { input: 75, output: 300 },
    pricingKey: 'structured-free',
    providers: { litellm: 'catalog-gemini-2.5-flash', openrouter: 'google/gemini-2.5-flash' },
  },
  {
    id: 'mistral-small',
    kind: 'chat',
    purposes: ['scoring', 'structured'],
    priceMicroUsdPer1k: { input: 200, output: 600 },
    pricingKey: 'scoring-standard',
    providers: { litellm: 'catalog-mistral-small' },
  },
  {
    id: 'mistral-medium',
    kind: 'chat',
    purposes: ['qualification'],
    priceMicroUsdPer1k: { input: 1000, output: 3000 },
    pricingKey: 'qualification-standard',
    providers: { litellm: 'catalog-mistral-medium' },
  },
  {
    id: 'claude-haiku-4-5',
    kind: 'chat',
    purposes: ['email', 'reasoning'],
    priceMicroUsdPer1k: { input: 800, output: 4000 },
    pricingKey: 'reasoning-standard',
    providers: { litellm: 'catalog-claude-haiku-4-5', openrouter: 'anthropic/claude-haiku-4.5' },
  },
  {
    id: 'gpt-4o-mini',
    kind: 'chat',
    purposes: ['scoring'],
    priceMicroUsdPer1k: { input: 150, output: 600 },
    pricingKey: 'gpt-4o-mini',
    providers: { litellm: 'catalog-gpt-4o-mini', openrouter: 'openai/gpt-4o-mini' },
  },
  {
    id: 'gpt-4o',
    kind: 'chat',
    purposes: ['qualification', 'structured'],
    priceMicroUsdPer1k: { input: 2500, output: 10000 },
    pricingKey: 'gpt-4o',
    providers: { litellm: 'catalog-gpt-4o', openrouter: 'openai/gpt-4o' },
  },
  {
    id: 'claude-sonnet-4-5',
    kind: 'chat',
    purposes: ['reasoning'],
    priceMicroUsdPer1k: { input: 3000, output: 15000 },
    pricingKey: 'reasoning-premium',
    providers: {
      litellm: 'catalog-claude-sonnet-4-5',
      openrouter: 'anthropic/claude-sonnet-4.5',
    },
  },
  {
    id: 'nomic-embed-text',
    kind: 'embedding',
    purposes: ['rag'],
    priceMicroUsdPer1k: { input: 0, output: 0 },
    pricingKey: 'rag-free',
    providers: { litellm: 'rag-free' },
    dimensions: 768,
  },
  {
    id: 'text-embedding-3-small',
    kind: 'embedding',
    purposes: ['rag'],
    priceMicroUsdPer1k: { input: 20, output: 0 },
    pricingKey: 'rag-premium',
    providers: { litellm: 'rag-premium' },
    dimensions: 1536,
  },
  {
    // $0.15 per 1M input tokens: OpenRouter API pricing for google/gemini-embedding-001
    // (prompt 0.00000015/token) and third-party listings, checked 2026-10-19. Google's
    // current pricing page lists only gemini-embedding-2.
    id: 'gemini-embedding-001',
    kind: 'embedding',
    purposes: ['rag'],
    priceMicroUsdPer1k: { input: 150, output: 0 },
    pricingKey: 'gemini-embedding-001',
    providers: {},
    dimensions: 1536,
  },
];

const CATALOG_BY_ID: ReadonlyMap<string, ModelCatalogEntry> = new Map(
  MODEL_CATALOG.map((entry) => [entry.id, entry])
);

/** The catalog entry for an id, or undefined when the id is not (or no longer) offered. */
export function getCatalogEntry(id: string): ModelCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}
