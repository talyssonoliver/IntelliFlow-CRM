/**
 * Inbound Email Router
 *
 * Handles email CRUD operations using Prisma persistence.
 * Inbound webhooks parse emails via InboundEmailParser from @intelliflow/adapters.
 * Outbound sending is stubbed pending OAuth account wiring (PG-084).
 *
 * @module api/modules/email
 * @task IFC-173 - Inbound email parsing endpoint
 * @task PG-141 - Email compose & history page (UI type contracts)
 * @task PG-084 - Full email client integration (OAuth, real send/receive)
 * @artifact apps/api/src/modules/email/inbound.router.ts
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, tenantProcedure } from '../../trpc';
import { MarkAsReadInputSchema, GetUnreadCountsInputSchema } from '@intelliflow/validators';
// Import from adapters - using any cast for module resolution compatibility
import * as adapters from '@intelliflow/adapters';
const InboundEmailParser = (adapters as any).InboundEmailParser;
const createOutboundEmailService = (adapters as any).createOutboundEmailService as (config?: {
  sendgridApiKey?: string;
  useMock?: boolean;
}) => {
  sendEmail(email: any): Promise<{ status: string; error?: string; messageId: string }>;
};
type ParsedEmail = any;
type ParsedAttachment = any;

// Singleton outbound email service — picks up SendGrid key if configured, falls back to mock
const outboundEmailService = createOutboundEmailService({
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  useMock: !process.env.SENDGRID_API_KEY,
});

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
  folder: z.string().optional(),
  search: z.string().optional(),
  status: z
    .enum(['PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED'])
    .optional(),
  caseId: z.string().optional(),
  threadId: z.string().optional(),
  contactId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// Response Types
// ============================================================================

export interface ParsedEmailResponse {
  id: string;
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  cc?: Array<{
    address: string;
    name?: string;
  }>;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
  threadId?: string;
  isReply: boolean;
  isForward: boolean;
  isDraft: boolean;
  spamScore?: number;
  receivedAt: string;
  status: string;
  isRead: boolean;
  readAt: string | null;
}

// ============================================================================
// Helpers: Map Prisma EmailRecord to ParsedEmailResponse
// ============================================================================

function mapEmailRecord(record: any): ParsedEmailResponse {
  const metadata = (record.metadata as Record<string, any>) ?? {};
  return {
    id: record.id,
    from: { address: record.fromEmail, name: metadata.fromName },
    to: parseRecipients(record.toEmail),
    cc: record.ccEmails ? parseRecipients(record.ccEmails) : undefined,
    subject: record.subject,
    textBody: metadata.isHtml ? undefined : record.body,
    htmlBody: metadata.isHtml ? record.body : undefined,
    attachments: (record.attachments ?? []).map((a: any) => ({
      id: a.id,
      filename: a.fileName,
      contentType: a.fileType,
      size: a.fileSize,
    })),
    threadId: metadata.threadId,
    isReply: !!metadata.isReply,
    isForward: !!metadata.isForward,
    isDraft: !!metadata.isDraft,
    spamScore: metadata.spamScore,
    receivedAt: (record.sentAt ?? record.createdAt).toISOString(),
    status: record.status,
    isRead: record.isRead ?? false,
    readAt: record.readAt ? record.readAt.toISOString() : null,
  };
}

function parseRecipients(str: string): Array<{ address: string; name?: string }> {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
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
          rawEmail = reconstructSendGridEmail(input);
        } else if (input.provider === 'mailgun') {
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
          console.warn('Spam email detected', {
            emailId: parsed.id,
            spamScore: parsed.spamScore,
            from: parsed.headers.from.address,
          });
          return { success: true, emailId: parsed.id };
        }

        // Store email in database
        const { emailId, tenantId } = await storeEmail(parsed, ctx);

        // Process attachments
        if (parsed.attachments.length > 0) {
          await processAttachments(emailId, tenantId, parsed.attachments, ctx);
        }

        return { success: true, emailId };
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
  getEmail: tenantProcedure
    .input(z.object({ emailId: z.string() }))
    .query(async ({ input, ctx }): Promise<ParsedEmailResponse | null> => {
      const record = await (ctx as any).prisma.emailRecord.findFirst({
        where: {
          id: input.emailId,
          tenantId: (ctx as any).tenant.tenantId,
        },
        include: { attachments: true },
      });
      if (!record) return null;
      return mapEmailRecord(record);
    }),

  /**
   * List emails with folder/search/status filtering
   */
  listEmails: tenantProcedure.input(ListEmailsInputSchema).query(
    async ({
      input,
      ctx,
    }): Promise<{
      emails: ParsedEmailResponse[];
      total: number;
      hasMore: boolean;
    }> => {
      const tenantId = (ctx as any).tenant.tenantId;
      const where: any = { tenantId };

      // Filter by status
      if (input.status) {
        where.status = input.status;
      }

      // Filter by folder via metadata
      if (input.folder) {
        const folderLower = input.folder.toLowerCase();
        if (folderLower === 'sent') {
          where.userId = (ctx as any).user.userId;
          where.status = { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] };
        } else if (folderLower === 'drafts') {
          where.metadata = { path: ['isDraft'], equals: true };
        } else if (folderLower === 'spam') {
          where.metadata = { path: ['isSpam'], equals: true };
        } else if (folderLower === 'trash') {
          where.metadata = { path: ['isTrashed'], equals: true };
        } else if (folderLower === 'archive') {
          where.metadata = { path: ['isArchived'], equals: true };
        }
        // 'inbox' is the default — no additional filter needed
      }

      // Search by subject or body
      if (input.search) {
        where.OR = [
          { subject: { contains: input.search, mode: 'insensitive' } },
          { fromEmail: { contains: input.search, mode: 'insensitive' } },
          { toEmail: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      // Filter by case/thread/contact
      if (input.caseId) where.dealId = input.caseId;
      if (input.contactId) where.contactId = input.contactId;
      if (input.threadId) where.metadata = { path: ['threadId'], equals: input.threadId };

      const [emails, total] = await Promise.all([
        (ctx as any).prisma.emailRecord.findMany({
          where,
          include: { attachments: true },
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        }),
        (ctx as any).prisma.emailRecord.count({ where }),
      ]);

      return {
        emails: emails.map(mapEmailRecord),
        total,
        hasMore: input.offset + emails.length < total,
      };
    }
  ),

  /**
   * Process an email (archive, spam, delete, forward)
   */
  processEmail: tenantProcedure
    .input(ProcessEmailInputSchema)
    .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
      const { emailId, action, forwardTo } = input;
      const tenantId = (ctx as any).tenant.tenantId;

      // Verify email belongs to tenant
      const existing = await (ctx as any).prisma.emailRecord.findFirst({
        where: { id: emailId, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found' });
      }

      const currentMeta = (existing.metadata as Record<string, any>) ?? {};

      switch (action) {
        case 'archive':
          await (ctx as any).prisma.emailRecord.update({
            where: { id: emailId },
            data: { metadata: { ...currentMeta, isArchived: true, isTrashed: false } },
          });
          break;
        case 'spam':
          await (ctx as any).prisma.emailRecord.update({
            where: { id: emailId },
            data: { metadata: { ...currentMeta, isSpam: true } },
          });
          break;
        case 'delete':
          await (ctx as any).prisma.emailRecord.update({
            where: { id: emailId },
            data: { metadata: { ...currentMeta, isTrashed: true } },
          });
          break;
        case 'forward': {
          if (!forwardTo) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Forward address required' });
          }
          const fromEmail = (ctx as any).user.email ?? existing.toEmail;

          // Persist the forwarded email record
          const forwardRecord = await (ctx as any).prisma.emailRecord.create({
            data: {
              subject: `Fwd: ${existing.subject}`,
              body: existing.body,
              fromEmail,
              toEmail: forwardTo,
              status: 'PENDING',
              tenantId,
              userId: (ctx as any).user.userId,
              metadata: { isForward: true, originalEmailId: emailId },
            },
          });

          // Send via the outbound email service
          let forwardStatus: 'SENT' | 'FAILED' = 'SENT';
          try {
            const sendResult = await outboundEmailService.sendEmail({
              from: { email: fromEmail, type: 'to' },
              recipients: [{ email: forwardTo, type: 'to' as const }],
              subject: `Fwd: ${existing.subject}`,
              htmlBody: existing.body,
            });
            if (sendResult.status === 'failed') {
              forwardStatus = 'FAILED';
              console.error('Email forward failed', {
                recordId: forwardRecord.id,
                error: sendResult.error,
              });
            }
          } catch (error) {
            forwardStatus = 'FAILED';
            console.error('Email forward threw unexpectedly', {
              recordId: forwardRecord.id,
              error,
            });
          }

          await (ctx as any).prisma.emailRecord.update({
            where: { id: forwardRecord.id },
            data: {
              status: forwardStatus,
              sentAt: forwardStatus === 'SENT' ? new Date() : null,
            },
          });
          break;
        }
      }

      return { success: true };
    }),

  /**
   * Get email thread by thread ID (grouped by subject/metadata)
   */
  getThread: tenantProcedure
    .input(
      z.object({
        threadId: z.string(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<{
        threadId: string;
        subject: string;
        emails: ParsedEmailResponse[];
        participantCount: number;
      }> => {
        const tenantId = (ctx as any).tenant.tenantId;

        // Query emails belonging to this thread via metadata
        const emails = await (ctx as any).prisma.emailRecord.findMany({
          where: {
            tenantId,
            metadata: { path: ['threadId'], equals: input.threadId },
          },
          include: { attachments: true },
          orderBy: { createdAt: 'asc' },
          take: input.limit,
        });

        // Collect unique participants
        const participants = new Set<string>();
        for (const email of emails) {
          participants.add(email.fromEmail);
          parseRecipients(email.toEmail).forEach((r) => participants.add(r.address));
          if (email.ccEmails) {
            parseRecipients(email.ccEmails).forEach((r) => participants.add(r.address));
          }
        }

        return {
          threadId: input.threadId,
          subject: emails[0]?.subject ?? '',
          emails: emails.map(mapEmailRecord),
          participantCount: participants.size,
        };
      }
    ),

  /**
   * Download attachment metadata
   */
  getAttachment: tenantProcedure
    .input(
      z.object({
        emailId: z.string(),
        attachmentId: z.string(),
      })
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<{
        filename: string;
        contentType: string;
        size: number;
        downloadUrl: string;
      } | null> => {
        const tenantId = (ctx as any).tenant.tenantId;

        // Verify the email belongs to the tenant
        const email = await (ctx as any).prisma.emailRecord.findFirst({
          where: { id: input.emailId, tenantId },
        });
        if (!email) return null;

        const attachment = await (ctx as any).prisma.emailAttachment.findFirst({
          where: { id: input.attachmentId, emailId: input.emailId },
        });
        if (!attachment) return null;

        // Requires OAuth email provider integration (PG-084). Will generate a signed URL from
        // S3/Supabase Storage once the storage provider is wired. Returns the stored URL in the interim.
        return {
          filename: attachment.fileName,
          contentType: attachment.fileType,
          size: attachment.fileSize,
          downloadUrl: attachment.fileUrl || `/api/email/attachments/${attachment.id}`,
        };
      }
    ),

  /**
   * Send an email
   * Creates an EmailRecord with PENDING status.
   * Requires OAuth email provider integration (PG-084). Will delegate to GmailAdapter.sendMessage()
   * or OutlookAdapter once OAuth credentials are provisioned. Currently persists as PENDING record.
   */
  sendEmail: tenantProcedure
    .input(
      z.object({
        to: z.array(z.string().email()),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string(),
        htmlBody: z.string(),
        textBody: z.string().optional(),
        attachments: z
          .array(
            z.object({
              fileName: z.string(),
              fileSize: z.number(),
              fileUrl: z.string(),
            })
          )
          .optional(),
        threadId: z.string().optional(),
        templateId: z.string().optional(),
      })
    )
    .mutation(
      async ({ input, ctx }): Promise<{ id: string; status: 'PENDING' | 'SENT' | 'FAILED' }> => {
        const tenantId = (ctx as any).tenant.tenantId;
        const userId = (ctx as any).user.userId;
        const fromEmail = (ctx as any).user.email ?? 'noreply@intelliflow.com';

        const record = await (ctx as any).prisma.emailRecord.create({
          data: {
            subject: input.subject,
            body: input.htmlBody,
            fromEmail,
            toEmail: input.to.join(', '),
            ccEmails: input.cc?.join(', ') ?? null,
            bccEmails: input.bcc?.join(', ') ?? null,
            status: 'PENDING',
            tenantId,
            userId,
            templateId: input.templateId ?? null,
            metadata: {
              isHtml: true,
              textBody: input.textBody,
              threadId: input.threadId,
            },
          },
        });

        // Create attachment records if provided
        if (input.attachments?.length) {
          await (ctx as any).prisma.emailAttachment.createMany({
            data: input.attachments.map((a) => ({
              emailId: record.id,
              tenantId,
              fileName: a.fileName,
              fileSize: a.fileSize,
              fileType: 'application/octet-stream',
              fileUrl: a.fileUrl,
            })),
          });
        }

        // Attempt to send via the outbound email service (SendGrid in production, mock in dev)
        let finalStatus: 'SENT' | 'FAILED' = 'SENT';
        try {
          const sendResult = await outboundEmailService.sendEmail({
            from: { email: fromEmail, type: 'to' },
            recipients: [
              ...input.to.map((email) => ({ email, type: 'to' as const })),
              ...(input.cc ?? []).map((email) => ({ email, type: 'cc' as const })),
              ...(input.bcc ?? []).map((email) => ({ email, type: 'bcc' as const })),
            ],
            subject: input.subject,
            htmlBody: input.htmlBody,
            textBody: input.textBody,
          });

          if (sendResult.status === 'failed') {
            finalStatus = 'FAILED';
            console.error('Email send failed', { recordId: record.id, error: sendResult.error });
          }
        } catch (error) {
          finalStatus = 'FAILED';
          console.error('Email send threw unexpectedly', { recordId: record.id, error });
        }

        // Update the persisted record with the final delivery status
        await (ctx as any).prisma.emailRecord.update({
          where: { id: record.id },
          data: {
            status: finalStatus,
            sentAt: finalStatus === 'SENT' ? new Date() : null,
          },
        });

        return { id: record.id, status: finalStatus };
      }
    ),

  /**
   * Save email draft
   * Persists draft to EmailRecord with isDraft metadata flag.
   */
  saveDraft: tenantProcedure
    .input(
      z.object({
        id: z.string().optional(),
        to: z.array(z.string().email()).optional(),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string().optional(),
        htmlBody: z.string().optional(),
        textBody: z.string().optional(),
        threadId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ id: string; status: 'DRAFT' }> => {
      const tenantId = (ctx as any).tenant.tenantId;
      const userId = (ctx as any).user.userId;

      if (input.id) {
        // Update existing draft
        const existing = await (ctx as any).prisma.emailRecord.findFirst({
          where: { id: input.id, tenantId },
        });
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft not found' });
        }

        await (ctx as any).prisma.emailRecord.update({
          where: { id: input.id },
          data: {
            subject: input.subject ?? existing.subject,
            body: input.htmlBody ?? existing.body,
            toEmail: input.to?.join(', ') ?? existing.toEmail,
            ccEmails: input.cc?.join(', ') ?? existing.ccEmails,
            bccEmails: input.bcc?.join(', ') ?? existing.bccEmails,
            metadata: {
              ...((existing.metadata as any) ?? {}),
              isDraft: true,
              isHtml: true,
              textBody: input.textBody,
              threadId: input.threadId,
            },
          },
        });

        return { id: input.id, status: 'DRAFT' };
      }

      // Create new draft
      const record = await (ctx as any).prisma.emailRecord.create({
        data: {
          subject: input.subject ?? '(No subject)',
          body: input.htmlBody ?? '',
          fromEmail: (ctx as any).user.email ?? 'noreply@intelliflow.com',
          toEmail: input.to?.join(', ') ?? '',
          ccEmails: input.cc?.join(', ') ?? null,
          bccEmails: input.bcc?.join(', ') ?? null,
          status: 'PENDING',
          tenantId,
          userId,
          metadata: {
            isDraft: true,
            isHtml: true,
            textBody: input.textBody,
            threadId: input.threadId,
          },
        },
      });

      return { id: record.id, status: 'DRAFT' };
    }),

  /**
   * List email templates from database
   */
  listTemplates: tenantProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<
        Array<{
          id: string;
          name: string;
          subject: string;
          body: string;
          category: string;
          variables: string[];
        }>
      > => {
        const tenantId = (ctx as any).tenant.tenantId;
        const where: any = { tenantId, isActive: true };

        if (input.category) where.category = input.category;
        if (input.search) {
          where.OR = [
            { name: { contains: input.search, mode: 'insensitive' } },
            { subject: { contains: input.search, mode: 'insensitive' } },
          ];
        }

        const templates = await (ctx as any).prisma.emailTemplate.findMany({
          where,
          orderBy: { name: 'asc' },
        });

        return templates.map((t: any) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body: t.body,
          category: t.category,
          variables: Array.isArray(t.variables) ? t.variables : [],
        }));
      }
    ),

  /**
   * Mark email(s) as read
   * Marks a single email or all emails in a thread as read
   */
  markAsRead: tenantProcedure
    .input(MarkAsReadInputSchema)
    .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
      const tenantId = (ctx as any).tenant.tenantId;
      const prisma = (ctx as any).prisma;
      const now = new Date();

      if (input.threadId) {
        // Mark all emails in thread as read via metadata threadId
        await prisma.emailRecord.updateMany({
          where: {
            tenantId,
            metadata: { path: ['threadId'], equals: input.threadId },
            isRead: false,
          },
          data: { isRead: true, readAt: now },
        });
      } else {
        await prisma.emailRecord.updateMany({
          where: { tenantId, id: input.emailId, isRead: false },
          data: { isRead: true, readAt: now },
        });
      }
      return { success: true };
    }),

  /**
   * Get unread counts per folder
   * Returns a map of folder name → unread count
   */
  getUnreadCounts: tenantProcedure
    .input(GetUnreadCountsInputSchema)
    .query(async ({ input, ctx }): Promise<Record<string, number>> => {
      const tenantId = (ctx as any).tenant.tenantId;
      const prisma = (ctx as any).prisma;
      const folders = input?.folders ?? ['inbox', 'sent', 'drafts', 'trash', 'spam'];

      const result: Record<string, number> = {};
      for (const folder of folders) result[folder] = 0;

      const countQueries = folders.map(async (folder) => {
        const where: any = { tenantId, isRead: false };
        const folderLower = folder.toLowerCase();
        if (folderLower === 'sent') {
          where.userId = (ctx as any).user?.userId;
          where.status = { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] };
        } else if (folderLower === 'drafts') {
          where.metadata = { path: ['isDraft'], equals: true };
        } else if (folderLower === 'spam') {
          where.metadata = { path: ['isSpam'], equals: true };
        } else if (folderLower === 'trash') {
          where.metadata = { path: ['isTrashed'], equals: true };
        }
        // inbox: no extra filter — all non-categorized unread emails
        return { folder, count: await prisma.emailRecord.count({ where }) };
      });

      const counts = await Promise.all(countQueries);
      for (const { folder, count } of counts) {
        result[folder] = count;
      }
      return result;
    }),

  /**
   * Search contacts for recipient autocomplete
   * Queries the Contact table by name or email
   */
  searchContacts: tenantProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().default(5),
      })
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<
        Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string;
        }>
      > => {
        if (!input.query || input.query.length < 2) return [];

        const contacts = await (ctx as any).prisma.contact.findMany({
          where: {
            OR: [
              { firstName: { contains: input.query, mode: 'insensitive' } },
              { lastName: { contains: input.query, mode: 'insensitive' } },
              { email: { contains: input.query, mode: 'insensitive' } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          take: input.limit,
          orderBy: { firstName: 'asc' },
        });

        return contacts;
      }
    ),
});

// ============================================================================
// Helper Functions
// ============================================================================

function reconstructSendGridEmail(input: z.infer<typeof InboundEmailWebhookSchema>): string {
  const lines: string[] = [];

  if (input.headers) {
    lines.push(input.headers);
  } else {
    if (input.from) lines.push(`From: ${input.from}`);
    if (input.to) lines.push(`To: ${input.to}`);
    if (input.subject) lines.push(`Subject: ${input.subject}`);
    if (input.dkim) lines.push(`DKIM-Signature: ${input.dkim}`);
    if (input.SPF) lines.push(`Received-SPF: ${input.SPF}`);
    lines.push(`Content-Type: text/plain; charset=utf-8`);
  }

  lines.push('');

  if (input.text) {
    lines.push(input.text);
  } else if (input.html) {
    lines.push(input.html);
  }

  return lines.join('\r\n');
}

/**
 * Resolve the tenant ID for an inbound email by matching the recipient domain
 * against the email domains of registered users.
 *
 * Strategy:
 *  1. Extract the domain portion from the first `to` recipient address.
 *  2. Query the User table for any user whose email ends with `@<domain>` and
 *     return their tenantId (the domain therefore identifies the tenant).
 *  3. Fall back to 'system' when no matching tenant is found (e.g. catch-all
 *     inbound addresses, forwarded test emails, or misconfigured webhooks).
 */
async function resolveTenantForInboundEmail(toAddresses: string[], prisma: any): Promise<string> {
  for (const address of toAddresses) {
    const atIndex = address.indexOf('@');
    if (atIndex === -1) continue;
    const domain = address
      .slice(atIndex + 1)
      .toLowerCase()
      .trim();
    if (!domain) continue;

    try {
      const user = await prisma.user.findFirst({
        where: { email: { endsWith: `@${domain}` } },
        select: { tenantId: true },
      });
      if (user?.tenantId) {
        return user.tenantId;
      }
    } catch {
      // Non-fatal — continue trying other addresses
    }
  }

  // No matching tenant found — route to the system/fallback bucket
  return 'system';
}

/**
 * Store parsed inbound email to the database.
 * Returns both the persisted record ID and the resolved tenantId so that
 * callers can propagate tenantId to related records (e.g. attachments).
 */
async function storeEmail(
  parsed: ParsedEmail,
  ctx: unknown
): Promise<{ emailId: string; tenantId: string }> {
  const prisma = (ctx as any).prisma;
  if (!prisma) {
    // Fallback for webhook (public procedure) — no tenant context
    console.warn('storeEmail: No Prisma client in context (webhook mode). Email not persisted.', {
      id: parsed.id,
      from: parsed.headers?.from?.address,
      subject: parsed.headers?.subject,
    });
    return { emailId: parsed.id, tenantId: 'system' };
  }

  // Resolve which tenant owns the recipient address domain
  const toAddresses = (parsed.headers?.to ?? []).map((r: any) => r.address as string);
  const tenantId = await resolveTenantForInboundEmail(toAddresses, prisma);

  try {
    const record = await prisma.emailRecord.create({
      data: {
        subject: parsed.headers?.subject ?? '(No subject)',
        body: parsed.body?.html ?? parsed.body?.text ?? '',
        fromEmail: parsed.headers?.from?.address ?? 'unknown@unknown.com',
        toEmail: toAddresses.join(', '),
        ccEmails: (parsed.headers?.cc ?? []).map((r: any) => r.address).join(', ') || null,
        status: 'DELIVERED',
        tenantId,
        metadata: {
          threadId: parsed.threadId,
          isReply: parsed.isReply,
          isForward: parsed.isForward,
          spamScore: parsed.spamScore,
          messageId: parsed.id,
          inReplyTo: parsed.headers?.inReplyTo,
          references: parsed.headers?.references,
          isHtml: !!parsed.body?.html,
        },
      },
    });
    return { emailId: record.id, tenantId };
  } catch (error) {
    console.error('Failed to store email in database', error);
    return { emailId: parsed.id, tenantId };
  }
}

/**
 * Store email attachments to the database
 */
async function processAttachments(
  emailId: string,
  tenantId: string,
  attachments: ParsedAttachment[],
  ctx: unknown
): Promise<void> {
  const prisma = (ctx as any).prisma;
  if (!prisma) {
    console.warn('processAttachments: No Prisma client. Attachments not persisted.');
    return;
  }

  try {
    await prisma.emailAttachment.createMany({
      data: attachments.map((attachment: any) => {
        // Use stored path/URL if available; otherwise construct a download path
        // so callers always receive a non-empty URL that resolves to this attachment.
        const storedUrl: string =
          attachment.storagePath ||
          attachment.fileUrl ||
          `/api/email/attachments/${encodeURIComponent(emailId)}/${encodeURIComponent(attachment.filename ?? 'unnamed')}`;

        return {
          emailId,
          tenantId,
          fileName: attachment.filename ?? 'unnamed',
          fileSize: attachment.size ?? 0,
          fileType: attachment.contentType ?? 'application/octet-stream',
          fileUrl: storedUrl,
        };
      }),
    });
  } catch (error) {
    console.error('Failed to store attachments', error);
  }
}

export type InboundEmailRouter = typeof inboundEmailRouter;
