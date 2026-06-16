/**
 * Case Documents tRPC Router - IFC-152
 *
 * API endpoints for document management with versioning, ACL, and e-signature support.
 * Refactored to use domain model and repository pattern following hexagonal architecture.
 */

import { CaseDocument, AccessLevel, DocumentClassification } from '@intelliflow/domain';
import {
  bulkDownloadDocumentsSchema,
  bulkArchiveDocumentsSchema,
  bulkDeleteDocumentsSchema,
} from '@intelliflow/validators';
import { PrismaCaseDocumentRepository } from '@intelliflow/adapters';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { container } from '../../container';
import { loadBullMQ } from '../../lib/load-bullmq';
import { loadDocumentAutomation, assertNotDeleteGuarded } from './document-automation';
import { enforceDocumentPolicies } from './document-policies';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { pickTrustedForwardedIp } from '../../security/client-ip';
// PG-186 Cat-2 helpers (notifyDocumentReassignment, notifyOnDuplicate consumer)
// are exported from document-automation.ts and will be consumed by:
//   IFC-310 — duplicate-detection runtime (notifyOnDuplicate firing on collision)
//   IFC-311 — document-reassign endpoint (notifyDocumentReassignment on owner change)
// They are intentionally NOT imported here — the toggles persist (so user
// preferences carry forward) but are gated as Cat-2 in the spec/UI.

// ============================================================================
// Input Schemas
// ============================================================================

const createDocumentInputSchema = z
  .object({
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
    documentTypeLabel: z.string().trim().min(1).max(100).optional(),
    classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED']),
    tags: z.array(z.string().max(50)).max(20).default([]),
    relatedCaseId: z.uuid().optional(),
    relatedContactId: z.uuid().optional(),
    contentHash: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((input, ctx) => {
    if (input.documentType !== 'OTHER' && input.documentTypeLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'documentTypeLabel is only allowed when documentType is OTHER',
        path: ['documentTypeLabel'],
      });
    }
  });

const grantAccessInputSchema = z.object({
  documentId: z.uuid(),
  principalId: z.uuid(),
  principalType: z.enum(['USER', 'ROLE', 'TENANT']),
  accessLevel: z.enum(['NONE', 'VIEW', 'COMMENT', 'EDIT', 'ADMIN']),
  expiresAt: z.coerce.date().optional(),
});

const createVersionInputSchema = z.object({
  documentId: z.uuid(),
  versionType: z.enum(['major', 'minor', 'patch']),
  storageKey: z.string().min(1),
  contentHash: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
});

const signDocumentInputSchema = z.object({
  documentId: z.uuid(),
});

const placeLegalHoldInputSchema = z.object({
  documentId: z.uuid(),
  retentionUntil: z.coerce.date(),
});

// ============================================================================
// tRPC Router
// ============================================================================

export const documentsRouter = createTRPCRouter({
  /**
   * Create a new document
   */
  create: tenantProcedure.input(createDocumentInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    const tenantId = ctx.user?.tenantId;
    if (!userId || !tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    // PG-186: Enforce tenant policies (MIME allowlist, size ceiling, required
    // fields) before any persistence side-effect. Throws TRPCError on
    // violation, so `create` cannot succeed with a payload the Document
    // Settings page has marked disallowed.
    await enforceDocumentPolicies(ctx, input);

    // PG-186: automation flags are still loaded in case future Cat-1
    // toggles need to run at create-time, but `normalizeFilename` is no
    // longer applied to `input.title` — the user's display title is
    // preserved as typed. Filename normalization only makes sense for an
    // actual filename (see upload.router.ts, which operates on `filename`).
    void (await loadDocumentAutomation(ctx));

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

    // Generate storageKey server-side (AC-011)
    const extension = input.mimeType.split('/').pop() || 'bin';
    const storageKey = `${tenantId}/${crypto.randomUUID()}.${extension}`;

    // Create document using domain model
    const document = CaseDocument.create({
      tenantId,
      metadata: {
        title: input.title,
        description: input.description,
        documentType: input.documentType as any,
        documentTypeLabel: input.documentTypeLabel,
        classification: input.classification as DocumentClassification,
        tags: input.tags,
        relatedCaseId: input.relatedCaseId,
        relatedContactId: input.relatedContactId,
      },
      storageKey,
      contentHash: input.contentHash,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdBy: userId,
    });

    // Grant creator admin access
    document.grantAccess(userId, 'USER', AccessLevel.ADMIN, userId);

    // Persist to database
    await documentRepo.save(document);

    // Fire-and-forget: enqueue text extraction / OCR (best-effort)
    (async () => {
      const { Queue } = await loadBullMQ();
      const connection = {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      };
      const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/tiff'];
      const isImage = imageMimes.includes(input.mimeType);
      const queueName = isImage ? 'intelliflow-ocr-processing' : 'intelliflow-text-extraction';
      const formatMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'docx',
        'text/plain': 'txt',
        'text/html': 'html',
      };
      const queue = new Queue(queueName, { connection });
      await queue.add(isImage ? 'ocr-process' : 'extract-text', {
        documentId: document.id,
        sourceUrl: `storage://${storageKey}`,
        format: isImage ? input.mimeType.split('/')[1] : formatMap[input.mimeType] || 'txt',
        tenantId,
        userId,
        language: 'en',
        options: { extractMetadata: true, generateEmbeddings: true },
      });
      await queue.close();
    })().catch(() => {});

    return document.toJSON();
  }),

  /**
   * Create a new version of the document
   */
  createVersion: tenantProcedure
    .input(createVersionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  getById: tenantProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  list: tenantProcedure
    .input(
      z
        .object({
          caseId: z.uuid().optional(),
          status: z
            .enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SIGNED', 'ARCHIVED', 'SUPERSEDED'])
            .optional(),
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

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

      let documents: CaseDocument[];

      if (input?.caseId) {
        documents = await documentRepo.findByCaseId(input.caseId);
      } else {
        documents = await documentRepo.findAccessibleByUser(userId, ctx.user?.tenantId ?? userId);
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
  grantAccess: tenantProcedure.input(grantAccessInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  revokeAccess: tenantProcedure
    .input(z.object({ documentId: z.uuid(), principalId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // Check ADMIN access
      if (
        !document.hasAccess(userId, AccessLevel.ADMIN) &&
        document.toJSON().createdBy !== userId
      ) {
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
  submitForReview: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  approve: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // Check ADMIN access
      if (
        !document.hasAccess(userId, AccessLevel.ADMIN) &&
        document.toJSON().createdBy !== userId
      ) {
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
  sign: tenantProcedure.input(signDocumentInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

    const document = await documentRepo.findById(input.documentId);
    if (!document) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
    }

    // Check access
    if (!document.hasAccess(userId, AccessLevel.EDIT) && document.toJSON().createdBy !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    // Extract IP and User-Agent from request headers server-side (AC-003).
    // ctx.req is a Fetch Request (headers is a Headers object). Use the
    // rightmost, edge-set x-forwarded-for hop via pickTrustedForwardedIp —
    // the leftmost hop is client-spoofable and would let an attacker forge
    // the signature audit IP (#445; the #261/#447 trusted-hop fix, applied to
    // the legal dead-zone). Mirrors security/middleware.ts extractIpAddress.
    const req = ctx.req;
    const forwardedFor = req?.headers?.get?.('x-forwarded-for');
    const ipAddress =
      pickTrustedForwardedIp(forwardedFor) ?? req?.headers?.get?.('x-real-ip') ?? 'unknown';
    const userAgent = req?.headers?.get?.('user-agent') ?? 'unknown';

    // Compute signature hash via SignatureProvider (AC-002)
    const signatureHash = await container.signatureProvider.computeSignatureHash(
      document.contentHash,
      userId,
      new Date()
    );

    // Sign using domain method
    try {
      document.sign(userId, ipAddress, userAgent, signatureHash);
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
  archive: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // Check EDIT access (AC-008)
      if (!document.hasAccess(userId, AccessLevel.EDIT) && document.toJSON().createdBy !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions to archive' });
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
  placeLegalHold: tenantProcedure
    .input(placeLegalHoldInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      const userRole = ctx.user?.role;

      if (!userId || (userRole !== 'ADMIN' && userRole !== 'LEGAL')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins and legal team can place legal holds',
        });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  releaseLegalHold: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      const userRole = ctx.user?.role;

      if (!userId || (userRole !== 'ADMIN' && userRole !== 'LEGAL')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins and legal team can release legal holds',
        });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

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
  delete: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);

      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // PG-186: Check automation delete guard
      const deleteFlags = await loadDocumentAutomation(ctx);
      await assertNotDeleteGuarded(ctx, input.documentId, deleteFlags);

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
   * Get a signed URL for document preview/download (AC-004)
   */
  getSignedUrl: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);
      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }

      // Check VIEW access
      if (!document.hasAccess(userId, AccessLevel.VIEW) && document.toJSON().createdBy !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Generate signed URL with 1-hour expiry (NF-004)
      const expiresInSeconds = 3600;
      const url = await container.adapters.storageService.getSignedUrl(
        document.storageKey,
        expiresInSeconds
      );
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return { url, expiresAt };
    }),

  /**
   * Get audit trail for document
   */
  getAuditTrail: tenantProcedure
    .input(z.object({ documentId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      // Check VIEW access (AC-008)
      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);
      const document = await documentRepo.findById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }
      if (!document.hasAccess(userId, AccessLevel.VIEW) && document.toJSON().createdBy !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied to audit trail' });
      }

      const auditLogs = await ctx.prismaWithTenant.caseDocumentAudit.findMany({
        where: { documentId: input.documentId },
        orderBy: { createdAt: 'desc' },
      });

      return auditLogs;
    }),

  /**
   * Bulk download documents - returns storage keys
   */
  bulkDownload: tenantProcedure
    .input(bulkDownloadDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);
      const { ids } = input;

      // Deduplicate ids before the batch fetch; preserve original iteration order
      const uniqueIds = [...new Set(ids)];
      const fetched = await documentRepo.findByIds(uniqueIds);
      const docMap = new Map(fetched.map((d) => [d.id, d]));

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const storageKeys: Array<{ id: string; title: string; storageKey: string }> = [];

      for (const docId of ids) {
        try {
          const document = docMap.get(docId);
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
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length, storageKeys };
    }),

  /**
   * Bulk archive documents
   */
  bulkArchive: tenantProcedure
    .input(bulkArchiveDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.userId;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
      }

      const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);
      const { ids } = input;

      // Batch-fetch all documents in a single query (NP-037 fix)
      const uniqueIds = [...new Set(ids)];
      const fetched = await documentRepo.findByIds(uniqueIds);
      const docMap = new Map(fetched.map((d) => [d.id, d]));

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const docId of ids) {
        try {
          const document = docMap.get(docId);
          if (!document) {
            failed.push({ id: docId, error: 'Document not found' });
            continue;
          }

          // ACL check per document (AC-008, NF-002)
          if (
            !document.hasAccess(userId, AccessLevel.EDIT) &&
            document.toJSON().createdBy !== userId
          ) {
            failed.push({ id: docId, error: 'Insufficient permissions to archive' });
            continue;
          }

          document.archive(userId);
          await documentRepo.save(document);
          successful.push(docId);
        } catch (error) {
          failed.push({
            id: docId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { successful, failed, totalProcessed: ids.length };
    }),

  /**
   * Bulk delete documents (soft delete)
   */
  bulkDelete: tenantProcedure.input(bulkDeleteDocumentsSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.userId;
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const documentRepo = new PrismaCaseDocumentRepository(ctx.prismaWithTenant);
    const { ids } = input;

    // Batch-fetch all documents in a single query (NP-038 fix)
    const uniqueIds = [...new Set(ids)];
    const fetched = await documentRepo.findByIds(uniqueIds);
    const docMap = new Map(fetched.map((d) => [d.id, d]));

    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const docId of ids) {
      try {
        const document = docMap.get(docId);
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
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed, totalProcessed: ids.length };
  }),
});
