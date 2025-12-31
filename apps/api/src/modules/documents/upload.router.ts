import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc';
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

/**
 * Document Upload Router
 *
 * Handles file uploads through the ingestion pipeline:
 * - Validates user authentication and authorization
 * - Decodes base64 content
 * - Orchestrates ingestion (AV scan, metadata extraction, storage)
 * - Returns document ID or error
 */
export const uploadRouter = router({
  /**
   * Upload a document
   */
  upload: protectedProcedure.input(uploadInputSchema).mutation(async ({ input, ctx }) => {
    const { filename, mimeType, content, relatedCaseId, relatedContactId } = input;

    // Decode base64 content
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, 'base64');
    } catch (error) {
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
