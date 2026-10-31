import { aiConfig } from '../config/ai.config.js';

/**
 * Size of the vectors createEmbeddings returns: `EMBEDDING_DIMENSIONS`, else 2048 on OpenRouter
 * (the free Nemotron model's only size, matching the vector(2048) columns), 768 on Ollama and
 * 1536 otherwise. The write path still rejects any vector that does not fit the column
 * (`validateEmbedding` in @intelliflow/db).
 */
export function embeddingDimensions(): number {
  const configured = Number.parseInt(process.env['EMBEDDING_DIMENSIONS'] || '', 10);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (aiConfig.provider !== 'mock' && process.env['EMBEDDING_PROVIDER'] === 'openrouter') {
    return 2048;
  }
  return aiConfig.provider === 'ollama' ? 768 : 1536;
}
