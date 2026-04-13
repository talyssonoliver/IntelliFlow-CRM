/**
 * Ingestion Worker Entry Point
 *
 * File processing worker for text extraction, OCR, and embedding generation.
 * Reuses OCRWorker from apps/ai-worker for image processing.
 *
 * @module @intelliflow/ingestion-worker
 * @task IFC-163
 * @artifact apps/workers/ingestion-worker/src/main.ts
 */

import { Job } from 'bullmq';
import pino from 'pino';
import { BaseWorker, type ComponentHealth } from '@intelliflow/worker-shared';
import {
  TextExtractionProcessor,
  type TextExtractionInput,
  type TextExtractionResult,
} from './jobs/extractText.job';
// Agent-status functions loaded dynamically from @intelliflow/ai-worker barrel.
// Uses `any` to avoid compile-time dependency on ai-worker dist types (they may be stale).
interface AgentStatusCtx {
  tenantId: string;
  userId: string;
  agentType: string;
  taskDescription: string;
}

interface AgentStatusFns {
  markAgentActive: (ctx: AgentStatusCtx) => Promise<void>;
  markAgentIdle: (
    ctx: AgentStatusCtx,
    summary?: string,
    meta?: { durationMs: number; result?: Record<string, unknown> }
  ) => Promise<void>;
  markAgentError: (ctx: AgentStatusCtx, error: string, durationMs?: number) => Promise<void>;
}

let agentStatusFns: AgentStatusFns | null = null;

async function getAgentStatusFns(): Promise<AgentStatusFns> {
  if (agentStatusFns) return agentStatusFns;
  const m = (await import('@intelliflow/ai-worker')) as any;
  if (m.markAgentActive) {
    agentStatusFns = {
      markAgentActive: m.markAgentActive,
      markAgentIdle: m.markAgentIdle,
      markAgentError: m.markAgentError,
    };
    return agentStatusFns;
  }
  throw new Error('Agent-status functions not available');
}

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUE_NAMES = {
  TEXT_EXTRACTION: 'intelliflow-text-extraction',
  OCR_PROCESSING: 'intelliflow-ocr-processing',
  EMBEDDING_GENERATION: 'intelliflow-embedding-generation',
} as const;

// ============================================================================
// Types
// ============================================================================

type IngestionJobData = TextExtractionInput; // Can be extended with union types
type IngestionJobResult = TextExtractionResult; // Can be extended with union types

interface IngestionWorkerConfig {
  /** Enable text extraction queue */
  enableTextExtraction?: boolean;
  /** Enable OCR processing queue */
  enableOCR?: boolean;
  /** Enable embedding generation queue */
  enableEmbeddings?: boolean;
}

// ============================================================================
// Agent Status Helpers
// ============================================================================

async function reportTextExtractionStatus(
  fns: AgentStatusFns,
  statusCtx: AgentStatusCtx,
  result: TextExtractionResult,
  durationMs: number
): Promise<void> {
  if (result.status === 'failed') {
    await fns.markAgentError(statusCtx, result.error || 'Extraction failed', durationMs);
  } else {
    await fns.markAgentIdle(statusCtx, undefined, {
      durationMs,
      result: { wordCount: result.wordCount, format: result.metadata.format },
    });
  }
}

async function reportOcrStatus(
  fns: AgentStatusFns,
  statusCtx: AgentStatusCtx,
  ocrResult: { status: string; error?: string; pageCount: number; confidence: number },
  normalizedText: string,
  durationMs: number
): Promise<void> {
  if (ocrResult.status === 'failed') {
    await fns.markAgentError(statusCtx, ocrResult.error || 'OCR failed', durationMs);
  } else {
    await fns.markAgentIdle(statusCtx, undefined, {
      durationMs,
      result: {
        pages: ocrResult.pageCount,
        confidence: ocrResult.confidence,
        wordCount: normalizedText.split(/\s+/).filter((w: string) => w.length > 0).length,
      },
    });
  }
}

// ============================================================================
// Ingestion Worker
// ============================================================================

export class IngestionWorker extends BaseWorker<IngestionJobData, IngestionJobResult> {
  private readonly textExtractionProcessor: TextExtractionProcessor;
  private readonly workerConfig: IngestionWorkerConfig;
  private processedByType: Record<string, number> = {};

  constructor(config?: IngestionWorkerConfig) {
    const enabledQueues: string[] = [];

    // Determine which queues to process
    if (config?.enableTextExtraction !== false) {
      enabledQueues.push(QUEUE_NAMES.TEXT_EXTRACTION);
    }
    if (config?.enableOCR) {
      enabledQueues.push(QUEUE_NAMES.OCR_PROCESSING);
    }
    if (config?.enableEmbeddings) {
      enabledQueues.push(QUEUE_NAMES.EMBEDDING_GENERATION);
    }

    super({
      name: 'ingestion-worker',
      queues: enabledQueues.length > 0 ? enabledQueues : [QUEUE_NAMES.TEXT_EXTRACTION],
    });

    this.workerConfig = config || {};
    this.textExtractionProcessor = new TextExtractionProcessor(this.logger);
  }

  /**
   * Initialize worker resources
   */
  protected async onStart(): Promise<void> {
    this.logger.info(
      {
        queues: this.queueNames,
        config: this.workerConfig,
      },
      'Initializing ingestion worker'
    );

    // Initialize processing counters
    this.processedByType = {
      'text-extraction': 0,
      ocr: 0,
      embedding: 0,
    };

    this.logger.info('Ingestion worker initialized');
  }

  /**
   * Cleanup worker resources
   */
  protected async onStop(): Promise<void> {
    this.logger.info({ processedByType: this.processedByType }, 'Stopping ingestion worker');
  }

  /**
   * Process a job based on queue
   */
  protected async processJob(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    const queueName = job.queueName;

    this.logger.debug({ jobId: job.id, queue: queueName }, 'Processing ingestion job');

    switch (queueName) {
      case QUEUE_NAMES.TEXT_EXTRACTION:
        return this.processTextExtraction(job);

      case QUEUE_NAMES.OCR_PROCESSING:
        return this.processOCR(job);

      case QUEUE_NAMES.EMBEDDING_GENERATION:
        return this.processEmbedding(job);

      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  /**
   * Get additional health check dependencies
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    const totalProcessed = Object.values(this.processedByType).reduce((a, b) => a + b, 0);

    return {
      textExtraction: {
        status: 'ok',
        message: `Processed: ${this.processedByType['text-extraction'] || 0}`,
        lastCheck: new Date().toISOString(),
      },
      ocr: {
        status: this.workerConfig.enableOCR ? 'ok' : 'degraded',
        message: this.workerConfig.enableOCR
          ? `Processed: ${this.processedByType['ocr'] || 0}`
          : 'OCR disabled',
        lastCheck: new Date().toISOString(),
      },
      embeddings: {
        status: this.workerConfig.enableEmbeddings ? 'ok' : 'degraded',
        message: this.workerConfig.enableEmbeddings
          ? `Processed: ${this.processedByType['embedding'] || 0}`
          : 'Embeddings disabled',
        lastCheck: new Date().toISOString(),
      },
      summary: {
        status: 'ok',
        message: `Total processed: ${totalProcessed}`,
        lastCheck: new Date().toISOString(),
      },
    };
  }

  // ============================================================================
  // Job Processors
  // ============================================================================

  private async processTextExtraction(
    job: Job<TextExtractionInput>
  ): Promise<TextExtractionResult> {
    const data = job.data;
    const fns = await getAgentStatusFns().catch(() => null);
    const statusCtx =
      data.tenantId && data.userId
        ? {
            tenantId: data.tenantId,
            userId: data.userId,
            agentType: 'indexer',
            taskDescription: `Text extraction for document ${data.documentId}`,
          }
        : null;

    if (fns && statusCtx) {
      await fns.markAgentActive(statusCtx);
    }
    const startMs = Date.now();

    try {
      const result = await this.textExtractionProcessor.process(job);
      this.processedByType['text-extraction']++;

      if (fns && statusCtx) {
        await reportTextExtractionStatus(fns, statusCtx, result, Date.now() - startMs);
      }

      return result;
    } catch (error) {
      if (fns && statusCtx) {
        await fns.markAgentError(
          statusCtx,
          error instanceof Error ? error.message : String(error),
          Date.now() - startMs
        );
      }
      throw error;
    }
  }

  private async processOCR(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    const startTime = Date.now();
    this.logger.info({ jobId: job.id }, 'Processing OCR job');
    this.processedByType['ocr']++;

    // Track as "ocr" agent on the Active Agents dashboard
    const input = job.data as TextExtractionInput;
    const fns = await getAgentStatusFns().catch(() => null);
    const statusCtx =
      input.tenantId && input.userId
        ? {
            tenantId: input.tenantId,
            userId: input.userId,
            agentType: 'ocr',
            taskDescription: `OCR extraction for document ${input.documentId}`,
          }
        : null;

    if (fns && statusCtx) {
      await fns.markAgentActive(statusCtx);
    }

    try {
      const { OCRWorker } = await import('@intelliflow/ai-worker');
      const ocrWorker = new OCRWorker();
      const input = job.data as TextExtractionInput;

      // Map ingestion format to OCR supported format (default to pdf for unrecognized types)
      const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'webp'] as const;
      type SupportedFormat = (typeof supportedFormats)[number];
      const ocrFormat: SupportedFormat = supportedFormats.includes(input.format as SupportedFormat)
        ? (input.format as SupportedFormat)
        : 'pdf';

      const ocrResult = await ocrWorker.processDocument({
        jobId: job.id ?? `ocr-${Date.now()}`,
        documentId: input.documentId,
        sourceUrl: input.sourceUrl,
        format: ocrFormat,
        language: input.language,
      });

      const normalizedText = ocrWorker.normalizeText(ocrResult.extractedText);
      const chunks = ocrWorker.createSearchableChunks(normalizedText);

      const durationMs = Date.now() - startTime;
      if (fns && statusCtx) {
        await reportOcrStatus(fns, statusCtx, ocrResult, normalizedText, durationMs);
      }

      return {
        documentId: input.documentId,
        text: ocrResult.extractedText,
        normalizedText,
        wordCount: normalizedText.split(/\s+/).filter((w: string) => w.length > 0).length,
        characterCount: normalizedText.length,
        processingTimeMs: durationMs,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      this.logger.error({ jobId: job.id, error: errorMessage }, 'OCR processing failed');

      if (fns && statusCtx) {
        await fns.markAgentError(statusCtx, errorMessage, durationMs);
      }

      return {
        documentId: job.data.documentId,
        text: '',
        normalizedText: '',
        wordCount: 0,
        characterCount: 0,
        processingTimeMs: durationMs,
        metadata: {
          format: 'image',
          language: 'en',
          extractedAt: new Date().toISOString(),
        },
        chunks: [],
        status: 'failed' as const,
        error: errorMessage,
      };
    }
  }

  private async processEmbedding(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    const startTime = Date.now();
    this.logger.info({ jobId: job.id }, 'Processing embedding job');
    this.processedByType['embedding']++;

    const input = job.data as TextExtractionInput;

    try {
      // Delegate to the AI worker's reindex queue via BullMQ so DocumentIndexer
      // (which owns the Prisma client and EmbeddingChain) handles the embedding.
      const { Queue } = await import('bullmq');
      const REINDEX_QUEUE_NAME = 'intelliflow-document-reindex';

      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisPassword = process.env.REDIS_PASSWORD;

      const reindexQueue = new Queue(REINDEX_QUEUE_NAME, {
        connection: { host: redisHost, port: redisPort, password: redisPassword },
      });

      await reindexQueue.add(
        'index-document',
        {
          documentIds: [input.documentId],
          indexType: 'documents',
          tenantId: undefined,
          reason: `ingestion-worker: embedding job ${job.id ?? ''}`,
        },
        { removeOnComplete: true, removeOnFail: 1000 }
      );

      await reindexQueue.close();

      const processingTimeMs = Date.now() - startTime;
      this.logger.info(
        { jobId: job.id, documentId: input.documentId, processingTimeMs },
        'Embedding job queued to reindex worker'
      );

      return {
        documentId: input.documentId,
        text: '',
        normalizedText: '',
        wordCount: 0,
        characterCount: 0,
        processingTimeMs,
        metadata: {
          format: 'embedding',
          language: input.language,
          extractedAt: new Date().toISOString(),
        },
        chunks: [],
        status: 'success',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { jobId: job.id, documentId: input.documentId, error: errorMessage },
        'Failed to queue embedding job'
      );

      return {
        documentId: input.documentId,
        text: '',
        normalizedText: '',
        wordCount: 0,
        characterCount: 0,
        processingTimeMs: Date.now() - startTime,
        metadata: {
          format: 'embedding',
          language: input.language,
          extractedAt: new Date().toISOString(),
        },
        chunks: [],
        status: 'failed' as const,
        error: `Failed to queue embedding: ${errorMessage}`,
      };
    }
  }
}

// ============================================================================
// Top-Level Execution
// ============================================================================

const worker = new IngestionWorker({
  enableTextExtraction: process.env.ENABLE_TEXT_EXTRACTION !== 'false',
  enableOCR: process.env.ENABLE_OCR === 'true',
  enableEmbeddings: process.env.ENABLE_EMBEDDINGS === 'true',
});

// Run if executed directly (CommonJS modules cannot use top-level await - TS error 1309)
if (require.main === module) {
  const logger = pino({ name: 'ingestion-worker-main' });

  worker
    .start()
    .then(() => {
      logger.info('Ingestion worker is running. Press Ctrl+C to stop.');
    })
    .catch((error: Error) => {
      logger.error({ error: error.message }, 'Failed to start ingestion worker');
      process.exit(1);
    });
}

// Exports - IngestionWorker is already exported at class declaration
export { TextExtractionProcessor } from './jobs/extractText.job';
export type { TextExtractionInput, TextExtractionResult } from './jobs/extractText.job';
// QUEUE_NAMES is already exported at const declaration
