/**
 * Document Indexer Service (IFC-155)
 *
 * Handles embedding generation and index management for case documents and notes.
 * Provides batch indexing, re-indexing, and index maintenance capabilities.
 *
 * Features:
 * - Generate embeddings for documents using OpenAI text-embedding-3-small
 * - Batch processing for efficient indexing
 * - Re-index support for full index rebuilds
 * - Progress tracking for long-running operations
 *
 * @module @intelliflow/ai-worker/services/document-indexer
 */

import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

// ============================================
// Configuration
// ============================================

export const IndexerConfigSchema = z.object({
  batchSize: z.number().min(1).max(100).default(10),
  embeddingModel: z.enum(['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large']).default('text-embedding-3-small'),
  maxConcurrent: z.number().min(1).max(10).default(3),
  retryAttempts: z.number().min(0).max(5).default(3),
  retryDelayMs: z.number().min(100).max(10000).default(1000),
});

export type IndexerConfig = z.infer<typeof IndexerConfigSchema>;

export const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  batchSize: 10,
  embeddingModel: 'text-embedding-3-small',
  maxConcurrent: 3,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================
// Types
// ============================================

export interface IndexResult {
  documentId: string;
  success: boolean;
  error?: string;
  embeddingGenerated: boolean;
  processingTimeMs: number;
}

export interface BatchIndexResult {
  total: number;
  successful: number;
  failed: number;
  results: IndexResult[];
  totalTimeMs: number;
}

export interface ReindexProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  estimatedRemainingMs: number;
}

export interface DocumentToIndex {
  id: string;
  title: string;
  description: string | null;
  extracted_text: string | null;
  tags: string[];
}

export interface NoteToIndex {
  id: string;
  content: string;
}

// ============================================
// Embedding Generator (Mock - integrate with EmbeddingChain)
// ============================================

interface EmbeddingResult {
  vector: number[];
  model: string;
  dimensions: number;
}

async function generateEmbedding(
  text: string,
  _model: string = 'text-embedding-3-small'
): Promise<EmbeddingResult | null> {
  // TODO: Integrate with apps/ai-worker/src/chains/embedding.chain.ts
  // This is a placeholder that returns null - in production:
  // const chain = new EmbeddingChain({ model });
  // return await chain.generateEmbedding({ text });

  // For now, return a mock embedding for testing
  // In production, remove this mock and use the real embedding chain
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_EMBEDDINGS === 'true') {
    // Generate deterministic mock embedding based on text hash
    const hash = simpleHash(text);
    const vector = Array.from({ length: 1536 }, (_, i) =>
      Math.sin(hash + i) * 0.5 + 0.5
    );
    return {
      vector,
      model: 'text-embedding-3-small',
      dimensions: 1536,
    };
  }

  console.log(`[DocumentIndexer] Would generate embedding for text: ${text.slice(0, 50)}...`);
  return null;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================
// Document Indexer Service
// ============================================

export class DocumentIndexer {
  private config: IndexerConfig;

  constructor(
    private prisma: PrismaClient,
    config: Partial<IndexerConfig> = {}
  ) {
    this.config = { ...DEFAULT_INDEXER_CONFIG, ...config };
  }

  // ========== Single Document Indexing ==========

  /**
   * Index a single document - generate embedding and update record
   */
  async indexDocument(documentId: string): Promise<IndexResult> {
    const startTime = Date.now();

    try {
      // Fetch document using raw query to include extracted_text (IFC-155 field)
      const documents = await this.prisma.$queryRaw<DocumentToIndex[]>`
        SELECT id, title, description, extracted_text, tags
        FROM case_documents
        WHERE id = ${documentId}
        LIMIT 1
      `;
      const document = documents[0] ?? null;

      if (!document) {
        return {
          documentId,
          success: false,
          error: 'Document not found',
          embeddingGenerated: false,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Build text for embedding
      const textToEmbed = this.buildDocumentText(document);

      // Generate embedding
      const embedding = await generateEmbedding(textToEmbed, this.config.embeddingModel);

      if (!embedding) {
        // Search vector is auto-updated by trigger, so partial success
        return {
          documentId,
          success: true,
          embeddingGenerated: false,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Update document with embedding
      const embeddingStr = `[${embedding.vector.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE case_documents
        SET embedding = ${embeddingStr}::vector
        WHERE id = ${documentId}
      `;

      return {
        documentId,
        success: true,
        embeddingGenerated: true,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        documentId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        embeddingGenerated: false,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Index a single contact note
   */
  async indexNote(noteId: string): Promise<IndexResult> {
    const startTime = Date.now();

    try {
      // Fetch note
      const note = await this.prisma.contactNote.findUnique({
        where: { id: noteId },
        select: {
          id: true,
          content: true,
        },
      });

      if (!note) {
        return {
          documentId: noteId,
          success: false,
          error: 'Note not found',
          embeddingGenerated: false,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Generate embedding
      const embedding = await generateEmbedding(note.content, this.config.embeddingModel);

      if (!embedding) {
        return {
          documentId: noteId,
          success: true,
          embeddingGenerated: false,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Update note with embedding
      const embeddingStr = `[${embedding.vector.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE contact_notes
        SET embedding = ${embeddingStr}::vector
        WHERE id = ${noteId}
      `;

      return {
        documentId: noteId,
        success: true,
        embeddingGenerated: true,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        documentId: noteId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        embeddingGenerated: false,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  // ========== Batch Indexing ==========

  /**
   * Index multiple documents in batch
   */
  async indexBatch(documentIds: string[]): Promise<BatchIndexResult> {
    const startTime = Date.now();
    const results: IndexResult[] = [];

    // Process in chunks to respect rate limits
    for (let i = 0; i < documentIds.length; i += this.config.maxConcurrent) {
      const chunk = documentIds.slice(i, i + this.config.maxConcurrent);
      const chunkResults = await Promise.all(
        chunk.map(id => this.indexDocument(id))
      );
      results.push(...chunkResults);

      // Small delay between chunks to avoid rate limiting
      if (i + this.config.maxConcurrent < documentIds.length) {
        await this.delay(100);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: documentIds.length,
      successful,
      failed,
      results,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Index multiple notes in batch
   */
  async indexNotesBatch(noteIds: string[]): Promise<BatchIndexResult> {
    const startTime = Date.now();
    const results: IndexResult[] = [];

    for (let i = 0; i < noteIds.length; i += this.config.maxConcurrent) {
      const chunk = noteIds.slice(i, i + this.config.maxConcurrent);
      const chunkResults = await Promise.all(
        chunk.map(id => this.indexNote(id))
      );
      results.push(...chunkResults);

      if (i + this.config.maxConcurrent < noteIds.length) {
        await this.delay(100);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: noteIds.length,
      successful,
      failed,
      results,
      totalTimeMs: Date.now() - startTime,
    };
  }

  // ========== Re-indexing ==========

  /**
   * Re-index all documents for a tenant (or all tenants if not specified)
   */
  async reindexAll(
    tenantId?: string,
    onProgress?: (progress: ReindexProgress) => void
  ): Promise<BatchIndexResult> {
    const startTime = Date.now();
    const allResults: IndexResult[] = [];

    // Get total count
    const whereClause = tenantId
      ? { tenant_id: tenantId, deleted_at: null }
      : { deleted_at: null };

    const totalCount = await this.prisma.caseDocument.count({
      where: whereClause,
    });

    const totalBatches = Math.ceil(totalCount / this.config.batchSize);
    let processed = 0;
    let successful = 0;
    let failed = 0;

    // Process in batches
    for (let batch = 0; batch < totalBatches; batch++) {
      const documents = await this.prisma.caseDocument.findMany({
        where: whereClause,
        select: { id: true },
        skip: batch * this.config.batchSize,
        take: this.config.batchSize,
        orderBy: { created_at: 'asc' },
      });

      const batchResult = await this.indexBatch(documents.map(d => d.id));
      allResults.push(...batchResult.results);

      processed += batchResult.total;
      successful += batchResult.successful;
      failed += batchResult.failed;

      // Report progress
      if (onProgress) {
        const elapsed = Date.now() - startTime;
        const avgTimePerDoc = elapsed / processed;
        const remaining = totalCount - processed;
        const estimatedRemainingMs = remaining * avgTimePerDoc;

        onProgress({
          total: totalCount,
          processed,
          successful,
          failed,
          currentBatch: batch + 1,
          totalBatches,
          estimatedRemainingMs,
        });
      }

      // Delay between batches
      if (batch < totalBatches - 1) {
        await this.delay(this.config.retryDelayMs);
      }
    }

    return {
      total: totalCount,
      successful,
      failed,
      results: allResults,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Re-index all notes for a tenant
   */
  async reindexAllNotes(
    tenantId?: string,
    onProgress?: (progress: ReindexProgress) => void
  ): Promise<BatchIndexResult> {
    const startTime = Date.now();
    const allResults: IndexResult[] = [];

    // ContactNote doesn't have tenantId directly - filter through Contact relation
    const whereClause = tenantId ? { contact: { tenantId } } : {};

    const totalCount = await this.prisma.contactNote.count({
      where: whereClause,
    });

    const totalBatches = Math.ceil(totalCount / this.config.batchSize);
    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (let batch = 0; batch < totalBatches; batch++) {
      const notes = await this.prisma.contactNote.findMany({
        where: whereClause,
        select: { id: true },
        skip: batch * this.config.batchSize,
        take: this.config.batchSize,
        orderBy: { createdAt: 'asc' },
      });

      const batchResult = await this.indexNotesBatch(notes.map((n: { id: string }) => n.id));
      allResults.push(...batchResult.results);

      processed += batchResult.total;
      successful += batchResult.successful;
      failed += batchResult.failed;

      if (onProgress) {
        const elapsed = Date.now() - startTime;
        const avgTimePerDoc = elapsed / processed;
        const remaining = totalCount - processed;
        const estimatedRemainingMs = remaining * avgTimePerDoc;

        onProgress({
          total: totalCount,
          processed,
          successful,
          failed,
          currentBatch: batch + 1,
          totalBatches,
          estimatedRemainingMs,
        });
      }

      if (batch < totalBatches - 1) {
        await this.delay(this.config.retryDelayMs);
      }
    }

    return {
      total: totalCount,
      successful,
      failed,
      results: allResults,
      totalTimeMs: Date.now() - startTime,
    };
  }

  // ========== Index Maintenance ==========

  /**
   * Get documents that need indexing (no embedding)
   */
  async getUnindexedDocuments(
    tenantId?: string,
    limit: number = 100
  ): Promise<string[]> {
    let documents: Array<{ id: string }>;
    if (tenantId) {
      documents = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM case_documents
        WHERE embedding IS NULL AND deleted_at IS NULL AND tenant_id = ${tenantId}
        LIMIT ${limit}
      `;
    } else {
      documents = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM case_documents
        WHERE embedding IS NULL AND deleted_at IS NULL
        LIMIT ${limit}
      `;
    }

    return documents.map(d => d.id);
  }

  /**
   * Get notes that need indexing (no embedding)
   */
  async getUnindexedNotes(
    tenantId?: string,
    limit: number = 100
  ): Promise<string[]> {
    let notes: Array<{ id: string }>;
    if (tenantId) {
      notes = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM contact_notes
        WHERE embedding IS NULL AND "tenantId" = ${tenantId}
        LIMIT ${limit}
      `;
    } else {
      notes = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM contact_notes
        WHERE embedding IS NULL
        LIMIT ${limit}
      `;
    }

    return notes.map(n => n.id);
  }

  /**
   * Get index statistics
   */
  async getIndexStats(tenantId?: string): Promise<{
    documents: { total: number; indexed: number; unindexed: number };
    notes: { total: number; indexed: number; unindexed: number };
  }> {
    const docTotal = await this.prisma.caseDocument.count({
      where: tenantId ? { tenant_id: tenantId, deleted_at: null } : { deleted_at: null },
    });

    // Use separate queries based on tenantId to avoid nested $queryRaw issues
    let docIndexed: Array<{ count: bigint }>;
    if (tenantId) {
      docIndexed = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM case_documents
        WHERE embedding IS NOT NULL AND deleted_at IS NULL AND tenant_id = ${tenantId}
      `;
    } else {
      docIndexed = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM case_documents
        WHERE embedding IS NOT NULL AND deleted_at IS NULL
      `;
    }

    const noteTotal = await this.prisma.contactNote.count({
      where: tenantId ? { tenantId } : {},
    });

    let noteIndexed: Array<{ count: bigint }>;
    if (tenantId) {
      noteIndexed = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM contact_notes
        WHERE embedding IS NOT NULL AND "tenantId" = ${tenantId}
      `;
    } else {
      noteIndexed = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM contact_notes
        WHERE embedding IS NOT NULL
      `;
    }

    const docIndexedCount = Number(docIndexed[0]?.count || 0);
    const noteIndexedCount = Number(noteIndexed[0]?.count || 0);

    return {
      documents: {
        total: docTotal,
        indexed: docIndexedCount,
        unindexed: docTotal - docIndexedCount,
      },
      notes: {
        total: noteTotal,
        indexed: noteIndexedCount,
        unindexed: noteTotal - noteIndexedCount,
      },
    };
  }

  // ========== Helper Methods ==========

  /**
   * Build text content for embedding from document fields
   */
  private buildDocumentText(doc: DocumentToIndex): string {
    const parts = [
      doc.title,
      doc.description || '',
      doc.extracted_text || '',
      doc.tags?.join(' ') || '',
    ];

    return parts.filter(Boolean).join('\n\n').trim();
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// Factory Function
// ============================================

export function createDocumentIndexer(
  prisma: PrismaClient,
  config?: Partial<IndexerConfig>
): DocumentIndexer {
  return new DocumentIndexer(prisma, config);
}

export default DocumentIndexer;
