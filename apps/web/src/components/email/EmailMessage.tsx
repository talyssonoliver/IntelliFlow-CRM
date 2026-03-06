'use client';

import { useId } from 'react';
import { ChevronDown, ChevronUp, Reply, ReplyAll, Forward, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface EmailMessageProps {
  message: EmailMessageData;
  isExpanded: boolean;
  onToggle: () => void;
  onReply: (messageId: string) => void;
  onReplyAll: (messageId: string) => void;
  onForward: (messageId: string) => void;
}

function getInitial(name?: string, address?: string): string {
  if (name) return name[0].toUpperCase();
  if (address) return address[0].toUpperCase();
  return '?';
}

export function EmailMessage({
  message,
  isExpanded,
  onToggle,
  onReply,
  onReplyAll,
  onForward,
}: EmailMessageProps) {
  const headingId = useId();
  const contentId = useId();

  return (
    <article className="rounded-lg border border-border">
      {/* Header — always visible */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={isExpanded ? 'Collapse message' : 'Expand message'}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-accent/50',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-t-lg',
          !isExpanded && 'rounded-b-lg'
        )}
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {getInitial(message.from.name, message.from.address)}
        </div>

        {/* Sender info */}
        <div className="flex-1 min-w-0">
          <span id={headingId} className="text-sm font-medium">
            {message.from.name || message.from.address}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            to {message.to.map((t) => t.name || t.address).join(', ')}
          </span>
        </div>

        {/* Timestamp */}
        <time dateTime={message.receivedAt} className="shrink-0 text-xs text-muted-foreground">
          {new Date(message.receivedAt).toLocaleString()}
        </time>

        {/* Expand icon */}
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Content — only when expanded */}
      {isExpanded && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="border-t border-border"
        >
          {/* Body */}
          <div className="px-4 py-3">
            {message.htmlBody ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: message.htmlBody }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm">{message.textBody}</pre>
            )}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                <span>{message.attachments.length} attachment(s)</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <span
                    key={att.checksum}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3" />
                    {att.filename}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1 border-t border-border px-4 py-2">
            <button
              type="button"
              aria-label="Reply"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => onReply(message.id)}
            >
              <Reply className="h-3.5 w-3.5" />
              Reply
            </button>
            <button
              type="button"
              aria-label="Reply all"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => onReplyAll(message.id)}
            >
              <ReplyAll className="h-3.5 w-3.5" />
              Reply All
            </button>
            <button
              type="button"
              aria-label="Forward"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => onForward(message.id)}
            >
              <Forward className="h-3.5 w-3.5" />
              Forward
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
