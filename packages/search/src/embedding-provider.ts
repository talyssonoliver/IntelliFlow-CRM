/**
 * Embedding Provider Interface (IFC-155)
 *
 * Abstracts embedding generation behind an interface so that
 * the DocumentIndexer can work with any provider (OpenAI, Ollama, mock, etc.).
 *
 * The canonical adapter wraps EmbeddingChain from ai-worker.
 *
 * @module @intelliflow/search/embedding-provider
 */

// ============================================
// Embedding Result
// ============================================

export interface EmbeddingResult {
  /** The embedding vector */
  vector: number[];
  /** Model used to generate the embedding */
  model: string;
  /** Number of dimensions in the vector */
  dimensions: number;
}

// ============================================
// Embedding Provider Interface
// ============================================

/**
 * Interface for embedding providers.
 *
 * Implementations must provide at least `generateEmbedding`.
 * `generateBatchEmbeddings` is optional — callers should fall
 * back to sequential single-embedding calls when absent.
 */
export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateBatchEmbeddings?(texts: string[]): Promise<EmbeddingResult[]>;
}
