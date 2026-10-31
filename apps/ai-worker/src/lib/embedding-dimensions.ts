import { aiConfig } from '../config/ai.config.js';

/** Size of the vector(2048) embedding columns (VECTOR_COLUMN_DIMENSIONS in @intelliflow/db). */
const COLUMN_DIMENSIONS = 2048;

/**
 * Size of the vectors createEmbeddings returns: `EMBEDDING_DIMENSIONS`, else 2048 on OpenRouter
 * (the free Nemotron model's only size) and on Gemini (gemini-embedding-001 takes any size up to
 * 3072, so the Gemini rollback fits the same columns), 768 on Ollama and 1536 otherwise. The worker
 * does not start when this does not fit the column, and the write path still rejects any vector
 * that does not (`validateEmbedding` in @intelliflow/db).
 */
export function embeddingDimensions(): number {
  const configured = Number.parseInt(process.env['EMBEDDING_DIMENSIONS'] || '', 10);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const provider = process.env['EMBEDDING_PROVIDER'];
  if (aiConfig.provider !== 'mock' && (provider === 'openrouter' || provider === 'gemini')) {
    return COLUMN_DIMENSIONS;
  }
  return aiConfig.provider === 'ollama' ? 768 : 1536;
}
