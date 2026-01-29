/**
 * Extracted Text Schema Definition
 *
 * This is the SINGLE SOURCE OF TRUTH for the OCR-extracted text artifact structure.
 * The JSON schema is auto-generated from this Zod definition.
 *
 * To regenerate JSON schema: pnpm run generate:schemas
 */

import { z } from 'zod';

// Document format
export const documentFormatSchema = z.enum(['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'webp']);

// OCR engine
export const ocrEngineSchema = z.enum(['tesseract', 'google-vision', 'aws-textract', 'azure-vision']);

// Language code pattern (ISO 639-1)
const languagePattern = /^[a-z]{2}(-[A-Z]{2})?$/;

// Metadata
export const extractedTextMetadataSchema = z.object({
  sourceUrl: z.string().url().describe('Original document URL'),
  format: documentFormatSchema.describe('Source document format'),
  language: z.string().regex(languagePattern).describe('ISO 639-1 language code'),
  pageCount: z.number().int().min(1).describe('Number of pages processed'),
  wordCount: z.number().int().min(0).describe('Total word count in extracted text'),
  extractedAt: z.string().datetime().describe('ISO 8601 timestamp of extraction'),
  engine: ocrEngineSchema.describe('OCR engine used for extraction'),
  confidence: z.number().min(0).max(1).describe('Overall OCR confidence score (0-1)'),
});

// Provenance
export const provenanceSchema = z.object({
  jobId: z.string().optional().describe('OCR job identifier'),
  processingTimeMs: z.number().int().min(0).optional().describe('Processing time in milliseconds'),
  engineVersion: z.string().optional().describe('OCR engine version used'),
  retryCount: z.number().int().min(0).optional().describe('Number of retries before success'),
});

// Low confidence region
export const lowConfidenceRegionSchema = z.object({
  page: z.number().int().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  confidence: z.number().optional(),
  text: z.string().optional(),
});

// Quality metrics
export const qualityMetricsSchema = z.object({
  overallConfidence: z.number().min(0).max(1).optional(),
  characterAccuracy: z.number().min(0).max(1).optional(),
  pageConfidences: z.array(z.number().min(0).max(1)).optional(),
  lowConfidenceRegions: z.array(lowConfidenceRegionSchema).optional(),
});

// Main extracted text schema
export const extractedTextSchema = z.object({
  documentId: z.string().uuid().describe('Unique identifier of the source document'),
  text: z.string().describe('Raw extracted text from OCR'),
  normalizedText: z.string().describe('Normalized text with cleaned whitespace and characters'),
  metadata: extractedTextMetadataSchema,
  searchableContent: z.array(z.string().min(1)).describe('Text chunks optimized for search and RAG'),
  embeddings: z.array(z.array(z.number())).optional().describe('Vector embeddings for each searchable chunk'),
  provenance: provenanceSchema.optional(),
  quality: qualityMetricsSchema.optional(),
});

// Export TypeScript types inferred from Zod schema
export type ExtractedText = z.infer<typeof extractedTextSchema>;
export type DocumentFormat = z.infer<typeof documentFormatSchema>;
export type OcrEngine = z.infer<typeof ocrEngineSchema>;
export type ExtractedTextMetadata = z.infer<typeof extractedTextMetadataSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type QualityMetrics = z.infer<typeof qualityMetricsSchema>;
