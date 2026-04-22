'use client';

/**
 * IFC-312 — Lists the latest AI-drafted reply emails for a contact.
 * Displays up to 5 drafts with provenance + status. Drafts are always DRAFT;
 * Send/Edit/Dismiss actions live here but this v1 surface only renders rows
 * (send/edit/dismiss wiring is deferred to a real inbox integration task).
 * Empty state uses canonical `<EmptyState entity='emails' />`.
 */

import { EmptyState } from '@intelliflow/ui';
import { trpc } from '@intelliflow/api-client';

export interface ReplyDraftsPanelProps {
  readonly contactId: string;
  readonly enabled: boolean;
}

export function ReplyDraftsPanel({ contactId, enabled }: Readonly<ReplyDraftsPanelProps>) {
  const query = trpc.contact.listReplyDrafts.useQuery(
    { contactId, limit: 5 },
    { enabled }
  );

  if (!enabled) return null;

  if (query.isLoading) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="reply-drafts-loading">
        Loading AI draft replies…
      </div>
    );
  }

  const drafts = query.data?.drafts ?? [];
  if (drafts.length === 0) {
    return <EmptyState entity="emails" />;
  }

  return (
    <ul className="space-y-3" data-testid="reply-drafts-panel">
      {drafts.map((d) => (
        <li
          key={d.id}
          className="rounded-lg border border-border bg-card p-3 text-sm"
          data-testid="reply-draft-item"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{d.draftSubject}</span>
            <span
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
              title="Draft — not sent"
            >
              {d.status}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{d.draftBody}</p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            {d.tone && <span>tone: {d.tone}</span>}
            <span>confidence: {Math.round(d.confidence * 100)}%</span>
            <span>model: {d.modelVersion}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
