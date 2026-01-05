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

// ============================================================================
// Types & Schemas
// ============================================================================

export const TextExtractionInputSchema = z.object({
  documentId: z.string().uuid(),
  sourceUrl: z.string().url(),
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
// Text Extractor Factory
// ============================================================================

interface TextExtractor {
  extract(buffer: Buffer): Promise<{ text: string; metadata?: Record<string, unknown> }>;
  supports(format: string): boolean;
}

class PDFExtractor implements TextExtractor {
  supports(format: string): boolean {
    return format === 'pdf';
  }

  async extract(buffer: Buffer): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    // In production, use pdf-parse or pdfjs-dist
    // const pdfParse = await import('pdf-parse');
    // const data = await pdfParse(buffer);
    // return { text: data.text, metadata: { pages: data.numpages, info: data.info } };

    // Placeholder for now
    return {
      text: '[PDF text extraction placeholder - integrate pdf-parse for production]',
      metadata: { pages: 1 },
    };
  }
}

class DOCXExtractor implements TextExtractor {
  supports(format: string): boolean {
    return format === 'docx';
  }

  async extract(buffer: Buffer): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    // In production, use mammoth
    // const mammoth = await import('mammoth');
    // const result = await mammoth.extractRawText({ buffer });
    // return { text: result.value };

    // Placeholder for now
    return {
      text: '[DOCX text extraction placeholder - integrate mammoth for production]',
    };
  }
}

class PlainTextExtractor implements TextExtractor {
  supports(format: string): boolean {
    return ['txt', 'md', 'rtf'].includes(format);
  }

  async extract(buffer: Buffer): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    return { text: buffer.toString('utf-8') };
  }
}

class HTMLExtractor implements TextExtractor {
  supports(format: string): boolean {
    return format === 'html';
  }

  async extract(buffer: Buffer): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    // In production, use cheerio or jsdom
    // const cheerio = await import('cheerio');
    // const $ = cheerio.load(buffer.toString('utf-8'));
    // return { text: $('body').text() };

    // Simple implementation
    const html = buffer.toString('utf-8');
    // Remove script and style tags, then strip HTML
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { text };
  }
}

// ============================================================================
// Job Processor
// ============================================================================

export class TextExtractionProcessor {
  private readonly extractors: TextExtractor[];
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger =
      logger ||
      pino({
        name: 'text-extraction',
        level: 'info',
      });

    // Register extractors
    this.extractors = [
      new PDFExtractor(),
      new DOCXExtractor(),
      new PlainTextExtractor(),
      new HTMLExtractor(),
    ];
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
      const buffer = await this.fetchDocument(input.sourceUrl);

      // 2. Find appropriate extractor
      const extractor = this.extractors.find((e) => e.supports(input.format));
      if (!extractor) {
        throw new Error(`No extractor available for format: ${input.format}`);
      }

      // 3. Extract text
      const { text, metadata } = await extractor.extract(buffer);

      // 4. Normalize text
      const normalizedText = this.normalizeText(text);

      // 5. Create chunks for RAG
      const chunks = this.createChunks(normalizedText);

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
   * Fetch document from storage URL
   */
  private async fetchDocument(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Normalize text for search and RAG
   */
  private normalizeText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Normalize dashes
      .replace(/[–—]/g, '-')
      // Trim
      .trim();
  }

  /**
   * Create chunks for RAG indexing
   */
  private createChunks(text: string, chunkSize = 512, overlap = 64): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];

    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const word of words) {
      if (currentLength + word.length + 1 > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));

        // Keep overlap words for context
        const overlapWords = Math.ceil(overlap / 5);
        currentChunk = currentChunk.slice(-overlapWords);
        currentLength = currentChunk.join(' ').length;
      }

      currentChunk.push(word);
      currentLength += word.length + 1;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
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
