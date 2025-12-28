/**
 * pgvector Helper Module for IntelliFlow CRM
 *
 * Provides type-safe utilities for working with pgvector embeddings:
 * - Vector similarity search
 * - Embedding validation
 * - Query builders for semantic search
 *
 * @module @intelliflow/db/pgvector
 */

import { prisma, Prisma, VectorEmbedding, VectorSearchResult } from './client';

/**
 * OpenAI embedding dimensions
 * - text-embedding-ada-002: 1536 dimensions
 * - text-embedding-3-small: 1536 dimensions
 * - text-embedding-3-large: 3072 dimensions
 */
export const EMBEDDING_DIMENSIONS = {
  ADA_002: 1536,
  V3_SMALL: 1536,
  V3_LARGE: 3072,
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_DIMENSIONS;

/**
 * Distance metrics for similarity search
 */
export type DistanceMetric = 'l2' | 'cosine' | 'inner_product';

/**
 * Similarity search options
 */
export interface SimilaritySearchOptions {
  /** Distance metric to use */
  metric?: DistanceMetric;
  /** Minimum similarity threshold (0-1 for cosine) */
  threshold?: number;
  /** Maximum results to return */
  limit?: number;
  /** Expected embedding dimensions */
  dimensions?: number;
}

/**
 * Get the SQL operator for a distance metric
 */
function getDistanceOperator(metric: DistanceMetric): string {
  switch (metric) {
    case 'l2':
      return '<->';
    case 'cosine':
      return '<=>';
    case 'inner_product':
      return '<#>';
    default:
      return '<=>';
  }
}

/**
 * Validate an embedding array
 */
export function validateEmbedding(
  embedding: unknown,
  expectedDimensions: number = EMBEDDING_DIMENSIONS.ADA_002 as number
): embedding is VectorEmbedding {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== expectedDimensions) return false;
  return embedding.every((v) => typeof v === 'number' && !isNaN(v));
}

/**
 * Format an embedding array for pgvector SQL
 */
export function formatEmbedding(embedding: VectorEmbedding): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse a pgvector string back to an embedding array
 */
export function parseEmbedding(vectorString: string): VectorEmbedding {
  // pgvector format: [0.1,0.2,0.3,...]
  const cleaned = vectorString.replace(/[\[\]]/g, '');
  return cleaned.split(',').map((v) => parseFloat(v));
}

/**
 * Calculate cosine similarity between two embeddings
 * Returns a value between -1 and 1, where 1 means identical
 */
export function cosineSimilarity(a: VectorEmbedding, b: VectorEmbedding): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate L2 (Euclidean) distance between two embeddings
 * Returns 0 for identical vectors, larger values for more different vectors
 */
export function l2Distance(a: VectorEmbedding, b: VectorEmbedding): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Find similar leads by embedding
 */
export async function findSimilarLeads(
  embedding: VectorEmbedding,
  options: SimilaritySearchOptions = {}
): Promise<VectorSearchResult<{ id: string; email: string; company: string | null; score: number }>[]> {
  const { metric = 'cosine', threshold = 0.7, limit = 10, dimensions = EMBEDDING_DIMENSIONS.ADA_002 } = options;

  if (!validateEmbedding(embedding, dimensions)) {
    throw new Error(`Invalid embedding: expected ${dimensions} dimensions`);
  }

  const operator = getDistanceOperator(metric);
  const embeddingStr = formatEmbedding(embedding);

  // For cosine distance, similarity = 1 - distance
  // We filter where 1 - distance > threshold, i.e., distance < 1 - threshold
  const distanceThreshold = 1 - threshold;

  const results = await prisma.$queryRaw<
    Array<{ id: string; email: string; company: string | null; score: number; similarity: number }>
  >`
    SELECT
      l.id,
      l.email,
      l.company,
      l.score,
      1 - (l.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector) as similarity
    FROM leads l
    WHERE l.embedding IS NOT NULL
      AND (l.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector) < ${distanceThreshold}
    ORDER BY l.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    item: { id: r.id, email: r.email, company: r.company, score: r.score },
    similarity: Number(r.similarity),
  }));
}

/**
 * Find similar contacts by embedding
 */
export async function findSimilarContacts(
  embedding: VectorEmbedding,
  options: SimilaritySearchOptions = {}
): Promise<VectorSearchResult<{ id: string; email: string; firstName: string; lastName: string }>[]> {
  const { metric = 'cosine', threshold = 0.7, limit = 10, dimensions = EMBEDDING_DIMENSIONS.ADA_002 } = options;

  if (!validateEmbedding(embedding, dimensions)) {
    throw new Error(`Invalid embedding: expected ${dimensions} dimensions`);
  }

  const operator = getDistanceOperator(metric);
  const embeddingStr = formatEmbedding(embedding);
  const distanceThreshold = 1 - threshold;

  const results = await prisma.$queryRaw<
    Array<{ id: string; email: string; first_name: string; last_name: string; similarity: number }>
  >`
    SELECT
      c.id,
      c.email,
      c."firstName" as first_name,
      c."lastName" as last_name,
      1 - (c.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector) as similarity
    FROM contacts c
    WHERE c.embedding IS NOT NULL
      AND (c.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector) < ${distanceThreshold}
    ORDER BY c.embedding ${Prisma.raw(operator)} ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    item: { id: r.id, email: r.email, firstName: r.first_name, lastName: r.last_name },
    similarity: Number(r.similarity),
  }));
}

/**
 * Update lead embedding
 */
export async function updateLeadEmbedding(leadId: string, embedding: VectorEmbedding): Promise<void> {
  if (!validateEmbedding(embedding)) {
    throw new Error(`Invalid embedding: expected ${EMBEDDING_DIMENSIONS.ADA_002} dimensions`);
  }

  const embeddingStr = formatEmbedding(embedding);

  await prisma.$executeRaw`
    UPDATE leads
    SET embedding = ${embeddingStr}::vector
    WHERE id = ${leadId}
  `;
}

/**
 * Update contact embedding
 */
export async function updateContactEmbedding(contactId: string, embedding: VectorEmbedding): Promise<void> {
  if (!validateEmbedding(embedding)) {
    throw new Error(`Invalid embedding: expected ${EMBEDDING_DIMENSIONS.ADA_002} dimensions`);
  }

  const embeddingStr = formatEmbedding(embedding);

  await prisma.$executeRaw`
    UPDATE contacts
    SET embedding = ${embeddingStr}::vector
    WHERE id = ${contactId}
  `;
}

/**
 * Check if pgvector extension is installed
 */
export async function checkPgVectorInstalled(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get embedding index status for leads table
 */
export async function getEmbeddingIndexStatus(): Promise<{
  indexExists: boolean;
  indexName: string | null;
  indexType: string | null;
}> {
  try {
    const result = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'leads'
        AND indexdef LIKE '%embedding%'
    `;

    if (result.length === 0) {
      return { indexExists: false, indexName: null, indexType: null };
    }

    const indexDef = result[0].indexdef;
    const indexType = indexDef.includes('hnsw') ? 'HNSW' : indexDef.includes('ivfflat') ? 'IVFFlat' : 'Unknown';

    return {
      indexExists: true,
      indexName: result[0].indexname,
      indexType,
    };
  } catch {
    return { indexExists: false, indexName: null, indexType: null };
  }
}
