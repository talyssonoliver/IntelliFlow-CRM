/**
 * Ingestion Queue Consumers (D5 fix)
 *
 * Boots BullMQ workers inside ai-worker that consume:
 *  - intelliflow-text-extraction  (PDF/DOCX/TXT/HTML documents)
 *  - intelliflow-ocr-processing   (image files)
 *
 * Previously these queues were added to Bull Board as read-only "external"
 * queues, leaving jobs silently backlogged because the ingestion-worker is
 * not deployed to Railway.  This module wires real consumption inside the
 * already-deployed ai-worker process so jobs are drained.
 *
 * Dependency-cycle note: @intelliflow/ingestion-worker depends on
 * @intelliflow/ai-worker (for OCRWorker + agent-status).  Importing
 * ingestion-worker from ai-worker would create a circular dependency.
 * Instead we copy the self-contained TextExtractionProcessor and reuse
 * OCRWorker which already lives inside ai-worker.
 *
 * @module workers/ingestion-workers
 * @task D5 / issue #259
 */

import { Job, Worker, Queue } from 'bullmq';
import pino from 'pino';
import { z } from 'zod';
import { OCRWorker } from './ocr-worker.js';

// ============================================================================
// Queue names (must match the producers in apps/api)
// ============================================================================

export const TEXT_EXTRACTION_QUEUE = 'intelliflow-text-extraction';
export const OCR_PROCESSING_QUEUE = 'intelliflow-ocr-processing';

// ============================================================================
// Job data schema — mirrors apps/workers/ingestion-worker/src/jobs/extractText.job.ts
// ============================================================================

export const IngestionJobDataSchema = z.object({
  documentId: z.string().uuid(),
  sourceUrl: z.string().url(),
  format: z.string(),
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

export type IngestionJobData = z.infer<typeof IngestionJobDataSchema>;

export interface IngestionJobResult {
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
    extractedAt: string;
  };
  chunks: string[];
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

// ============================================================================
// Text-extraction helpers (self-contained, no cycle)
// ============================================================================

async function fetchDocument(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
  }
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Normalize text for search and RAG.
 * Delegates to OCRWorker.normalizeText() — that method owns the
 * control-character stripping logic and its accompanying pre-existing
 * eslint suppress, keeping this module free of new suppressors.
 * A shared singleton OCRWorker is created lazily and reused.
 */
let _sharedOCRWorker: OCRWorker | null = null;
function getSharedOCRWorker(): OCRWorker {
  if (!_sharedOCRWorker) {
    _sharedOCRWorker = new OCRWorker();
  }
  return _sharedOCRWorker;
}

function normalizeText(text: string): string {
  return getSharedOCRWorker().normalizeText(text);
}

function createChunks(text: string, chunkSize = 512, overlap = 64): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
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

async function extractTextFromBuffer(
  buffer: Buffer,
  format: string
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  switch (format) {
    case 'pdf': {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      let pageCount: number | undefined;
      try {
        const info = await parser.getInfo();
        pageCount = info.total;
      } catch {
        // getInfo is best-effort
      }
      return { text: textResult.text, metadata: { pages: pageCount } };
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value };
    }
    case 'txt':
    case 'md':
    case 'rtf':
      return { text: buffer.toString('utf-8') };
    case 'html': {
      const html = buffer.toString('utf-8');
      let stripped = html;
      for (;;) {
        const next = stripped
          .replaceAll(/<script[^>]*>[\s\S]*?<\/script[^>]*>/gi, '')
          .replaceAll(/<style[^>]*>[\s\S]*?<\/style[^>]*>/gi, '');
        if (next === stripped) break;
        stripped = next;
      }
      const text = stripped
        .replaceAll(/<[^>]+>/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
      return { text };
    }
    default:
      // Fall back to plain-text read for unknown formats
      return { text: buffer.toString('utf-8') };
  }
}

// ============================================================================
// Text-extraction processor
// ============================================================================

async function processTextExtractionJob(
  job: Job<IngestionJobData>,
  logger: pino.Logger,
  generateEmbeddingFn?: (text: string) => Promise<number[] | null>
): Promise<IngestionJobResult> {
  const startTime = Date.now();
  const input = IngestionJobDataSchema.parse(job.data);

  const jobLogger = logger.child({
    jobId: job.id,
    documentId: input.documentId,
    format: input.format,
  });

  jobLogger.info('Starting text extraction');

  try {
    const buffer = await fetchDocument(input.sourceUrl);
    const { text, metadata } = await extractTextFromBuffer(buffer, input.format);
    const normalized = normalizeText(text);
    const chunks = createChunks(normalized);

    // If embeddings are requested, delegate to the existing embedding chain
    // (ai-worker already owns this path; OCR worker re-uses it too).
    if (input.options?.generateEmbeddings && generateEmbeddingFn) {
      try {
        await generateEmbeddingFn(normalized.slice(0, 8000));
      } catch (embedErr) {
        jobLogger.warn(
          { err: embedErr instanceof Error ? embedErr.message : String(embedErr) },
          'Embedding generation failed (non-fatal) — text extraction succeeded'
        );
      }
    }

    const processingTimeMs = Date.now() - startTime;
    jobLogger.info(
      { wordCount: normalized.split(/\s+/).filter(Boolean).length, processingTimeMs },
      'Text extraction completed'
    );

    return {
      documentId: input.documentId,
      text,
      normalizedText: normalized,
      wordCount: normalized.split(/\s+/).filter((w) => w.length > 0).length,
      characterCount: normalized.length,
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

// ============================================================================
// OCR processor
// ============================================================================

async function processOCRJob(
  job: Job<IngestionJobData>,
  logger: pino.Logger,
  generateEmbeddingFn?: (text: string) => Promise<number[] | null>
): Promise<IngestionJobResult> {
  const startTime = Date.now();
  const input = IngestionJobDataSchema.parse(job.data);

  const jobLogger = logger.child({ jobId: job.id, documentId: input.documentId });
  jobLogger.info('Starting OCR processing');

  try {
    const ocrWorker = new OCRWorker();

    // Supported OCR formats; fall back to pdf for anything unrecognised
    const supportedOcrFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'webp'] as const;
    type SupportedFormat = (typeof supportedOcrFormats)[number];
    const ocrFormat: SupportedFormat = supportedOcrFormats.includes(input.format as SupportedFormat)
      ? (input.format as SupportedFormat)
      : 'pdf';

    const ocrResult = await ocrWorker.processDocument({
      jobId: job.id ?? `ocr-${Date.now()}`,
      documentId: input.documentId,
      sourceUrl: input.sourceUrl,
      format: ocrFormat,
      language: input.language,
    });

    const normalized = ocrWorker.normalizeText(ocrResult.extractedText);
    const chunks = ocrWorker.createSearchableChunks(normalized);

    if (input.options?.generateEmbeddings && generateEmbeddingFn) {
      try {
        await generateEmbeddingFn(normalized.slice(0, 8000));
      } catch (embedErr) {
        jobLogger.warn(
          { err: embedErr instanceof Error ? embedErr.message : String(embedErr) },
          'Embedding generation failed (non-fatal) — OCR extraction succeeded'
        );
      }
    }

    const processingTimeMs = Date.now() - startTime;
    jobLogger.info(
      { pages: ocrResult.pageCount, confidence: ocrResult.confidence, processingTimeMs },
      'OCR processing completed'
    );

    return {
      documentId: input.documentId,
      text: ocrResult.extractedText,
      normalizedText: normalized,
      wordCount: normalized.split(/\s+/).filter((w) => w.length > 0).length,
      characterCount: normalized.length,
      processingTimeMs,
      metadata: {
        format: input.format,
        language: input.language,
        pages: ocrResult.pageCount,
        extractedAt: new Date().toISOString(),
      },
      chunks,
      status: ocrResult.status === 'failed' ? 'failed' : 'success',
      error: ocrResult.error,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    jobLogger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'OCR processing failed'
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

// ============================================================================
// Worker handle (returned from bootIngestionWorkers for graceful shutdown)
// ============================================================================

export interface IngestionWorkersHandle {
  stop(): Promise<void>;
}

// ============================================================================
// Boot function — mirrors bootContactEmbedWorker in ai-worker.ts
// ============================================================================

/**
 * Boot BullMQ workers that consume the document-ingestion queues.
 *
 * Must be called after Prisma + embeddingChain are available (same call-site
 * as bootContactEmbedWorker — inside initPrismaDependentServices).
 *
 * Workers created here are intentionally separate from the BaseWorker-managed
 * queues (AI_WORKER_QUEUES) so they don't interfere with the main AIWorker
 * lifecycle.  Shutdown is handled by the returned IngestionWorkersHandle.
 *
 * Bull Board visibility: the two queues are removed from the "external /
 * read-only" list in startDashboard() and added as genuinely-consumed workers
 * so the dashboard reflects accurate depth.
 */
export async function bootIngestionWorkers(
  redisConnection: { host: string; port: number; password?: string; username?: string },
  generateEmbeddingFn: (text: string) => Promise<number[] | null>,
  logger: pino.Logger
): Promise<IngestionWorkersHandle> {
  const workerLogger = logger.child({ component: 'ingestion-workers' });

  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { age: 86_400, count: 200 },
    removeOnFail: { age: 604_800, count: 1000 },
  };

  // Text-extraction worker
  const textWorker = new Worker<IngestionJobData, IngestionJobResult>(
    TEXT_EXTRACTION_QUEUE,
    (job) => processTextExtractionJob(job, workerLogger, generateEmbeddingFn),
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );
  textWorker.on('failed', (job, error) => {
    workerLogger.warn({ jobId: job?.id, err: error?.message }, 'text-extraction job failed');
  });

  // OCR worker
  const ocrWorkerInstance = new Worker<IngestionJobData, IngestionJobResult>(
    OCR_PROCESSING_QUEUE,
    (job) => processOCRJob(job, workerLogger, generateEmbeddingFn),
    {
      connection: redisConnection,
      concurrency: 1, // OCR is CPU-heavy
    }
  );
  ocrWorkerInstance.on('failed', (job, error) => {
    workerLogger.warn({ jobId: job?.id, err: error?.message }, 'ocr-processing job failed');
  });

  // Create queues (needed only for default-job-options; workers own consumption)
  const textQueue = new Queue<IngestionJobData, IngestionJobResult>(TEXT_EXTRACTION_QUEUE, {
    connection: redisConnection,
    defaultJobOptions,
  });
  const ocrQueue = new Queue<IngestionJobData, IngestionJobResult>(OCR_PROCESSING_QUEUE, {
    connection: redisConnection,
    defaultJobOptions,
  });

  workerLogger.info(
    { queues: [TEXT_EXTRACTION_QUEUE, OCR_PROCESSING_QUEUE] },
    'Ingestion queue workers started — text-extraction and ocr-processing now consumed'
  );

  return {
    async stop(): Promise<void> {
      await Promise.all([
        textWorker.close(),
        ocrWorkerInstance.close(),
        textQueue.close(),
        ocrQueue.close(),
      ]);
      workerLogger.info('Ingestion workers stopped');
    },
  };
}
