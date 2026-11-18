'use client';

/**
 * MVP-012 (was IFC-312's read-only list): the replies Aurora drafted for a contact, for the user to
 * check. A waiting draft reads "Reply drafted by Aurora: waiting for you", shows its whole text,
 * and offers Send (from the user's connected mailbox, as Compose sends), Edit (opens it in
 * Compose as an ordinary email draft) and Dismiss. Nothing is sent without the Send click
 * (ADR-037): Aurora only ever writes drafts. Renders nothing when there is no draft to show.
 */
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@intelliflow/ui';
import { trpc } from '@intelliflow/api-client';
import { getEmailSendError } from '@/components/email/send-errors';

export const WAITING_TITLE = 'Reply drafted by Aurora: waiting for you';

const SETTLED: Record<string, string> = {
  SENDING: 'Sending…',
  SENT: 'Sent from your mailbox.',
  EDITED: 'Opened in Compose. Find it in your email drafts.',
};

export interface ReplyDraftsPanelProps {
  readonly contactId: string;
  readonly enabled: boolean;
}

interface Draft {
  id: string;
  draftSubject: string;
  draftBody: string;
  status: string;
}

function errorText(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

function DraftItem({ draft, onChanged }: Readonly<{ draft: Draft; onChanged: () => void }>) {
  const router = useRouter();
  const titleId = useId();
  const send = trpc.replyDraft.send.useMutation();
  const openInCompose = trpc.replyDraft.openInCompose.useMutation();
  const dismiss = trpc.replyDraft.dismiss.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = send.isPending || openInCompose.isPending || dismiss.isPending;
  const waiting = draft.status === 'DRAFT';

  const onSend = async () => {
    setError(null);
    try {
      const result = await send.mutateAsync({ draftId: draft.id });
      if (result.status === 'SENT') setNotice('Reply sent from your mailbox.');
      else setError(getEmailSendError(null).message);
    } catch (e) {
      const view = getEmailSendError(e);
      setError(view.code ? `${view.title}: ${view.message}` : errorText(e, view.message));
    }
    onChanged();
  };

  const onEdit = async () => {
    setError(null);
    try {
      const { emailDraftId } = await openInCompose.mutateAsync({ draftId: draft.id });
      router.push(`/email/compose?draftId=${encodeURIComponent(emailDraftId)}`);
    } catch (e) {
      setError(errorText(e, 'The draft could not be opened in Compose.'));
      onChanged();
    }
  };

  const onDismiss = async () => {
    setError(null);
    try {
      await dismiss.mutateAsync({ draftId: draft.id });
    } catch (e) {
      setError(errorText(e, 'The draft could not be dismissed.'));
    }
    onChanged();
  };

  return (
    <li
      aria-labelledby={titleId}
      className="rounded-lg border border-border bg-card p-4 text-sm"
      data-testid="reply-draft-item"
    >
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        {waiting ? WAITING_TITLE : 'Reply drafted by Aurora'}
      </p>
      <p id={titleId} className="mt-1 font-medium text-foreground">
        {draft.draftSubject}
      </p>
      {waiting && (
        <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-foreground">
          {draft.draftBody}
        </p>
      )}
      {!waiting && SETTLED[draft.status] && (
        <p className="mt-1 text-xs text-muted-foreground">{SETTLED[draft.status]}</p>
      )}
      {waiting && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void onSend()}>
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onEdit()}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void onDismiss()}
          >
            Dismiss
          </Button>
        </div>
      )}
      {notice && (
        <output className="mt-2 block text-xs text-foreground" data-testid="reply-draft-notice">
          {notice}
        </output>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </li>
  );
}

export function ReplyDraftsPanel({ contactId, enabled }: Readonly<ReplyDraftsPanelProps>) {
  const headingId = useId();
  const utils = trpc.useUtils();
  const query = trpc.contact.listReplyDrafts.useQuery({ contactId, limit: 5 }, { enabled });
  if (!enabled) return null;

  if (query.isLoading) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="reply-drafts-loading">
        Loading replies drafted by Aurora…
      </div>
    );
  }

  // Dismissed drafts are set aside: they are not shown again.
  const drafts = (query.data?.drafts ?? []).filter((d) => d.status !== 'DISMISSED');
  if (drafts.length === 0) return null;

  const refresh = () => {
    utils.contact.listReplyDrafts.invalidate({ contactId }).catch(() => undefined);
  };

  return (
    <section aria-labelledby={headingId} data-testid="reply-drafts-panel">
      <h3 id={headingId} className="mb-2 text-sm font-semibold">
        Replies drafted by Aurora
      </h3>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <DraftItem key={d.id} draft={d} onChanged={refresh} />
        ))}
      </ul>
    </section>
  );
}
