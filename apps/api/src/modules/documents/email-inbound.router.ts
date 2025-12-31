import { z } from 'zod';
import { router, publicProcedure } from '../../trpc';
import { TRPCError } from '@trpc/server';
import { IngestionOrchestrator } from '@intelliflow/application';
import { createHash, createHmac } from 'crypto';

/**
 * Email Attachment Schema
 */
const emailAttachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  content: z.string(), // Base64 encoded
  size: z.number(),
});

/**
 * Inbound Email Schema (SendGrid/SES format)
 */
const inboundEmailSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  attachments: z.array(emailAttachmentSchema).default([]),
  headers: z.record(z.string()).optional(),
  // Webhook signature for verification (SendGrid)
  signature: z.string().optional(),
});

/**
 * Email Inbound Router
 *
 * Processes inbound emails with attachments from SendGrid/SES webhooks.
 * Attachments are automatically ingested into the case document system.
 */
export const emailInboundRouter = router({
  /**
   * Process inbound email with attachments
   */
  processInbound: publicProcedure.input(inboundEmailSchema).mutation(async ({ input, ctx }) => {
    // Verify webhook signature (SendGrid)
    if (input.signature) {
      const isValid = verifyWebhookSignature(input, input.signature);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook signature',
        });
      }
    }

    // Extract tenant ID from email address (e.g., case-123@tenant1.intelliflow.com)
    const tenantId = extractTenantId(input.to);
    if (!tenantId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Unable to determine tenant from email address',
      });
    }

    // Extract case ID from email address
    const caseId = extractCaseId(input.to);

    // Process each attachment
    const orchestrator = ctx.container!.get<IngestionOrchestrator>('IngestionOrchestrator');
    const results: Array<{ filename: string; documentId?: string; error?: string }> = [];

    for (const attachment of input.attachments) {
      try {
        // Decode base64 content
        const fileBuffer = Buffer.from(attachment.content, 'base64');

        // Ingest attachment
        const result = await orchestrator.ingestFile(fileBuffer, {
          tenantId,
          filename: attachment.filename,
          mimeType: attachment.contentType,
          uploadedBy: 'system', // Email ingestion is system-initiated
          relatedCaseId: caseId,
        });

        if (result.success) {
          results.push({
            filename: attachment.filename,
            documentId: result.documentId,
          });
        } else {
          results.push({
            filename: attachment.filename,
            error: result.error,
          });
        }
      } catch (error: any) {
        results.push({
          filename: attachment.filename,
          error: error.message,
        });
      }
    }

    return {
      from: input.from,
      to: input.to,
      subject: input.subject,
      attachmentCount: input.attachments.length,
      processedAttachments: results,
      success: results.every((r) => !r.error),
    };
  }),
});

/**
 * Verify SendGrid webhook signature
 */
function verifyWebhookSignature(payload: any, signature: string): boolean {
  const webhookKey = process.env.SENDGRID_WEBHOOK_KEY;
  if (!webhookKey) {
    console.warn('SENDGRID_WEBHOOK_KEY not configured, skipping signature verification');
    return true; // In development, allow unsigned requests
  }

  const payloadString = JSON.stringify(payload);
  const hmac = createHmac('sha256', webhookKey);
  hmac.update(payloadString);
  const expectedSignature = hmac.digest('base64');

  return signature === expectedSignature;
}

/**
 * Extract tenant ID from email address
 * Example: case-123@tenant1.intelliflow.com → tenant1
 */
function extractTenantId(email: string): string | null {
  const match = email.match(/@([^.]+)\.intelliflow\.com$/);
  return match ? match[1] : null;
}

/**
 * Extract case ID from email address
 * Example: case-123@tenant1.intelliflow.com → 123
 */
function extractCaseId(email: string): string | undefined {
  const match = email.match(/^case-([^@]+)@/);
  return match ? match[1] : undefined;
}
