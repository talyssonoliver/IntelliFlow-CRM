/**
 * Default OpenRouter embedding model (owner ruling 2026-10-31): free, and accepted only
 * while there are no real customers, because free routes may train on what we send
 * (debt EMBEDDINGS-FREE-PROVIDER-TRAINS-001, gh #1108).
 *
 * nvidia/nemotron-3-embed-1b:free reached end of life on 2026-11-23 (OpenRouter answers HTTP 410),
 * so the default moved to its successor. Same 2048 dimensions: the vector(2048) columns are kept.
 * Its own module so the embedding chain can name the model without importing the whole factory.
 */
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'nvidia/nemotron-3.5-embed-1b:free';

/** The OpenRouter embedding model id: `OPENROUTER_EMBEDDING_MODEL`, else the default. */
export function openRouterEmbeddingModel(): string {
  return process.env['OPENROUTER_EMBEDDING_MODEL'] || DEFAULT_OPENROUTER_EMBEDDING_MODEL;
}
