'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { EmptyState } from '@intelliflow/ui';
import { cn } from '@/lib/utils';
import { EMAIL_LABELS } from '@/components/sidebar/configs/EmailSidebarContent';
import { EmailMessage } from './EmailMessage';
import { InlineCompose } from './InlineCompose';

interface EmailMessageData {
  id: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
  receivedAt: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    checksum: string;
  }>;
}

interface ThreadData {
  threadId: string;
  subject: string;
  emails: EmailMessageData[];
  participantCount: number;
}

interface InlineComposeState {
  mode: 'reply' | 'replyAll' | 'forward';
  messageId: string;
}

interface EmailThreadProps {
  thread: ThreadData | null;
  isLoading?: boolean;
  labels?: string[];
  onLabelsChange?: (labels: string[]) => void;
  onReply: (messageId: string) => void;
  onReplyAll: (messageId: string) => void;
  onForward: (messageId: string) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMarkUnread?: () => void;
  onInlineSent?: () => void;
  className?: string;
}

export function EmailThread({
  thread,
  isLoading,
  labels = [],
  onLabelsChange,
  onReply: _onReply,
  onReplyAll: _onReplyAll,
  onForward: _onForward,
  onArchive,
  onDelete,
  onMarkUnread,
  onInlineSent,
  className,
}: Readonly<EmailThreadProps>) {
  // Track which messages are expanded. Last message is expanded by default.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [inlineCompose, setInlineCompose] = useState<InlineComposeState | null>(null);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const toggleLabel = useCallback(
    (labelId: string) => {
      if (!onLabelsChange) return;
      const next = labels.includes(labelId)
        ? labels.filter((l) => l !== labelId)
        : [...labels, labelId];
      onLabelsChange(next);
    },
    [labels, onLabelsChange]
  );

  // Sync expandedIds when thread changes — auto-expand last message.
  // Intentionally scoped to threadId, not thread.emails, so new messages
  // arriving in the same thread do not clobber the user's expand/collapse
  // state. Thread is read from a ref to get the current list without making
  // emails a dep.
  const threadRef = useRef(thread);
  threadRef.current = thread;
  useEffect(() => {
    const current = threadRef.current;
    if (current?.emails.length) {
      const lastId = current.emails.at(-1)!.id;
      setExpandedIds(new Set([lastId]));
    } else {
      setExpandedIds(new Set());
    }
    setInlineCompose(null);
  }, [thread?.threadId]);

  const handleInlineReply = useCallback((messageId: string) => {
    setInlineCompose({ mode: 'reply', messageId });
  }, []);

  const handleInlineReplyAll = useCallback((messageId: string) => {
    setInlineCompose({ mode: 'replyAll', messageId });
  }, []);

  const handleInlineForward = useCallback((messageId: string) => {
    setInlineCompose({ mode: 'forward', messageId });
  }, []);

  const handleInlineSent = useCallback(() => {
    setInlineCompose(null);
    onInlineSent?.();
  }, [onInlineSent]);

  const handleInlineDiscard = useCallback(() => {
    setInlineCompose(null);
  }, []);

  const toggleMessage = useCallback((messageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  // Loading state
  if (isLoading && !thread) {
    return (
      <div className={cn('flex flex-1 flex-col overflow-hidden', className)}>
        <div className="border-b border-border px-4 py-3">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="space-y-1.5 pt-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!thread) {
    return (
      <EmptyState
        entity="emails"
        variant="selection"
        phase="passive"
        className={cn('flex-1', className)}
      />
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden', className)}>
      {/* Thread header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-semibold truncate">{thread.subject}</h2>
          {labels.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {labels.map((labelId) => {
                const labelDef = EMAIL_LABELS.find((l) => l.id === labelId);
                if (!labelDef) return null;
                return (
                  <span
                    key={labelId}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${labelDef.color}20`,
                      color: labelDef.color,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: labelDef.color }}
                    />
                    {labelDef.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              aria-label="Labels"
              aria-expanded={showLabelPicker}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                showLabelPicker && 'bg-accent'
              )}
              onClick={() => setShowLabelPicker((prev) => !prev)}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                label
              </span>
            </button>
            {showLabelPicker && (
              <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-md">
                {EMAIL_LABELS.map((label) => {
                  const isActive = labels.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                        isActive && 'bg-accent/50 font-medium'
                      )}
                      onClick={() => toggleLabel(label.id)}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 text-left">{label.name}</span>
                      {isActive && <span className="text-xs text-primary">&#10003;</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Archive"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onArchive}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              archive
            </span>
          </button>
          <button
            type="button"
            aria-label="Delete"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onDelete}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              delete
            </span>
          </button>
          <button
            type="button"
            aria-label="Mark as unread"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onMarkUnread}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              mark_email_unread
            </span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-auto p-4">
        {thread.emails.map((message) => (
          <div key={message.id}>
            <EmailMessage
              message={message}
              isExpanded={expandedIds.has(message.id)}
              onToggle={() => toggleMessage(message.id)}
              onReply={handleInlineReply}
              onReplyAll={handleInlineReplyAll}
              onForward={handleInlineForward}
            />
            {inlineCompose?.messageId === message.id && (
              <InlineCompose
                mode={inlineCompose.mode}
                originalMessage={{
                  id: message.id,
                  subject: thread.subject,
                  htmlBody: message.htmlBody,
                  textBody: message.textBody,
                  from: message.from,
                  to: message.to,
                }}
                onSent={handleInlineSent}
                onDiscard={handleInlineDiscard}
                className="mt-2"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
