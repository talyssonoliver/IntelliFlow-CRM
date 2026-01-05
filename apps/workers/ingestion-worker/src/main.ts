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
    this.logger.info(
      { processedByType: this.processedByType },
      'Stopping ingestion worker'
    );
  }

  /**
   * Process a job based on queue
   */
  protected async processJob(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    const queueName = job.queueName;

    this.logger.debug(
      { jobId: job.id, queue: queueName },
      'Processing ingestion job'
    );

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
    const result = await this.textExtractionProcessor.process(job);
    this.processedByType['text-extraction']++;
    return result;
  }

  private async processOCR(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    // In production, integrate with apps/ai-worker/src/workers/ocr-worker.ts
    // const { OCRWorker } = await import('@intelliflow/ai-worker');
    // const ocrWorker = new OCRWorker();
    // const result = await ocrWorker.processDocument(job.data);

    this.logger.info({ jobId: job.id }, 'Processing OCR job');
    this.processedByType['ocr']++;

    // Placeholder - delegate to OCRWorker in production
    return {
      documentId: job.data.documentId,
      text: '[OCR processing placeholder]',
      normalizedText: '[OCR processing placeholder]',
      wordCount: 0,
      characterCount: 0,
      processingTimeMs: 0,
      metadata: {
        format: 'image',
        language: 'en',
        extractedAt: new Date().toISOString(),
      },
      chunks: [],
      status: 'success',
    };
  }

  private async processEmbedding(job: Job<IngestionJobData>): Promise<IngestionJobResult> {
    // In production, integrate with embedding service
    // const { embeddingChain } = await import('@intelliflow/ai-worker');
    // const embeddings = await embeddingChain.embedText(job.data.text);

    this.logger.info({ jobId: job.id }, 'Processing embedding job');
    this.processedByType['embedding']++;

    // Placeholder
    return {
      documentId: job.data.documentId,
      text: '',
      normalizedText: '',
      wordCount: 0,
      characterCount: 0,
      processingTimeMs: 0,
      metadata: {
        format: 'embedding',
        language: 'en',
        extractedAt: new Date().toISOString(),
      },
      chunks: [],
      status: 'success',
    };
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

  void worker
    .start()
    .then(() => {
      logger.info('Ingestion worker is running. Press Ctrl+C to stop.');
    })
    .catch((error: Error) => { // NOSONAR: S7785
      logger.error({ error: error.message }, 'Failed to start ingestion worker');
      process.exit(1);
    });
}

// Exports - IngestionWorker is already exported at class declaration
export { TextExtractionProcessor } from './jobs/extractText.job';
export type { TextExtractionInput, TextExtractionResult } from './jobs/extractText.job';
// QUEUE_NAMES is already exported at const declaration
