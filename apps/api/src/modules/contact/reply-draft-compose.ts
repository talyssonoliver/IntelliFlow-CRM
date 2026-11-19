/**
 * MVP-012: a reply Aurora drafted, edited in Compose and sent from there, lands on its contact's or
 * lead's timeline like one sent with Send (codex).
 *
 * Edit turns the AI draft into an ordinary email draft of the user's whose metadata names it
 * (`replyDraftId`); that draft is not marked as logged, so an unsent one is never shown as sent.
 * Compose sends with `email.sendEmail` and names the draft it sends (`draftId`). After the send
 * went out, the AI draft it came from is found and the sent email is linked by the same path as
 * Send (linkSentReply: the restriction check, then "Log to contact"). Linking never fails the send.
 */
import type { SendUserEmailInput, SendUserEmailResultDto } from '@intelliflow/validators';
import type { EmailRouterCtx, EmailRuntimeDeps } from '../email/email-access';
import { dispatchUserMail } from '../email/mailbox-sender';
import { linkSentReply, loadDraft } from './reply-draft.router';

/** The AI draft a Compose draft of this user came from, if it came from one. */
async function replyDraftIdOf(c: EmailRouterCtx, composeDraftId: string): Promise<string | null> {
  const draft: { metadata: unknown } | null = await c.prismaWithTenant.emailRecord.findFirst({
    where: { id: composeDraftId, tenantId: c.tenant.tenantId, userId: c.tenant.userId },
    select: { metadata: true },
  });
  const id = (draft?.metadata as { replyDraftId?: unknown } | null)?.replyDraftId;
  return typeof id === 'string' && id ? id : null;
}

/** email.sendEmail: the send itself is unchanged; a sent reply drafted by Aurora is then linked. */
export async function sendComposedEmail(
  c: EmailRouterCtx,
  input: SendUserEmailInput,
  deps: EmailRuntimeDeps
): Promise<SendUserEmailResultDto> {
  const { draftId, ...message } = input;
  // Read before the send: Compose removes its draft once the send went out.
  const replyDraftId = draftId ? await replyDraftIdOf(c, draftId).catch(() => null) : null;
  const result = await dispatchUserMail(c as never, message, deps);
  if (result.status !== 'SENT' || !replyDraftId) return result;
  try {
    await linkSentReply(c, await loadDraft(c, replyDraftId), result.id, message.subject);
  } catch (error) {
    // The mail has gone: a draft no longer in the user's scope, or any failure here, only logs.
    console.warn('[reply-draft] composed reply not linked to its timeline', {
      replyDraftId,
      emailId: result.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  return result;
}
