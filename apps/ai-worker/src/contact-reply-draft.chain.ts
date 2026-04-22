/**
 * IFC-312 — Contact reply-draft chain.
 *
 * Generates an email reply draft from a thread. NEVER persists to Prisma —
 * the job handler at `jobs/reply-draft.job.ts` owns persistence and hard-codes
 * `status: 'DRAFT'` (ADR-037 review-before-send). This chain returns a payload
 * only. On LLM failure, returns a fallback draft flagged `requiresReview: true`.
 */

import { z } from 'zod';
import pino from 'pino';
import { createLLMForTenant } from './lib/llm-factory.js';
import { sanitizeStringField } from './utils/input-sanitizer.js';

const logger = pino({
  name: 'contact-reply-draft.chain',
  level: process.env['LOG_LEVEL'] ?? 'info',
});

const ToneSchema = z.enum(['formal', 'friendly', 'direct']);

const DraftLLMSchema = z.object({
  draftSubject: z.string(),
  draftBody: z.string(),
  tone: ToneSchema,
  confidence: z.number(),
  modelVersion: z.string().optional(),
});

const DEFAULT_MODEL_VERSION = 'contact-reply-draft-v1';

export interface EmailThreadEntry {
  from: string;
  to?: string;
  subject?: string;
  body: string;
  at: string;
}

export interface DraftContactReplyInput {
  contactId: string;
  tenantId: string;
  emailThread: EmailThreadEntry[];
  userInstructions?: string;
}

export interface ReplyDraftPayload {
  draftSubject: string;
  draftBody: string;
  tone: 'formal' | 'friendly' | 'direct';
  confidence: number;
  modelVersion: string;
  source: 'llm' | 'fallback';
  requiresReview: boolean;
}

export type DraftContactReplyResult =
  | { success: true; draft: ReplyDraftPayload }
  | { success: false; reason: string };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function sanitizeThread(thread: EmailThreadEntry[]): EmailThreadEntry[] {
  return thread.map((entry) => {
    const out: EmailThreadEntry = {
      from: sanitizeStringField(entry.from),
      body: sanitizeStringField(entry.body),
      at: entry.at,
    };
    if (entry.to) out.to = sanitizeStringField(entry.to);
    if (entry.subject) out.subject = sanitizeStringField(entry.subject);
    return out;
  });
}

function buildFallback(thread: EmailThreadEntry[]): ReplyDraftPayload {
  const last = thread[thread.length - 1];
  const subject = last?.subject
    ? `Re: ${last.subject.replace(/^re:\s*/i, '')}`
    : 'Following up';
  return {
    draftSubject: subject,
    draftBody:
      'Thanks for reaching out. I wanted to acknowledge your message and will follow up with specifics shortly.',
    tone: 'friendly',
    confidence: 0,
    modelVersion: DEFAULT_MODEL_VERSION,
    source: 'fallback',
    requiresReview: true,
  };
}

export async function draftContactReply(
  input: DraftContactReplyInput
): Promise<DraftContactReplyResult> {
  const { tenantId, emailThread, userInstructions } = input;

  if (!emailThread || emailThread.length === 0) {
    return { success: false, reason: 'no-thread-context' };
  }

  const sanitized = sanitizeThread(emailThread);
  const instructions = userInstructions ? sanitizeStringField(userInstructions) : undefined;

  try {
    const model = await createLLMForTenant('email', 'standard', { tenantId });
    const structured = model.withStructuredOutput(DraftLLMSchema);
    const raw = await structured.invoke(
      [
        {
          role: 'system',
          content:
            'You draft an email reply to a CRM contact. Return: draftSubject, draftBody, ' +
            'tone (formal|friendly|direct), confidence (0-1). ' +
            'Drafts are reviewed by humans before sending — never imply auto-send. ' +
            (instructions ? `User instructions: ${instructions}` : ''),
        },
        {
          role: 'user',
          content: `Email thread (oldest-first): ${JSON.stringify(sanitized)}. Draft the reply.`,
        },
      ] as unknown as Parameters<typeof structured.invoke>[0]
    );

    const parsed = DraftLLMSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ err: parsed.error }, 'reply-draft output failed Zod validation');
      return { success: true, draft: buildFallback(sanitized) };
    }

    const confidence = clamp01(parsed.data.confidence);
    return {
      success: true,
      draft: {
        draftSubject: parsed.data.draftSubject,
        draftBody: parsed.data.draftBody,
        tone: parsed.data.tone,
        confidence,
        modelVersion: parsed.data.modelVersion ?? DEFAULT_MODEL_VERSION,
        source: 'llm',
        requiresReview: confidence < 0.6,
      },
    };
  } catch (err) {
    logger.warn({ err, tenantId }, 'reply-draft LLM call failed');
    return { success: true, draft: buildFallback(sanitized) };
  }
}
