'use client';

import { useState, useCallback } from 'react';
import { Archive, Trash2, MailOpen, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmailMessage } from './EmailMessage';

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

interface EmailThreadProps {
  thread: ThreadData | null;
  isLoading?: boolean;
  onReply: (messageId: string) => void;
  onReplyAll: (messageId: string) => void;
  onForward: (messageId: string) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMarkUnread?: () => void;
  className?: string;
}

export function EmailThread({
  thread,
  isLoading: _isLoading,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onMarkUnread,
  className,
}: EmailThreadProps) {
  // Track which messages are expanded. By default, last message is expanded.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (!thread?.emails.length) return new Set();
    const lastId = thread.emails[thread.emails.length - 1].id;
    return new Set([lastId]);
  });

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

  // Empty state
  if (!thread) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground',
          className
        )}
      >
        <Inbox className="h-12 w-12 opacity-30" />
        <p className="text-sm">No email selected</p>
        <p className="text-xs">Select an email from the list to view its thread</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden', className)}>
      {/* Thread header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold truncate">{thread.subject}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Archive"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onArchive}
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Mark as unread"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={onMarkUnread}
          >
            <MailOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-auto p-4">
        {thread.emails.map((message) => (
          <EmailMessage
            key={message.id}
            message={message}
            isExpanded={expandedIds.has(message.id)}
            onToggle={() => toggleMessage(message.id)}
            onReply={onReply}
            onReplyAll={onReplyAll}
            onForward={onForward}
          />
        ))}
      </div>
    </div>
  );
}
