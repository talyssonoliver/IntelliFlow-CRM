/**
 * Unit tests for ingestion-workers.ts (D5 / issue #259)
 *
 * Verifies that bootIngestionWorkers registers BullMQ Worker instances for
 * intelliflow-text-extraction and intelliflow-ocr-processing without requiring
 * a live Redis connection.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// BullMQ mock — tracks constructor calls and close() invocations
// ---------------------------------------------------------------------------

const bullmqCalls: {
  Queue: unknown[][];
  Worker: unknown[][];
  workerOn: Array<[string, unknown]>;
  closed: { worker: number; queue: number };
} = {
  Queue: [],
  Worker: [],
  workerOn: [],
  closed: { worker: 0, queue: 0 },
};

vi.mock('bullmq', () => {
  class MockQueue {
    constructor(...args: unknown[]) {
      bullmqCalls.Queue.push(args);
    }
    async close() {
      bullmqCalls.closed.queue++;
    }
    async add() {
      return { id: 'job-1' };
    }
  }
  class MockWorker {
    constructor(...args: unknown[]) {
      bullmqCalls.Worker.push(args);
    }
    on(event: string, handler: unknown) {
      bullmqCalls.workerOn.push([event, handler]);
    }
    async close() {
      bullmqCalls.closed.worker++;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

// ---------------------------------------------------------------------------
// OCRWorker mock (lives in same package, avoid network calls)
// ---------------------------------------------------------------------------

// Captures the format last requested of the OCRWorker mock so tests can assert
// the unsupported-format → pdf fallback in processOCRJob.
const ocrCalls: { lastFormat?: string; shouldThrow: boolean } = { shouldThrow: false };

vi.mock('../ocr-worker.js', () => {
  class MockOCRWorker {
    async processDocument(req: { format: string }) {
      ocrCalls.lastFormat = req.format;
      if (ocrCalls.shouldThrow) {
        throw new Error('ocr engine unavailable');
      }
      return {
        jobId: 'j1',
        documentId: 'doc-1',
        status: 'completed' as const,
        extractedText: 'hello world',
        confidence: 0.95,
        pageCount: 1,
        processingTimeMs: 10,
        engine: 'tesseract' as const,
        provenance: {
          sourceUrl: 'https://example.com/img.png',
          format: 'png' as const,
          extractedAt: new Date(),
          engineVersion: '5.3.0',
        },
        quality: {
          overallConfidence: 0.95,
          wordCount: 2,
          pageConfidences: [0.95],
          lowConfidenceRegions: [],
        },
      };
    }
    normalizeText(t: string) {
      return t.trim();
    }
    createSearchableChunks(t: string) {
      return [t];
    }
  }
  return { OCRWorker: MockOCRWorker };
});

// Dynamic imports inside extractTextFromBuffer — mocked so the pdf/docx
// branches run without the real native parsers.
vi.mock('pdf-parse', () => {
  class PDFParse {
    async getText() {
      return { text: 'pdf extracted text' };
    }
    async getInfo() {
      return { total: 3 };
    }
  }
  return { PDFParse };
});

vi.mock('mammoth', () => ({
  extractRawText: async () => ({ value: 'docx extracted text' }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  bootIngestionWorkers,
  TEXT_EXTRACTION_QUEUE,
  OCR_PROCESSING_QUEUE,
} from '../ingestion-workers.js';
import pino from 'pino';

describe('bootIngestionWorkers', () => {
  const redisConn = { host: 'localhost', port: 6379 };
  const generateEmbedding = vi.fn().mockResolvedValue(null);
  const logger = pino({ level: 'silent' });

  beforeEach(() => {
    bullmqCalls.Queue.length = 0;
    bullmqCalls.Worker.length = 0;
    bullmqCalls.workerOn.length = 0;
    bullmqCalls.closed.worker = 0;
    bullmqCalls.closed.queue = 0;
  });

  it('registers a Worker for intelliflow-text-extraction', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const textWorker = bullmqCalls.Worker.find((args) => args[0] === TEXT_EXTRACTION_QUEUE);
    expect(textWorker, `expected Worker for ${TEXT_EXTRACTION_QUEUE}`).toBeDefined();
  });

  it('registers a Worker for intelliflow-ocr-processing', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const ocrWorker = bullmqCalls.Worker.find((args) => args[0] === OCR_PROCESSING_QUEUE);
    expect(ocrWorker, `expected Worker for ${OCR_PROCESSING_QUEUE}`).toBeDefined();
  });

  it('returns a handle whose stop() closes all workers and queues', async () => {
    const handle = await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    await handle.stop();

    expect(bullmqCalls.closed.worker).toBe(2); // text + ocr workers
    expect(bullmqCalls.closed.queue).toBe(2); // text + ocr queues
  });

  it('registers "failed" event listeners on both workers', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const failedHandlers = bullmqCalls.workerOn.filter(([ev]) => ev === 'failed');
    expect(failedHandlers.length).toBeGreaterThanOrEqual(2);
  });

  it('passes the redis connection to both Worker constructors', async () => {
    const conn = { host: '10.0.0.1', port: 6380, password: 'secret' };
    await bootIngestionWorkers(conn, generateEmbedding, logger);

    for (const workerArgs of bullmqCalls.Worker) {
      const opts = workerArgs[2] as { connection: typeof conn };
      expect(opts?.connection).toMatchObject(conn);
    }
  });
});

// ---------------------------------------------------------------------------
// Queue-name constant sanity checks
// ---------------------------------------------------------------------------

describe('queue name constants', () => {
  it('TEXT_EXTRACTION_QUEUE matches producer value in upload.router.ts', () => {
    expect(TEXT_EXTRACTION_QUEUE).toBe('intelliflow-text-extraction');
  });

  it('OCR_PROCESSING_QUEUE matches producer value in upload.router.ts', () => {
    expect(OCR_PROCESSING_QUEUE).toBe('intelliflow-ocr-processing');
  });
});

// ---------------------------------------------------------------------------
// Processor execution — drives the real extraction pipeline via the worker
// callback captured by the BullMQ mock (args[1] of the Worker constructor).
// Exercises fetchDocument, extractTextFromBuffer (every branch), normalizeText,
// createChunks, the embeddings path, and both success/failure outcomes.
// ---------------------------------------------------------------------------

type ProcessorFn = (job: { id: string; data: Record<string, unknown> }) => Promise<{
  status: string;
  text: string;
  normalizedText: string;
  chunks: string[];
  wordCount: number;
  error?: string;
  metadata: Record<string, unknown>;
}>;

function mockFetch(body: string, ok = true): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
  })) as unknown as typeof fetch;
}

const DOC_ID = '11111111-1111-4111-8111-111111111111';

function jobData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentId: DOC_ID,
    sourceUrl: 'https://example.com/doc',
    format: 'txt',
    tenantId: 'tenant-1',
    language: 'en',
    ...overrides,
  };
}

describe('text-extraction processor', () => {
  const logger = pino({ level: 'silent' });
  let textProcessor: ProcessorFn;
  let ocrProcessor: ProcessorFn;
  let generateEmbedding: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bullmqCalls.Worker.length = 0;
    ocrCalls.shouldThrow = false;
    ocrCalls.lastFormat = undefined;
    generateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2]);
    await bootIngestionWorkers(
      { host: 'localhost', port: 6379 },
      generateEmbedding as unknown as (text: string) => Promise<number[] | null>,
      logger
    );
    textProcessor = bullmqCalls.Worker.find(
      (a) => a[0] === TEXT_EXTRACTION_QUEUE
    )![1] as ProcessorFn;
    ocrProcessor = bullmqCalls.Worker.find((a) => a[0] === OCR_PROCESSING_QUEUE)![1] as ProcessorFn;
  });

  it('extracts plain-text (txt) documents', async () => {
    mockFetch('hello plain text');
    const result = await textProcessor({ id: 'j1', data: jobData({ format: 'txt' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('hello plain text');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('strips <script> and <style> content from HTML, including unclosed tags', async () => {
    mockFetch(
      '<html><head><style>.x{color:red}</style></head>' +
        '<body><script>alert(1)</script>Visible Text<script>leakedUnclosed'
    );
    const result = await textProcessor({ id: 'j2', data: jobData({ format: 'html' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('Visible Text');
    // Security assertion: neither the closed nor the UNCLOSED script body leaks.
    expect(result.text).not.toContain('alert');
    expect(result.text).not.toContain('leakedUnclosed');
    expect(result.text).not.toContain('color:red');
  });

  it('neutralises attribute-injection evasion (fake </script> inside an attribute)', async () => {
    // The closing-tag alternation must skip the decoy </script> embedded in the
    // attribute and match the real one, so alert(1) never leaks.
    mockFetch('<script foo="</script>">alert(1)</script>Clean');
    const result = await textProcessor({ id: 'j2b', data: jobData({ format: 'html' }) });
    expect(result.text).not.toContain('alert');
    expect(result.text).toContain('Clean');
  });

  it('extracts PDF documents and reports page count', async () => {
    mockFetch('ignored-binary');
    const result = await textProcessor({ id: 'j3', data: jobData({ format: 'pdf' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('pdf extracted text');
    expect(result.metadata.pages).toBe(3);
  });

  it('extracts DOCX documents', async () => {
    mockFetch('ignored-binary');
    const result = await textProcessor({ id: 'j4', data: jobData({ format: 'docx' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('docx extracted text');
  });

  it('falls back to plain-text read for unknown formats', async () => {
    mockFetch('raw fallback body');
    const result = await textProcessor({ id: 'j5', data: jobData({ format: 'xyz' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('raw fallback body');
  });

  it('chunks long normalized text into multiple chunks', async () => {
    const longText = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    mockFetch(longText);
    const result = await textProcessor({ id: 'j6', data: jobData({ format: 'txt' }) });
    expect(result.chunks.length).toBeGreaterThan(1);
  });

  it('invokes the embedding fn when generateEmbeddings is requested', async () => {
    mockFetch('embed me');
    await textProcessor({
      id: 'j7',
      data: jobData({ format: 'txt', options: { generateEmbeddings: true } }),
    });
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('treats embedding failure as non-fatal (status stays success)', async () => {
    generateEmbedding.mockRejectedValueOnce(new Error('embed boom'));
    mockFetch('embed me too');
    const result = await textProcessor({
      id: 'j8',
      data: jobData({ format: 'txt', options: { generateEmbeddings: true } }),
    });
    expect(result.status).toBe('success');
  });

  it('returns status=failed when the document fetch fails', async () => {
    mockFetch('', false);
    const result = await textProcessor({ id: 'j9', data: jobData({ format: 'txt' }) });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Failed to fetch document/);
    expect(result.chunks).toEqual([]);
  });
});

describe('ocr processor', () => {
  const logger = pino({ level: 'silent' });
  let ocrProcessor: ProcessorFn;
  let generateEmbedding: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bullmqCalls.Worker.length = 0;
    ocrCalls.shouldThrow = false;
    ocrCalls.lastFormat = undefined;
    generateEmbedding = vi.fn().mockResolvedValue([0.1]);
    await bootIngestionWorkers(
      { host: 'localhost', port: 6379 },
      generateEmbedding as unknown as (text: string) => Promise<number[] | null>,
      logger
    );
    ocrProcessor = bullmqCalls.Worker.find((a) => a[0] === OCR_PROCESSING_QUEUE)![1] as ProcessorFn;
  });

  it('processes a supported image format (png) successfully', async () => {
    const result = await ocrProcessor({ id: 'o1', data: jobData({ format: 'png' }) });
    expect(result.status).toBe('success');
    expect(result.text).toContain('hello world');
    expect(ocrCalls.lastFormat).toBe('png');
  });

  it('falls back to pdf format for unsupported OCR formats', async () => {
    await ocrProcessor({ id: 'o2', data: jobData({ format: 'gif' }) });
    expect(ocrCalls.lastFormat).toBe('pdf');
  });

  it('runs the embedding path when requested', async () => {
    await ocrProcessor({
      id: 'o3',
      data: jobData({ format: 'png', options: { generateEmbeddings: true } }),
    });
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('returns status=failed when the OCR engine throws', async () => {
    ocrCalls.shouldThrow = true;
    const result = await ocrProcessor({ id: 'o4', data: jobData({ format: 'png' }) });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/ocr engine unavailable/);
  });
});
