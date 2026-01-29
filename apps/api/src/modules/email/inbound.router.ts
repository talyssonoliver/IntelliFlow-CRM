/**
 * Inbound Email Router
 *
 * Handles inbound email webhooks from email providers (SendGrid, Mailgun, etc.)
 * Parses emails, extracts attachments, and creates case/conversation records.
 *
 * @module api/modules/email
 * @task IFC-173 - Complete inbound email parsing endpoint
 * @artifact apps/api/src/modules/email/inbound.router.ts
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../../trpc';
import {
  InboundEmailParser,
  ParsedEmail,
  ParsedAttachment,
} from '@intelliflow/adapters/messaging/email/inbound';

// ============================================================================
// Input Schemas
// ============================================================================

const InboundEmailWebhookSchema = z.object({
  // SendGrid format
  headers: z.string().optional(),
  dkim: z.string().optional(),
  to: z.string().optional(),
  html: z.string().optional(),
  from: z.string().optional(),
  text: z.string().optional(),
  sender_ip: z.string().optional(),
  spam_report: z.string().optional(),
  envelope: z.string().optional(),
  attachments: z.string().optional(),
  subject: z.string().optional(),
  spam_score: z.string().optional(),
  charsets: z.string().optional(),
  SPF: z.string().optional(),

  // Raw email format (alternative)
  rawEmail: z.string().optional(),

  // Provider identification
  provider: z.enum(['sendgrid', 'mailgun', 'postmark', 'raw']).optional(),
});

const ProcessEmailInputSchema = z.object({
  emailId: z.string(),
  action: z.enum(['archive', 'spam', 'delete', 'forward']),
  forwardTo: z.string().email().optional(),
});

const ListEmailsInputSchema = z.object({
  tenantId: z.string(),
  caseId: z.string().optional(),
  threadId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Response Types
// ============================================================================

interface ParsedEmailResponse {
  id: string;
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    checksum: string;
  }>;
  threadId?: string;
  isReply: boolean;
  isForward: boolean;
  spamScore?: number;
  receivedAt: string;
}

// ============================================================================
// Router Implementation
// ============================================================================

const parser = new InboundEmailParser();

export const inboundEmailRouter = router({
  /**
   * Webhook endpoint for receiving inbound emails
   * This is a public endpoint that email providers call
   */
  webhook: publicProcedure
    .input(InboundEmailWebhookSchema)
    .mutation(async ({ input, ctx }): Promise<{ success: boolean; emailId: string }> => {
      try {
        let rawEmail: string;

        // Handle different provider formats
        if (input.rawEmail) {
          rawEmail = input.rawEmail;
        } else if (input.provider === 'sendgrid' || input.headers) {
          // Reconstruct raw email from SendGrid format
          rawEmail = reconstructSendGridEmail(input);
        } else if (input.provider === 'mailgun') {
          // Mailgun sends raw email in body-mime field
          rawEmail = input.rawEmail || '';
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Unable to parse email format',
          });
        }

        // Parse the email
        const parsed = parser.parse(rawEmail);

        // Check for spam
        if (parsed.spamScore && parsed.spamScore >= 70) {
          // Log spam but don't process
          console.warn('Spam email detected', {
            emailId: parsed.id,
            spamScore: parsed.spamScore,
            from: parsed.headers.from.address,
          });

          return {
            success: true,
            emailId: parsed.id,
          };
        }

        // Store email and create conversation record
        // In production, this would save to database
        await storeEmail(parsed, ctx);

        // Process attachments
        if (parsed.attachments.length > 0) {
          await processAttachments(parsed.id, parsed.attachments, ctx);
        }

        return {
          success: true,
          emailId: parsed.id,
        };
      } catch (error) {
        console.error('Failed to process inbound email', error);

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process inbound email',
          cause: error,
        });
      }
    }),

  /**
   * Get parsed email by ID
   */
  getEmail: protectedProcedure
    .input(z.object({ emailId: z.string() }))
    .query(async ({ input, ctx }): Promise<ParsedEmailResponse | null> => {
      // In production, fetch from database
      // For now, return mock data
      return null;
    }),

  /**
   * List emails for a case or thread
   */
  listEmails: protectedProcedure
    .input(ListEmailsInputSchema)
    .query(async ({ input, ctx }): Promise<{
      emails: ParsedEmailResponse[];
      total: number;
      hasMore: boolean;
    }> => {
      // In production, fetch from database with filters
      return {
        emails: [],
        total: 0,
        hasMore: false,
      };
    }),

  /**
   * Process an email (archive, spam, delete, forward)
   */
  processEmail: protectedProcedure
    .input(ProcessEmailInputSchema)
    .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
      const { emailId, action, forwardTo } = input;

      switch (action) {
        case 'archive':
          // Mark as archived in database
          break;
        case 'spam':
          // Mark as spam and update spam training
          break;
        case 'delete':
          // Soft delete email
          break;
        case 'forward':
          if (!forwardTo) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Forward address required',
            });
          }
          // Forward email using outbound service
          break;
      }

      return { success: true };
    }),

  /**
   * Get email thread by thread ID
   */
  getThread: protectedProcedure
    .input(z.object({
      threadId: z.string(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }): Promise<{
      threadId: string;
      subject: string;
      emails: ParsedEmailResponse[];
      participantCount: number;
    }> => {
      // In production, fetch thread from database
      return {
        threadId: input.threadId,
        subject: '',
        emails: [],
        participantCount: 0,
      };
    }),

  /**
   * Download attachment
   */
  getAttachment: protectedProcedure
    .input(z.object({
      emailId: z.string(),
      attachmentId: z.string(),
    }))
    .query(async ({ input, ctx }): Promise<{
      filename: string;
      contentType: string;
      size: number;
      downloadUrl: string;
    } | null> => {
      // In production, generate signed URL for attachment download
      return null;
    }),
});

// ============================================================================
// Helper Functions
// ============================================================================

function reconstructSendGridEmail(input: z.infer<typeof InboundEmailWebhookSchema>): string {
  const lines: string[] = [];

  // Reconstruct headers
  if (input.headers) {
    lines.push(input.headers);
  } else {
    // Build minimal headers
    if (input.from) lines.push(`From: ${input.from}`);
    if (input.to) lines.push(`To: ${input.to}`);
    if (input.subject) lines.push(`Subject: ${input.subject}`);
    if (input.dkim) lines.push(`DKIM-Signature: ${input.dkim}`);
    if (input.SPF) lines.push(`Received-SPF: ${input.SPF}`);
    lines.push(`Content-Type: text/plain; charset=utf-8`);
  }

  // Empty line between headers and body
  lines.push('');

  // Add body
  if (input.text) {
    lines.push(input.text);
  } else if (input.html) {
    lines.push(input.html);
  }

  return lines.join('\r\n');
}

async function storeEmail(parsed: ParsedEmail, ctx: unknown): Promise<void> {
  // In production, save to database:
  // - Create or update conversation record
  // - Link to case if thread matches existing case
  // - Store email metadata
  // - Index for search

  console.log('Storing email', {
    id: parsed.id,
    from: parsed.headers.from.address,
    subject: parsed.headers.subject,
    threadId: parsed.threadId,
    isReply: parsed.isReply,
    attachmentCount: parsed.attachments.length,
  });
}

async function processAttachments(
  emailId: string,
  attachments: ParsedAttachment[],
  ctx: unknown
): Promise<void> {
  // In production:
  // - Upload to object storage
  // - Run antivirus scan
  // - Extract metadata
  // - Index for search

  for (const attachment of attachments) {
    console.log('Processing attachment', {
      emailId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      checksum: attachment.checksum,
    });
  }
}

export type InboundEmailRouter = typeof inboundEmailRouter;
