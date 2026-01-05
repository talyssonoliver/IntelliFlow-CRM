/**
 * Document Indexer Module (IFC-155)
 *
 * Re-exports document indexing types from ai-worker services.
 * This package provides the public API for document indexing.
 *
 * Implementation: apps/ai-worker/src/services/document-indexer.ts
 *
 * @module @intelliflow/search/indexer
 */

import { z } from 'zod';

// ============================================
// Indexer Configuration
// ============================================

export const IndexerConfigSchema = z.object({
  batchSize: z.number().min(1).max(100).default(10),
  embeddingModel: z
    .enum(['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'])
    .default('text-embedding-3-small'),
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
// Indexing Results
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

// ============================================
// Document Types
// ============================================

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
// Service Interface
// ============================================

/**
 * Interface for the document indexer.
 * Actual implementation in apps/ai-worker/src/services/document-indexer.ts
 */
export interface IDocumentIndexer {
  indexDocument(documentId: string): Promise<IndexResult>;
  indexNote(noteId: string): Promise<IndexResult>;
  indexBatch(documentIds: string[]): Promise<BatchIndexResult>;
  indexNotesBatch(noteIds: string[]): Promise<BatchIndexResult>;
  reindexAll(tenantId?: string, onProgress?: (progress: ReindexProgress) => void): Promise<BatchIndexResult>;
  reindexAllNotes(tenantId?: string, onProgress?: (progress: ReindexProgress) => void): Promise<BatchIndexResult>;
  getUnindexedDocuments(tenantId?: string, limit?: number): Promise<string[]>;
  getUnindexedNotes(tenantId?: string, limit?: number): Promise<string[]>;
  getIndexStats(tenantId?: string): Promise<{
    documents: { total: number; indexed: number; unindexed: number };
    notes: { total: number; indexed: number; unindexed: number };
  }>;
}
