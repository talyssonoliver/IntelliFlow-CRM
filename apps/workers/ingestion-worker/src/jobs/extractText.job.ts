/**
 * Text Extraction Job
 *
 * BullMQ job processor for extracting text from documents.
 * Supports PDF, DOCX, TXT, HTML formats.
 *
 * REUSES: apps/ai-worker/src/workers/ocr-worker.ts for OCR functionality
 *
 * @module ingestion-worker/jobs
 * @task IFC-163
 * @artifact apps/workers/ingestion-worker/src/jobs/extractText.job.ts
 */

import { Job } from 'bullmq';
import pino from 'pino';
import { z } from 'zod';
import { fetchDocument, extractTextFromBuffer, createChunks } from '@intelliflow/worker-shared';

// ============================================================================
// Types & Schemas
// ============================================================================

export const TextExtractionInputSchema = z.object({
  documentId: z.uuid(),
  sourceUrl: z.url(),
  format: z.enum(['pdf', 'docx', 'txt', 'html', 'rtf', 'md']),
  tenantId: z.string(),
  userId: z.string().optional(),
  language: z.string().default('en'),
  options: z
    .object({
      preserveFormatting: z.boolean().default(false),
      extractMetadata: z.boolean().default(true),
      generateEmbeddings: z.boolean().default(false),
    })
    .optional(),
});

export type TextExtractionInput = z.infer<typeof TextExtractionInputSchema>;

export interface TextExtractionResult {
  documentId: string;
  text: string;
  normalizedText: string;
  wordCount: number;
  characterCount: number;
  processingTimeMs: number;
  metadata: {
    format: string;
    language: string;
    pages?: number;
    author?: string;
    title?: string;
    createdAt?: string;
    modifiedAt?: string;
    extractedAt: string;
  };
  chunks: string[];
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

// ============================================================================
// Job Processor
// ============================================================================

export class TextExtractionProcessor {
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger =
      logger ||
      pino({
        name: 'text-extraction',
        level: 'info',
      });
  }

  /**
   * Process a text extraction job
   */
  async process(job: Job<TextExtractionInput>): Promise<TextExtractionResult> {
    const startTime = Date.now();
    const input = TextExtractionInputSchema.parse(job.data);

    const jobLogger = this.logger.child({
      jobId: job.id,
      documentId: input.documentId,
      format: input.format,
    });

    jobLogger.info('Starting text extraction');

    try {
      // 1. Fetch document from storage
      const buffer = await fetchDocument(input.sourceUrl);

      // 2. Extract text (shared helper — same logic as the ai-worker consumer)
      const { text, metadata } = await extractTextFromBuffer(buffer, input.format);

      // 3. Normalize text
      const normalizedText = this.normalizeText(text);

      // 4. Create chunks for RAG
      const chunks = createChunks(normalizedText);

      // 6. Build result
      const processingTimeMs = Date.now() - startTime;

      const result: TextExtractionResult = {
        documentId: input.documentId,
        text,
        normalizedText,
        wordCount: normalizedText.split(/\s+/).filter((w) => w.length > 0).length,
        characterCount: normalizedText.length,
        processingTimeMs,
        metadata: {
          format: input.format,
          language: input.language,
          pages: metadata?.pages as number | undefined,
          author: metadata?.author as string | undefined,
          title: metadata?.title as string | undefined,
          extractedAt: new Date().toISOString(),
        },
        chunks,
        status: 'success',
      };

      jobLogger.info(
        { wordCount: result.wordCount, processingTimeMs },
        'Text extraction completed'
      );

      return result;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      jobLogger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Text extraction failed'
      );

      return {
        documentId: input.documentId,
        text: '',
        normalizedText: '',
        wordCount: 0,
        characterCount: 0,
        processingTimeMs,
        metadata: {
          format: input.format,
          language: input.language,
          extractedAt: new Date().toISOString(),
        },
        chunks: [],
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Normalize text for search and RAG
   */
  private normalizeText(text: string): string {
    return (
      text
        // Normalize whitespace
        .replaceAll(/\s+/g, ' ')
        // Remove control characters
        // eslint-disable-next-line no-control-regex
        .replaceAll(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        // Normalize quotes
        .replaceAll(/[""]/g, '"')
        .replaceAll(/['']/g, "'")
        // Normalize dashes
        .replaceAll(/[–—]/g, '-')
        // Trim
        .trim()
    );
  }
}

// ============================================================================
// Job Handler Factory
// ============================================================================

export function createTextExtractionJob(logger?: pino.Logger) {
  const processor = new TextExtractionProcessor(logger);

  return async (job: Job<TextExtractionInput>): Promise<TextExtractionResult> => {
    return processor.process(job);
  };
}
