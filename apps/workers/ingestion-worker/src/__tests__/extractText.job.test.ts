/**
 * TextExtractionProcessor Unit Tests
 *
 * @module @intelliflow/ingestion-worker/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Job } from 'bullmq';
import pino from 'pino';
import {
  TextExtractionProcessor,
  type TextExtractionInput,
  type TextExtractionResult,
  createTextExtractionJob,
} from '../jobs/extractText.job';

// Mock fetch for document fetching
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('TextExtractionProcessor', () => {
  let processor: TextExtractionProcessor;
  const mockLogger = pino({ level: 'silent' });

  beforeEach(() => {
    processor = new TextExtractionProcessor(mockLogger);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockJob = (data: TextExtractionInput): Job<TextExtractionInput> =>
    ({
      id: 'job-1',
      data,
      queueName: 'intelliflow-text-extraction',
      updateProgress: vi.fn(),
    }) as unknown as Job<TextExtractionInput>;

  const createValidInput = (overrides?: Partial<TextExtractionInput>): TextExtractionInput => ({
    documentId: '550e8400-e29b-41d4-a716-446655440000',
    sourceUrl: 'https://storage.example.com/doc.txt',
    format: 'txt',
    tenantId: 'tenant-123',
    language: 'en',
    ...overrides,
  });

  describe('constructor', () => {
    it('should create processor with default config', () => {
      const proc = new TextExtractionProcessor();
      expect(proc).toBeDefined();
    });

    it('should accept custom logger', () => {
      const customProcessor = new TextExtractionProcessor(mockLogger);
      expect(customProcessor).toBeDefined();
    });
  });

  describe('process()', () => {
    describe('plain text extraction', () => {
      it('should extract text from TXT files', async () => {
        const textContent = 'Hello, World! This is a test document.';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.status).toBe('success');
        expect(result.text).toBe(textContent);
        expect(result.wordCount).toBe(7);
      });

      it('should normalize text with extra whitespace', async () => {
        const textContent = '  Multiple   spaces   and\n\nnewlines  ';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.status).toBe('success');
        expect(result.normalizedText).not.toContain('  ');
        expect(result.normalizedText).toBe('Multiple spaces and newlines');
      });

      it('should include document metadata', async () => {
        const textContent = 'Test content';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt', language: 'en' }));
        const result = await processor.process(job);

        expect(result.metadata.format).toBe('txt');
        expect(result.metadata.language).toBe('en');
        expect(result.metadata.extractedAt).toBeDefined();
      });
    });

    describe('HTML extraction', () => {
      it('should extract text from HTML', async () => {
        const htmlContent = '<html><body><h1>Title</h1><p>Paragraph text.</p></body></html>';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(htmlContent)),
        });

        const job = createMockJob(createValidInput({ format: 'html' }));
        const result = await processor.process(job);

        expect(result.status).toBe('success');
        expect(result.text).toContain('Title');
        expect(result.text).toContain('Paragraph text');
        expect(result.text).not.toContain('<h1>');
      });

      it('should remove script tags', async () => {
        const htmlContent = '<html><body><p>Content</p><script>alert("xss")</script></body></html>';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(htmlContent)),
        });

        const job = createMockJob(createValidInput({ format: 'html' }));
        const result = await processor.process(job);

        expect(result.text).not.toContain('alert');
        expect(result.text).not.toContain('script');
      });

      it('should remove style tags', async () => {
        const htmlContent = '<html><body><style>.class{color:red}</style><p>Content</p></body></html>';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(htmlContent)),
        });

        const job = createMockJob(createValidInput({ format: 'html' }));
        const result = await processor.process(job);

        expect(result.text).not.toContain('color');
        expect(result.text).not.toContain('style');
      });
    });

    describe('chunking', () => {
      it('should create chunks for long text', async () => {
        const longText = 'Word '.repeat(500); // 500 words
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(longText)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.chunks.length).toBeGreaterThan(1);
      });

      it('should include all text in chunks', async () => {
        const textContent = 'Short text that fits in one chunk.';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0]).toContain('Short text');
      });
    });

    describe('metadata extraction', () => {
      it('should include format in metadata', async () => {
        const textContent = 'Test content';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.metadata.format).toBe('txt');
      });

      it('should include extraction timestamp', async () => {
        const textContent = 'Test content';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.metadata.extractedAt).toBeDefined();
        expect(new Date(result.metadata.extractedAt).getTime()).not.toBeNaN();
      });

      it('should record processing time', async () => {
        const textContent = 'Test content';
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from(textContent)),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('error handling', () => {
      it('should return failed status for fetch errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('Failed to fetch document');
      });

      it('should handle empty content', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('')),
        });

        const job = createMockJob(createValidInput({ format: 'txt' }));
        const result = await processor.process(job);

        expect(result.status).toBe('success');
        expect(result.text).toBe('');
        expect(result.wordCount).toBe(0);
      });
    });
  });
});

describe('createTextExtractionJob', () => {
  it('should create a job processor function', () => {
    const mockLogger = pino({ level: 'silent' });
    const jobFn = createTextExtractionJob(mockLogger);

    expect(typeof jobFn).toBe('function');
  });

  it('should process job when called', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from('Test content')),
    });

    const mockLogger = pino({ level: 'silent' });
    const jobFn = createTextExtractionJob(mockLogger);

    const mockJob = {
      id: 'job-1',
      data: {
        documentId: '550e8400-e29b-41d4-a716-446655440000',
        sourceUrl: 'https://storage.example.com/doc.txt',
        format: 'txt',
        tenantId: 'tenant-123',
        language: 'en',
      },
      queueName: 'intelliflow-text-extraction',
      updateProgress: vi.fn(),
    } as unknown as Job<TextExtractionInput>;

    const result = await jobFn(mockJob);
    expect(result.status).toBe('success');
  });
});
