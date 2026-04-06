import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { TRPCError } from '@trpc/server';
import { IngestionOrchestrator } from '@intelliflow/application';

/**
 * File Upload Input Schema
 */
const uploadInputSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  content: z.string(), // Base64 encoded file content
  relatedCaseId: z.string().optional(),
  relatedContactId: z.string().optional(),
});

/** MIME types that should go through OCR instead of text extraction */
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/webp'];

/** Map MIME type to the format string expected by the ingestion worker */
function mimeToFormat(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'docx',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/markdown': 'md',
    'application/rtf': 'rtf',
  };
  return map[mimeType] || 'txt';
}

/**
 * Enqueue document for async text extraction, OCR, or embedding generation.
 * Routes to the correct queue based on MIME type:
 * - Image files → intelliflow-ocr-processing
 * - Text/PDF/DOCX → intelliflow-text-extraction
 */
async function enqueueDocumentProcessing(params: {
  documentId: string;
  mimeType: string;
  tenantId: string;
  userId: string;
  filename: string;
}) {
  const { Queue } = await import('bullmq');
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  };

  const isImage = IMAGE_MIME_TYPES.includes(params.mimeType);
  const queueName = isImage ? 'intelliflow-ocr-processing' : 'intelliflow-text-extraction';

  const jobData = {
    documentId: params.documentId,
    sourceUrl: `storage://${params.tenantId}/${params.documentId}`,
    format: isImage ? params.mimeType.split('/')[1] : mimeToFormat(params.mimeType),
    tenantId: params.tenantId,
    userId: params.userId,
    language: 'en',
    options: {
      extractMetadata: true,
      generateEmbeddings: true,
    },
  };

  const queue = new Queue(queueName, { connection });
  await queue.add(isImage ? 'ocr-process' : 'extract-text', jobData);
  await queue.close();
}

/**
 * Document Upload Router
 *
 * Handles file uploads through the ingestion pipeline:
 * - Validates user authentication and authorization
 * - Decodes base64 content
 * - Orchestrates ingestion (AV scan, metadata extraction, storage)
 * - Returns document ID or error
 */
export const uploadRouter = createTRPCRouter({
  /**
   * Upload a document
   */
  upload: protectedProcedure.input(uploadInputSchema).mutation(async ({ input, ctx }) => {
    const { filename, mimeType, content, relatedCaseId, relatedContactId } = input;

    // Decode base64 content
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, 'base64');
    } catch {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid base64 content',
      });
    }

    // Get ingestion orchestrator from container
    const orchestrator = ctx.container!.get<IngestionOrchestrator>('IngestionOrchestrator');

    // Ingest file
    const result = await orchestrator.ingestFile(fileBuffer, {
      tenantId: ctx.user.tenantId,
      filename,
      mimeType,
      uploadedBy: ctx.user.userId,
      relatedCaseId,
      relatedContactId,
    });

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error || 'Upload failed',
      });
    }

    // Fire-and-forget: enqueue document processing (best-effort)
    if (!result.duplicate) {
      enqueueDocumentProcessing({
        documentId: result.documentId!,
        mimeType,
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        filename,
      }).catch(() => {});
    }

    return {
      documentId: result.documentId!,
      duplicate: result.duplicate || false,
    };
  }),

  /**
   * Get upload status (for async processing)
   */
  getUploadStatus: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const repository = ctx.container!.get('CaseDocumentRepository');
      const document = await repository.findById(input.documentId);

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Check if user has access
      if (document.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied',
        });
      }

      return {
        id: document.id,
        filename: document.metadata.title,
        status: document.status,
        createdAt: document.createdAt,
      };
    }),
});
