/**
 * OCR Worker
 *
 * Processes scanned PDFs and images to extract text for search and RAG.
 * Supports multiple OCR engines with quality metrics tracking.
 *
 * @module workers/ocr-worker
 * @task IFC-154
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type SupportedFormat = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'tiff' | 'webp';

export type OCREngine = 'tesseract' | 'google-vision' | 'aws-textract' | 'azure-vision';

export interface OCRJobInput {
  jobId: string;
  documentId: string;
  sourceUrl: string;
  format: SupportedFormat;
  language?: string;
  engine?: OCREngine;
  priority?: 'low' | 'normal' | 'high';
}

export interface OCRJobResult {
  jobId: string;
  documentId: string;
  status: 'completed' | 'failed' | 'partial';
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingTimeMs: number;
  engine: OCREngine;
  provenance: OCRProvenance;
  quality: OCRQualityMetrics;
  error?: string;
}

export interface OCRProvenance {
  sourceUrl: string;
  format: SupportedFormat;
  extractedAt: Date;
  engineVersion: string;
  modelVersion?: string;
}

export interface OCRQualityMetrics {
  overallConfidence: number;
  characterAccuracy?: number;
  wordCount: number;
  pageConfidences: number[];
  lowConfidenceRegions: LowConfidenceRegion[];
}

export interface LowConfidenceRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  text: string;
}

export interface ExtractedTextArtifact {
  documentId: string;
  text: string;
  normalizedText: string;
  metadata: {
    sourceUrl: string;
    format: SupportedFormat;
    language: string;
    pageCount: number;
    wordCount: number;
    extractedAt: Date;
    engine: OCREngine;
    confidence: number;
  };
  searchableContent: string[];
  embeddings?: number[][];
}

// ============================================================================
// OCR Worker Class
// ============================================================================

export class OCRWorker extends EventEmitter {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly defaultEngine: OCREngine;

  constructor(options?: {
    maxRetries?: number;
    retryDelayMs?: number;
    defaultEngine?: OCREngine;
  }) {
    super();
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 1000;
    this.defaultEngine = options?.defaultEngine ?? 'tesseract';
  }

  /**
   * Process a document for OCR extraction
   */
  async processDocument(input: OCRJobInput): Promise<OCRJobResult> {
    const startTime = Date.now();
    const engine = input.engine ?? this.defaultEngine;

    this.emit('job:started', { jobId: input.jobId, documentId: input.documentId });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Fetch document
        const documentBuffer = await this.fetchDocument(input.sourceUrl);

        // Validate format
        this.validateFormat(input.format, documentBuffer);

        // Perform OCR based on engine
        const ocrResult = await this.performOCR(documentBuffer, input.format, engine, input.language);

        // Calculate quality metrics
        const quality = this.calculateQualityMetrics(ocrResult);

        // Build result
        const result: OCRJobResult = {
          jobId: input.jobId,
          documentId: input.documentId,
          status: quality.overallConfidence >= 0.7 ? 'completed' : 'partial',
          extractedText: ocrResult.text,
          confidence: quality.overallConfidence,
          pageCount: ocrResult.pageCount,
          processingTimeMs: Date.now() - startTime,
          engine,
          provenance: {
            sourceUrl: input.sourceUrl,
            format: input.format,
            extractedAt: new Date(),
            engineVersion: this.getEngineVersion(engine),
          },
          quality,
        };

        this.emit('job:completed', result);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.emit('job:retry', {
          jobId: input.jobId,
          attempt: attempt + 1,
          error: lastError.message,
        });

        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    // All retries failed
    const failedResult: OCRJobResult = {
      jobId: input.jobId,
      documentId: input.documentId,
      status: 'failed',
      extractedText: '',
      confidence: 0,
      pageCount: 0,
      processingTimeMs: Date.now() - startTime,
      engine,
      provenance: {
        sourceUrl: input.sourceUrl,
        format: input.format,
        extractedAt: new Date(),
        engineVersion: this.getEngineVersion(engine),
      },
      quality: {
        overallConfidence: 0,
        wordCount: 0,
        pageConfidences: [],
        lowConfidenceRegions: [],
      },
      error: lastError?.message ?? 'Unknown error',
    };

    this.emit('job:failed', failedResult);
    return failedResult;
  }

  /**
   * Normalize extracted text for search and RAG
   */
  normalizeText(text: string): string {
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
   * Create searchable content chunks for RAG
   */
  createSearchableChunks(text: string, chunkSize = 512, overlap = 64): string[] {
    const normalized = this.normalizeText(text);
    const words = normalized.split(' ');
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

  /**
   * Build artifact for storage
   */
  buildTextArtifact(
    documentId: string,
    result: OCRJobResult,
    language = 'en'
  ): ExtractedTextArtifact {
    const normalizedText = this.normalizeText(result.extractedText);
    const chunks = this.createSearchableChunks(normalizedText);

    return {
      documentId,
      text: result.extractedText,
      normalizedText,
      metadata: {
        sourceUrl: result.provenance.sourceUrl,
        format: result.provenance.format,
        language,
        pageCount: result.pageCount,
        wordCount: result.quality.wordCount,
        extractedAt: result.provenance.extractedAt,
        engine: result.engine,
        confidence: result.confidence,
      },
      searchableContent: chunks,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchDocument(url: string): Promise<Buffer> {
    // In production, this would fetch from storage (S3, Supabase Storage, etc.)
    // For now, simulate with a placeholder
    this.emit('document:fetching', { url });

    // Simulated fetch - in production use actual HTTP client
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private validateFormat(format: SupportedFormat, buffer: Buffer): void {
    // Validate magic bytes for each format
    const magicBytes: Record<SupportedFormat, number[][]> = {
      pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
      png: [[0x89, 0x50, 0x4e, 0x47]], // PNG signature
      jpg: [[0xff, 0xd8, 0xff]],
      jpeg: [[0xff, 0xd8, 0xff]],
      tiff: [
        [0x49, 0x49, 0x2a, 0x00], // Little endian
        [0x4d, 0x4d, 0x00, 0x2a], // Big endian
      ],
      webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF
    };

    const expectedMagic = magicBytes[format];
    const bufferStart = Array.from(buffer.slice(0, 8));

    const isValid = expectedMagic.some((magic) =>
      magic.every((byte, idx) => bufferStart[idx] === byte)
    );

    if (!isValid) {
      throw new Error(`Invalid file format: expected ${format}`);
    }
  }

  private async performOCR(
    buffer: Buffer,
    format: SupportedFormat,
    engine: OCREngine,
    language?: string
  ): Promise<{ text: string; pageCount: number; pageConfidences: number[] }> {
    // Engine-specific OCR implementation
    // In production, this would integrate with actual OCR services

    switch (engine) {
      case 'tesseract':
        return this.performTesseractOCR(buffer, format, language);
      case 'google-vision':
        return this.performGoogleVisionOCR(buffer, format, language);
      case 'aws-textract':
        return this.performTextractOCR(buffer, format, language);
      case 'azure-vision':
        return this.performAzureVisionOCR(buffer, format, language);
      default:
        throw new Error(`Unsupported OCR engine: ${engine}`);
    }
  }

  private async performTesseractOCR(
    _buffer: Buffer,
    _format: SupportedFormat,
    _language?: string
  ): Promise<{ text: string; pageCount: number; pageConfidences: number[] }> {
    // Placeholder - in production, integrate with tesseract.js or native tesseract
    // Example with tesseract.js:
    // const { createWorker } = require('tesseract.js');
    // const worker = await createWorker(language ?? 'eng');
    // const result = await worker.recognize(buffer);
    // await worker.terminate();

    return {
      text: '[OCR placeholder - integrate tesseract.js for production]',
      pageCount: 1,
      pageConfidences: [0.95],
    };
  }

  private async performGoogleVisionOCR(
    _buffer: Buffer,
    _format: SupportedFormat,
    _language?: string
  ): Promise<{ text: string; pageCount: number; pageConfidences: number[] }> {
    // Placeholder - in production, integrate with @google-cloud/vision
    return {
      text: '[OCR placeholder - integrate Google Vision API for production]',
      pageCount: 1,
      pageConfidences: [0.98],
    };
  }

  private async performTextractOCR(
    _buffer: Buffer,
    _format: SupportedFormat,
    _language?: string
  ): Promise<{ text: string; pageCount: number; pageConfidences: number[] }> {
    // Placeholder - in production, integrate with @aws-sdk/client-textract
    return {
      text: '[OCR placeholder - integrate AWS Textract for production]',
      pageCount: 1,
      pageConfidences: [0.97],
    };
  }

  private async performAzureVisionOCR(
    _buffer: Buffer,
    _format: SupportedFormat,
    _language?: string
  ): Promise<{ text: string; pageCount: number; pageConfidences: number[] }> {
    // Placeholder - in production, integrate with @azure/ai-form-recognizer
    return {
      text: '[OCR placeholder - integrate Azure Vision for production]',
      pageCount: 1,
      pageConfidences: [0.96],
    };
  }

  private calculateQualityMetrics(ocrResult: {
    text: string;
    pageCount: number;
    pageConfidences: number[];
  }): OCRQualityMetrics {
    const words = ocrResult.text.split(/\s+/).filter((w) => w.length > 0);
    const overallConfidence =
      ocrResult.pageConfidences.reduce((a, b) => a + b, 0) /
      ocrResult.pageConfidences.length;

    return {
      overallConfidence,
      wordCount: words.length,
      pageConfidences: ocrResult.pageConfidences,
      lowConfidenceRegions: [], // Would be populated by actual OCR engine
    };
  }

  private getEngineVersion(engine: OCREngine): string {
    const versions: Record<OCREngine, string> = {
      tesseract: '5.3.0',
      'google-vision': 'v1',
      'aws-textract': '2022-08-01',
      'azure-vision': '3.2',
    };
    return versions[engine];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory and Exports
// ============================================================================

export function createOCRWorker(options?: {
  maxRetries?: number;
  retryDelayMs?: number;
  defaultEngine?: OCREngine;
}): OCRWorker {
  return new OCRWorker(options);
}

export default OCRWorker;
