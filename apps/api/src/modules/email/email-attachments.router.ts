/**
 * Email Attachments Router — PG-207 (owner ruling Q11).
 *
 * Compose uploads each attachment here before sending; the file is stored in
 * the tenant's private email-attachments area and `sendEmail` reads it back by
 * path (paths outside the tenant are refused by the storage adapter). Up to
 * 10 MB per file; executable types are refused by the input schema.
 */
import { TRPCError } from '@trpc/server';
import { uploadEmailAttachmentInputSchema, type EmailAttachmentRef } from '@intelliflow/validators';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import { createTRPCRouter, tenantProcedure, verifiedTenantProcedure } from '../../trpc';
import { assertTenantContext } from '../../security/tenant-context';
import { emailRuntimeDeps, type EmailRouterCtx } from './email-access';
import { fetchEmailAttachment, type ProxiedAttachment } from './email-attachment-proxy';

export const emailAttachmentsRouter = createTRPCRouter({
  /**
   * Opens or downloads an attachment (or an inline image) of synced mail. The file is read from the
   * mail provider now and returned; it is never stored in Aurora (email-attachment-proxy.ts).
   */
  fetch: tenantProcedure
    .input(z.object({ emailId: recordIdSchema, attachmentId: recordIdSchema }))
    .query(async ({ ctx, input }): Promise<ProxiedAttachment> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { transports } = emailRuntimeDeps(c);
      return fetchEmailAttachment(c, transports, input);
    }),

  upload: verifiedTenantProcedure
    .input(uploadEmailAttachmentInputSchema)
    .mutation(async ({ ctx, input }): Promise<EmailAttachmentRef> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { storage } = emailRuntimeDeps(c);
      const content = Buffer.from(input.contentBase64, 'base64');
      let storagePath: string;
      try {
        storagePath = await storage.uploadEmailAttachment(
          c.tenant.tenantId,
          content,
          input.fileName,
          input.contentType
        );
      } catch {
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'The attachment could not be stored. Try again.',
        });
      }
      return {
        storagePath,
        fileName: input.fileName,
        contentType: input.contentType,
        size: content.length,
      };
    }),
});
