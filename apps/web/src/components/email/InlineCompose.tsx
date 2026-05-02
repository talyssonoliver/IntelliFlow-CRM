'use client';

import { useState, useRef, useCallback, useMemo } from 'react';

import DOMPurify from 'isomorphic-dompurify';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import { cn } from '@/lib/utils';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InlineMode = 'reply' | 'replyAll' | 'forward';

interface InlineComposeProps {
  mode: InlineMode;
  originalMessage: {
    id: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    from: { address: string; name?: string };
    to: Array<{ address: string; name?: string }>;
  };
  onSent: () => void;
  onDiscard: () => void;
  className?: string;
}

function getSubject(mode: InlineMode, original: string): string {
  if (mode === 'forward') {
    return original.startsWith('Fwd:') ? original : `Fwd: ${original}`;
  }
  return original.startsWith('Re:') ? original : `Re: ${original}`;
}

function getRecipients(
  mode: InlineMode,
  from: { address: string; name?: string },
  to: Array<{ address: string; name?: string }>
): { to: string[]; cc: string[] } {
  if (mode === 'reply') {
    return { to: [from.address], cc: [] };
  }
  if (mode === 'replyAll') {
    const cc = to.filter((r) => r.address !== from.address).map((r) => r.address);
    return { to: [from.address], cc };
  }
  // forward — user must add recipients
  return { to: [], cc: [] };
}

export function InlineCompose({
  mode,
  originalMessage,
  onSent,
  onDiscard,
  className,
}: Readonly<InlineComposeProps>) {
  const recipients = getRecipients(mode, originalMessage.from, originalMessage.to);
  const [forwardTo, setForwardTo] = useState('');
  const [hasBody, setHasBody] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sendMutation = trpc.email.sendEmail.useMutation();

  const quotedBody =
    mode === 'forward' && originalMessage.htmlBody
      ? `<br><div style="border-left:2px solid #ccc;padding-left:8px;color:#666"><p><strong>Forwarded message:</strong></p>${DOMPurify.sanitize(originalMessage.htmlBody)}</div>`
      : '';

  // Track body content changes from contentEditable
  const handleBodyInput = useCallback(() => {
    const html = bodyRef.current?.innerHTML ?? '';
    const text = html.replace(/<[^>]*>/g, '').trim();
    setHasBody(text.length > 0);
  }, []);

  // Validation state
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (mode === 'forward') {
      const trimmed = forwardTo.trim();
      if (!trimmed) {
        errors.push('Recipient email is required');
      } else if (!EMAIL_REGEX.test(trimmed)) {
        errors.push('Enter a valid email address');
      }
    }
    if (!hasBody) {
      errors.push('Message body is required');
    }
    return errors;
  }, [mode, forwardTo, hasBody]);

  const canSend = validationErrors.length === 0 && !sendMutation.isPending;

  const handleSend = useCallback(async () => {
    // Re-check body from DOM in case state is stale
    const body = bodyRef.current?.innerHTML ?? '';
    const plainText = body.replace(/<[^>]*>/g, '').trim();
    if (!plainText) {
      toast({ title: 'Message body is required', variant: 'destructive' });
      return;
    }

    const to = mode === 'forward' ? [forwardTo.trim()] : recipients.to;
    if (to.length === 0 || !to[0]) {
      toast({ title: 'At least one recipient is required', variant: 'destructive' });
      return;
    }

    if (mode === 'forward' && !EMAIL_REGEX.test(to[0])) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }

    try {
      await sendMutation.mutateAsync({
        to,
        cc: recipients.cc.length > 0 ? recipients.cc : undefined,
        subject: getSubject(mode, originalMessage.subject),
        htmlBody: body,
        threadId: originalMessage.id,
      });
      toast({ title: mode === 'forward' ? 'Email forwarded' : 'Reply sent' });
      onSent();
    } catch {
      toast({ title: 'Failed to send', variant: 'destructive' });
    }
  }, [mode, forwardTo, recipients, originalMessage, sendMutation, onSent]);

  let modeLabel: string;
  if (mode === 'replyAll') modeLabel = 'Reply All';
  else if (mode === 'forward') modeLabel = 'Forward';
  else modeLabel = 'Reply';

  return (
    <div className={cn('rounded-lg border border-primary/30 bg-card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{modeLabel}</span>
        <button
          type="button"
          aria-label="Discard"
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          onClick={onDiscard}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            close
          </span>
        </button>
      </div>

      {/* Recipients */}
      <div className="border-b border-border px-3 py-1.5">
        {mode === 'forward' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <input
              type="email"
              aria-label="Forward to"
              placeholder="recipient@example.com"
              value={forwardTo}
              onChange={(e) => setForwardTo(e.target.value)}
              className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            To: {recipients.to.join(', ')}
            {recipients.cc.length > 0 && ` | CC: ${recipients.cc.join(', ')}`}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {}
        <div
          ref={bodyRef}
          tabIndex={0}
          aria-label="Reply body"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={handleBodyInput}
          className="min-h-[80px] max-h-[200px] overflow-y-auto text-sm focus:outline-none prose prose-sm max-w-none"
          dangerouslySetInnerHTML={quotedBody ? { __html: quotedBody } : undefined}
        />
      </div>

      {/* Validation hints */}
      {validationErrors.length > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive"
          role="alert"
        >
          <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
            error
          </span>
          <span>{validationErrors[0]}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          aria-label={`Send ${modeLabel.toLowerCase()}`}
          disabled={!canSend}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground',
            'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          onClick={handleSend}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            send
          </span>{' '}
          Send
        </button>
        <button
          type="button"
          aria-label="Discard reply"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
