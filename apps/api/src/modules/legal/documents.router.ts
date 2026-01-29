/**
 * Case Documents tRPC Router - IFC-152
 *
 * API endpoints for document management with versioning, ACL, and e-signature support.
 * Refactored to use domain model and repository pattern following hexagonal architecture.
 */

import {
  CaseDocument,
  AccessLevel,
  DocumentClassification,
} from '@intelliflow/domain';
import {
  bulkDownloadDocumentsSchema,
  bulkArchiveDocumentsSchema,
  bulkDeleteDocumentsSchema,
} from '@intelliflow/validators';
import { PrismaCaseDocumentRepository } from '@intelliflow/adapters';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

// ============================================================================
// Input Schemas
// ============================================================================

const createDocumentInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  documentType: z.enum([
    'CONTRACT',
    'AGREEMENT',
    'EVIDENCE',
    'CORRESPONDENCE',
    'COURT_FILING',
    'MEMO',
    'REPORT',
    'OTHER',
  ]),
  classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED']),
  tags: z.array(z.string().max(50)).max(20).default([]),
  relatedCaseId: z.string().uuid().optional(),
  relatedContactId: z.string().uuid().optional(),
  storageKey: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const grantAccessInputSchema = z.object({
  documentId: z.string().uuid(),
  principalId: z.string().uuid(),
  principalType: z.enum(['USER', 'ROLE', 'TENANT']),
  accessLevel: z.enum(['NONE', 'VIEW', 'COMMENT', 'EDIT', 'ADMIN']),
  expiresAt: z.coerce.date().optional(),
});

const createVersionInputSchema = z.object({
  documentId: z.string().uuid(),
  versionType: z.enum(['major', 'minor', 'patch']),
  storageKey: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const signDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
  ipAddress: z.string().min(1),
  userAgent: z.string().min(1),
});

const placeLegalHoldInputSchema = z.object({
  documentId: z.string().uuid(),
  retentionUntil: z.coerce.date(),
});

// ============================================================================
// tRPC Router
// ============================================================================

export const documentsRouter = createTRPCRouter({
  /**
   * Create a new document
   */
  create: protectedProcedure.input(createDocumentInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    // Create document using domain model
    const document = CaseDocument.create({
      tenantId: userId, // Using userId as tenantId for now
      metadata: {
        title: input.title,
        description: input.description,
        documentType: input.documentType as any,
        classification: input.classification as DocumentClassification,
        tags: input.tags,
        relatedCaseId: input.relatedCaseId,
        relatedContactId: input.relatedContactId,
      },
      storageKey: input.storageKey,
      contentHash: input.contentHash,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdBy: userId,
    });

    // Grant creator admin access
    document.grantAccess(userId, 'USER', AccessLevel.ADMIN, userId);

    // Persist to database
    await documentRepo.save(document);

    return document.toJSON();
  }),

  /**
   * Create a new version of the document
   */
  createVersion: protectedProcedure.input(createVersionInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    // Find document
    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check access (user must have EDIT or ADMIN)
    if (!document.hasAccess(userId, AccessLevel.EDIT)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Create new version using domain method
    let newVersion: CaseDocument;
    switch (input.versionType) {
      case 'major':
        newVersion = document.createMajorVersion(userId, input.storageKey, input.contentHash);
        break;
      case 'minor':
        newVersion = document.createMinorVersion(userId, input.storageKey, input.contentHash);
        break;
      case 'patch':
        newVersion = document.createPatchVersion(userId, input.storageKey, input.contentHash);
        break;
      default:
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid version type' });
    }

    // Save both old (now superseded) and new version
    await documentRepo.save(document);
    await documentRepo.save(newVersion);

    return newVersion.toJSON();
  }),

  /**
   * Get document by ID
   */
  getById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.id);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check if deleted
    if (document.isDeleted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check access
    if (!document.hasAccess(userId, AccessLevel.VIEW) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }

    return document.toJSON();
  }),

  /**
   * List documents accessible by current user
   */
  list: protectedProcedure
    .input(
      z
        .object({
          caseId: z.string().uuid().optional(),
          status: z.enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SIGNED', 'ARCHIVED', 'SUPERSEDED']).optional(),
          classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED']).optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

      let documents: CaseDocument[];

      if (input?.caseId) {
        documents = await documentRepo.findByCaseId(input.caseId);
      } else {
        documents = await documentRepo.findAccessibleByUser(userId, userId); // Using userId as tenantId
      }

      // Apply filters
      let filtered = documents;

      if (input?.status) {
        filtered = filtered.filter((doc) => doc.status === input.status);
      }

      if (input?.classification) {
        filtered = filtered.filter((doc) => doc.metadata.classification === input.classification);
      }

      // Pagination
      const total = filtered.length;
      const offset = input?.offset ?? 0;
      const limit = input?.limit ?? 20;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        data: paginated.map((doc) => doc.toJSON()),
        total,
        limit,
        offset,
      };
    }),

  /**
   * Grant access to a user or role
   */
  grantAccess: protectedProcedure.input(grantAccessInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check if user has ADMIN access
    if (!document.hasAccess(userId, AccessLevel.ADMIN) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Grant access using domain method
    document.grantAccess(
      input.principalId,
      input.principalType,
      input.accessLevel as AccessLevel,
      userId,
      input.expiresAt
    );

    await documentRepo.save(document);

    return { success: true };
  }),

  /**
   * Revoke access from a user or role
   */
  revokeAccess: protectedProcedure
    .input(z.object({ documentId: z.string().uuid(), principalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // Check ADMIN access
      if (!document.hasAccess(userId, AccessLevel.ADMIN) && document.toJSON().createdBy !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      // Revoke access using domain method
      document.revokeAccess(input.principalId, userId);

      await documentRepo.save(document);

      return { success: true };
    }),

  /**
   * Submit document for review
   */
  submitForReview: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check access
    if (!document.hasAccess(userId, AccessLevel.EDIT) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Submit for review using domain method
    try {
      document.submitForReview(userId);
      await documentRepo.save(document);
      return { success: true };
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
    }
  }),

  /**
   * Approve document
   */
  approve: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check ADMIN access
    if (!document.hasAccess(userId, AccessLevel.ADMIN) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Approve using domain method
    try {
      document.approve(userId);
      await documentRepo.save(document);
      return { success: true };
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
    }
  }),

  /**
   * Sign document with e-signature
   */
  sign: protectedProcedure.input(signDocumentInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check access
    if (!document.hasAccess(userId, AccessLevel.EDIT) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Sign using domain method
    try {
      document.sign(userId, input.ipAddress, input.userAgent);
      await documentRepo.save(document);

      const data = document.toJSON();
      return {
        success: true,
        signatureHash: data.eSignature?.signatureHash,
        document: data,
      };
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
    }
  }),

  /**
   * Archive document
   */
  archive: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Archive using domain method
    try {
      document.archive(userId);
      await documentRepo.save(document);
      return { success: true };
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message });
    }
  }),

  /**
   * Place legal hold on document
   */
  placeLegalHold: protectedProcedure.input(placeLegalHoldInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    const userRole = ctx.user?.role;

    if (!userId || (userRole !== 'ADMIN' && userRole !== 'LEGAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins and legal team can place legal holds' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Place legal hold using domain method
    document.placeLegalHold(input.retentionUntil, userId);
    await documentRepo.save(document);

    return { success: true };
  }),

  /**
   * Release legal hold
   */
  releaseLegalHold: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    const userRole = ctx.user?.role;

    if (!userId || (userRole !== 'ADMIN' && userRole !== 'LEGAL')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins and legal team can release legal holds' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Release legal hold using domain method
    document.releaseLegalHold(userId);
    await documentRepo.save(document);

    return { success: true };
  }),

  /**
   * Soft delete document
   */
  delete: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Soft delete using domain method (checks legal hold)
    try {
      document.delete(userId);
      await documentRepo.save(document);
      return { success: true };
    } catch (error) {
      throw new TRPCError({ code: 'FORBIDDEN', message: (error as Error).message });
    }
  }),

  /**
   * Get audit trail for document
   */
  getAuditTrail: protectedProcedure.input(z.object({ documentId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const auditLogs = await ctx.prisma.caseDocumentAudit.findMany({
      where: { document_id: input.documentId },
      orderBy: { created_at: 'desc' },
    });

    return auditLogs;
  }),

  /**
   * Bulk download documents - returns storage keys
   */
  bulkDownload: protectedProcedure
    .input(bulkDownloadDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);
      const { ids } = input;

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const storageKeys: Array<{ id: string; title: string; storageKey: string }> = [];

      for (const docId of ids) {
        try {
          const document = await documentRepo.findById(docId);
          if (!document) {
            failed.push({ id: docId, error: 'Document not found' });
            continue;
          }

          if (!document.hasAccess(userId, AccessLevel.VIEW)) {
            failed.push({ id: docId, error: 'Access denied' });
            continue;
          }

          const data = document.toJSON();
          storageKeys.push({
            id: docId,
            title: data.metadata.title,
            storageKey: data.storageKey,
          });
          successful.push(docId);
        } catch (error) {
          failed.push({
            id: docId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length, storageKeys };
    }),

  /**
   * Bulk archive documents
   */
  bulkArchive: protectedProcedure
    .input(bulkArchiveDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);
      const { ids } = input;

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const docId of ids) {
        try {
          const document = await documentRepo.findById(docId);
          if (!document) {
            failed.push({ id: docId, error: 'Document not found' });
            continue;
          }

          document.archive(userId);
          await documentRepo.save(document);
          successful.push(docId);
        } catch (error) {
          failed.push({
            id: docId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length };
    }),

  /**
   * Bulk delete documents (soft delete)
   */
  bulkDelete: protectedProcedure
    .input(bulkDeleteDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prisma);
      const { ids } = input;

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const docId of ids) {
        try {
          const document = await documentRepo.findById(docId);
          if (!document) {
            failed.push({ id: docId, error: 'Document not found' });
            continue;
          }

          document.delete(userId);
          await documentRepo.save(document);
          successful.push(docId);
        } catch (error) {
          failed.push({
            id: docId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length };
    }),
});
