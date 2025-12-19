import { OpenAIEmbeddings } from '@langchain/openai';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import pino from 'pino';

const logger = pino({
  name: 'embedding-chain',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Embedding input schema
 */
export const embeddingInputSchema = z.object({
  text: z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).optional(),
});

export type EmbeddingInput = z.infer<typeof embeddingInputSchema>;

/**
 * Embedding result
 */
export const embeddingResultSchema = z.object({
  vector: z.array(z.number()),
  dimensions: z.number(),
  model: z.string(),
  text: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type EmbeddingResult = z.infer<typeof embeddingResultSchema>;

/**
 * Batch Embedding Result
 */
export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalProcessed: number;
  duration: number;
}

/**
 * Embedding Generation Chain
 * Generates vector embeddings for text using OpenAI's embedding models
 * Optimized for use with pgvector in Supabase
 */
export class EmbeddingChain {
  private embeddings: OpenAIEmbeddings;
  private modelName: string;
  private dimensions: number;

  constructor() {
    // Initialize OpenAI Embeddings
    // Using text-embedding-3-small for cost efficiency (OpenAI recommended for pgvector)
    this.modelName = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);

    this.embeddings = new OpenAIEmbeddings({
      modelName: this.modelName,
      openAIApiKey: aiConfig.openai.apiKey,
      stripNewLines: true,
      timeout: 30000,
    });

    logger.info(
      {
        model: this.modelName,
        dimensions: this.dimensions,
      },
      'Embedding chain initialized'
    );
  }

  /**
   * Generate embedding for a single text input
   */
  async generateEmbedding(input: EmbeddingInput): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      logger.debug({ textLength: input.text.length }, 'Generating embedding');

      // Validate input
      embeddingInputSchema.parse(input);

      // Generate embedding vector
      const vector = await this.embeddings.embedQuery(input.text);

      const result: EmbeddingResult = {
        vector,
        dimensions: vector.length,
        model: this.modelName,
        text: input.text,
        metadata: input.metadata,
      };

      const duration = Date.now() - startTime;

      logger.info(
        {
          textLength: input.text.length,
          dimensions: vector.length,
          duration,
        },
        'Embedding generated successfully'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          textLength: input.text.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Embedding generation failed'
      );

      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling generateEmbedding multiple times
   */
  async generateBatchEmbeddings(inputs: EmbeddingInput[]): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();

    try {
      logger.info({ count: inputs.length }, 'Starting batch embedding generation');

      // Validate all inputs
      inputs.forEach((input) => embeddingInputSchema.parse(input));

      // Extract texts
      const texts = inputs.map((input) => input.text);

      // Generate embeddings in batch (more efficient)
      const vectors = await this.embeddings.embedDocuments(texts);

      // Combine results
      const embeddings: EmbeddingResult[] = inputs.map((input, index) => ({
        vector: vectors[index],
        dimensions: vectors[index].length,
        model: this.modelName,
        text: input.text,
        metadata: input.metadata,
      }));

      const duration = Date.now() - startTime;

      logger.info(
        {
          count: embeddings.length,
          duration,
          avgDuration: duration / embeddings.length,
        },
        'Batch embedding generation completed'
      );

      return {
        embeddings,
        totalProcessed: embeddings.length,
        duration,
      };
    } catch (error) {
      logger.error(
        {
          count: inputs.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch embedding generation failed'
      );

      throw new Error(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embedding for document chunks (for RAG/semantic search)
   * Automatically chunks large documents if needed
   */
  async embedDocument(params: {
    text: string;
    chunkSize?: number;
    chunkOverlap?: number;
    metadata?: Record<string, unknown>;
  }): Promise<EmbeddingResult[]> {
    const { text, chunkSize = 1000, chunkOverlap = 200, metadata } = params;

    logger.info(
      {
        textLength: text.length,
        chunkSize,
        chunkOverlap,
      },
      'Embedding document with chunking'
    );

    // Simple chunking strategy (for production, use LangChain's text splitters)
    const chunks = this.chunkText(text, chunkSize, chunkOverlap);

    logger.debug({ chunkCount: chunks.length }, 'Text chunked');

    // Generate embeddings for all chunks
    const inputs: EmbeddingInput[] = chunks.map((chunk, index) => ({
      text: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));

    const batchResult = await this.generateBatchEmbeddings(inputs);

    return batchResult.embeddings;
  }

  /**
   * Calculate similarity between two embedding vectors
   * Uses cosine similarity (same as pgvector)
   * Returns value between -1 (opposite) and 1 (identical)
   */
  calculateSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Find most similar texts from a list
   * Useful for semantic search without database
   */
  async findMostSimilar(params: {
    query: string;
    documents: Array<{ text: string; metadata?: Record<string, unknown> }>;
    topK?: number;
  }): Promise<
    Array<{
      text: string;
      similarity: number;
      metadata?: Record<string, unknown>;
    }>
  > {
    const { query, documents, topK = 5 } = params;

    logger.info(
      {
        documentCount: documents.length,
        topK,
      },
      'Finding most similar documents'
    );

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding({ text: query });

    // Generate embeddings for all documents
    const docEmbeddings = await this.generateBatchEmbeddings(
      documents.map((doc) => ({ text: doc.text, metadata: doc.metadata }))
    );

    // Calculate similarities
    const similarities = docEmbeddings.embeddings.map((docEmb, index) => ({
      text: documents[index].text,
      similarity: this.calculateSimilarity(queryEmbedding.vector, docEmb.vector),
      metadata: documents[index].metadata,
    }));

    // Sort by similarity (descending) and take top K
    const topResults = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);

    logger.info(
      {
        topK,
        highestSimilarity: topResults[0]?.similarity,
        lowestSimilarity: topResults[topResults.length - 1]?.similarity,
      },
      'Most similar documents found'
    );

    return topResults;
  }

  /**
   * Simple text chunking utility
   * For production, consider using LangChain's RecursiveCharacterTextSplitter
   */
  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;

      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Get embedding statistics
   */
  getStats(): {
    model: string;
    dimensions: number;
  } {
    return {
      model: this.modelName,
      dimensions: this.dimensions,
    };
  }

  /**
   * Format embedding for pgvector insertion
   * pgvector expects array format: [0.1, 0.2, ...]
   */
  formatForPgvector(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  /**
   * Parse pgvector string to number array
   */
  parseFromPgvector(pgvectorString: string): number[] {
    // Remove brackets and split by comma
    const cleaned = pgvectorString.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((val) => parseFloat(val.trim()));
  }
}

/**
 * Global embedding chain instance
 */
export const embeddingChain = new EmbeddingChain();
