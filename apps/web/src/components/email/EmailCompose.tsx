'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Send,
  Save,
  X,
  Paperclip,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { RecipientPicker, type Recipient } from './RecipientPicker';
import { FormatToolbar } from './FormatToolbar';
import { AttachmentManager } from './AttachmentManager';
import { TemplateSelector } from './TemplateSelector';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

interface OriginalEmail {
  id: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
}

interface EmailComposeProps {
  mode: ComposeMode;
  originalEmail?: OriginalEmail;
  onDiscard: () => void;
  onSent?: () => void;
  className?: string;
}

function getDefaultSubject(mode: ComposeMode, originalSubject?: string): string {
  if (!originalSubject) return '';
  if (mode === 'reply' || mode === 'replyAll') {
    return originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
  }
  if (mode === 'forward') {
    return originalSubject.startsWith('Fwd:') ? originalSubject : `Fwd: ${originalSubject}`;
  }
  return '';
}

function getDefaultRecipients(
  mode: ComposeMode,
  originalEmail?: OriginalEmail
): { to: Recipient[]; cc: Recipient[] } {
  if (!originalEmail) return { to: [], cc: [] };

  const sender: Recipient = {
    name: originalEmail.from.name || originalEmail.from.address,
    email: originalEmail.from.address,
  };

  if (mode === 'reply') {
    return { to: [sender], cc: [] };
  }
  if (mode === 'replyAll') {
    const cc = originalEmail.to
      .filter((r) => r.address !== originalEmail.from.address)
      .map((r) => ({ name: r.name || r.address, email: r.address }));
    return { to: [sender], cc };
  }
  return { to: [], cc: [] };
}

export function EmailCompose({
  mode,
  originalEmail,
  onDiscard,
  onSent,
  className,
}: EmailComposeProps) {
  // Forward mode: set initial body with quoted content
  // Must be computed before useState so it can be used as the initial value
  const initialBody =
    mode === 'forward' && originalEmail?.htmlBody
      ? `<br><br><div style="border-left:2px solid #ccc;padding-left:8px;color:#666">
          <p><strong>Forwarded message:</strong></p>
          ${originalEmail.htmlBody}
        </div>`
      : '';

  const defaults = getDefaultRecipients(mode, originalEmail);

  const [toRecipients, setToRecipients] = useState<Recipient[]>(defaults.to);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>(defaults.cc);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(defaults.cc.length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(getDefaultSubject(mode, originalEmail?.subject));
  const [attachments, setAttachments] = useState<File[]>([]);
  const [activeFormats] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [bodyHtml, setBodyHtml] = useState(initialBody);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);

  const bodyRef = useRef<HTMLDivElement>(null);

  const sendMutation = trpc.email.sendEmail.useMutation();
  const draftMutation = trpc.email.saveDraft.useMutation();

  const getBodyHtml = useCallback((): string => {
    return bodyRef.current?.innerHTML || '';
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: string[] = [];
    if (toRecipients.length === 0) {
      newErrors.push('At least one recipient is required');
    }
    const body = getBodyHtml();
    if (!body || body === '<br>' || body.replace(/<[^>]*>/g, '').trim() === '') {
      newErrors.push('Message body is required');
    }
    setErrors(newErrors);
    return newErrors.length === 0;
  }, [toRecipients, getBodyHtml]);

  const handleSend = useCallback(async () => {
    if (!validate()) return;

    try {
      await sendMutation.mutateAsync({
        to: toRecipients.map((r) => r.email),
        cc: ccRecipients.length > 0 ? ccRecipients.map((r) => r.email) : undefined,
        bcc: bccRecipients.length > 0 ? bccRecipients.map((r) => r.email) : undefined,
        subject,
        htmlBody: getBodyHtml(),
        threadId: originalEmail?.id,
      });
      setStatusMessage('Email sent successfully');
      onSent?.();
    } catch {
      setStatusMessage('Failed to send email. Please try again.');
    }
  }, [
    validate, sendMutation, toRecipients, ccRecipients, bccRecipients, subject,
    getBodyHtml, originalEmail, onSent,
  ]);

  const handleSaveDraft = useCallback(async () => {
    try {
      const result = await draftMutation.mutateAsync({
        id: draftId,
        to: toRecipients.map((r) => r.email),
        subject,
        htmlBody: getBodyHtml(),
      });
      if (result?.id) setDraftId(result.id);
      setStatusMessage('Draft saved');
    } catch {
      setStatusMessage('Failed to save draft');
    }
  }, [draftMutation, draftId, toRecipients, subject, getBodyHtml]);

  const handleFormat = useCallback((command: string) => {
    document.execCommand(command, false);
    bodyRef.current?.focus();
  }, []);

  const handleTemplateSelect = useCallback(
    (template: { body: string; subject: string }) => {
      if (bodyRef.current) {
        bodyRef.current.innerHTML = template.body;
      }
      if (!subject) {
        setSubject(template.subject);
      }
    },
    [subject]
  );

  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); handleFormat('bold'); }
        if (e.key === 'i') { e.preventDefault(); handleFormat('italic'); }
        if (e.key === 'u') { e.preventDefault(); handleFormat('underline'); }
      }
    },
    [handleFormat]
  );

  const handleBodyInput = useCallback(() => {
    setBodyHtml(bodyRef.current?.innerHTML ?? '');
  }, []);

  // Auto-save draft after 2s debounce when body changes
  const debouncedBody = useDebounce(bodyHtml, 2000);

  useEffect(() => {
    if (!debouncedBody || debouncedBody === initialBody) return;
    const hasContent =
      toRecipients.length > 0 ||
      subject.trim().length > 0 ||
      debouncedBody.replace(/<[^>]*>/g, '').trim().length > 0;
    if (!hasContent) return;

    draftMutation.mutateAsync({
      id: draftId,
      to: toRecipients.map((r) => r.email),
      subject,
      htmlBody: debouncedBody,
    }).then((result) => {
      if (result?.id) setDraftId(result.id);
      setStatusMessage('Draft saved automatically');
    }).catch(() => {
      // Silent fail — auto-save should not interrupt the user
    });
  }, [debouncedBody]);

  // Discard: save draft if content present, then call onDiscard
  const handleDiscard = useCallback(async () => {
    const body = getBodyHtml();
    const hasContent =
      toRecipients.length > 0 ||
      subject.trim().length > 0 ||
      body.replace(/<[^>]*>/g, '').trim().length > 0;

    if (hasContent) {
      try {
        await draftMutation.mutateAsync({
          id: draftId,
          to: toRecipients.map((r) => r.email),
          subject,
          htmlBody: body,
        });
      } catch {
        // proceed regardless
      }
    }
    onDiscard();
  }, [toRecipients, subject, draftId, draftMutation, getBodyHtml, onDiscard]);

  return (
    <form
      aria-label="Compose email"
      className={cn('flex flex-col bg-card', className)}
      onSubmit={(e) => { e.preventDefault(); handleSend(); }}
    >
      {/* Recipients */}
      <div className="space-y-1 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs text-muted-foreground">To</span>
          <RecipientPicker
            label="To"
            value={toRecipients}
            onChange={setToRecipients}
            className="flex-1"
          />
          <div className="flex gap-1">
            {!showCc && (
              <button
                type="button"
                aria-label="CC"
                className="text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded px-1"
                onClick={() => setShowCc(true)}
              >
                CC
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                aria-label="BCC"
                className="text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded px-1"
                onClick={() => setShowBcc(true)}
              >
                BCC
              </button>
            )}
          </div>
        </div>

        {showCc && (
          <div className="flex items-center gap-2">
            <label htmlFor="cc-picker" className="w-8 text-xs text-muted-foreground">CC</label>
            <RecipientPicker
              label="CC"
              value={ccRecipients}
              onChange={setCcRecipients}
              className="flex-1"
            />
          </div>
        )}

        {showBcc && (
          <div className="flex items-center gap-2">
            <label htmlFor="bcc-picker" className="w-8 text-xs text-muted-foreground">BCC</label>
            <RecipientPicker
              label="BCC"
              value={bccRecipients}
              onChange={setBccRecipients}
              className="flex-1"
            />
          </div>
        )}
      </div>

      {/* Subject */}
      <div className="border-b border-border px-4 py-2">
        <label htmlFor="compose-subject" className="sr-only">Subject</label>
        <input
          id="compose-subject"
          type="text"
          aria-label="Subject"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* Format toolbar */}
      <FormatToolbar onFormat={handleFormat} activeFormats={activeFormats} />

      {/* Body */}
      <div className="flex-1 px-4 py-2">
        <label className="sr-only" htmlFor="compose-body">Message body</label>
        <div
          ref={bodyRef}
          id="compose-body"
          role="textbox"
          tabIndex={0}
          aria-label="Message body"
          contentEditable
          suppressContentEditableWarning
          className="min-h-[120px] text-sm focus:outline-none"
          onKeyDown={handleBodyKeyDown}
          onInput={handleBodyInput}
          dangerouslySetInnerHTML={initialBody ? { __html: initialBody } : undefined}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          <AttachmentManager files={attachments} onFilesChange={setAttachments} />
        </div>
      )}

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="px-4 py-1">
          {errors.map((err) => (
            <p key={err} className="text-xs text-destructive">{err}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            type="submit"
            aria-label="Send"
            disabled={sendMutation.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Send className="h-4 w-4" />
            Send
          </button>

          <button
            type="button"
            aria-label="Save draft"
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Save className="h-4 w-4" />
            Save Draft
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Attach file"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={() => {
              // Trigger attachment manager — add empty file picker logic
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) setAttachments((prev) => [...prev, ...Array.from(files)]);
              };
              input.click();
            }}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <TemplateSelector
            onSelect={handleTemplateSelect}
            currentBody={getBodyHtml()}
          />

          <button
            type="button"
            aria-label="Discard"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={handleDiscard}
          >
            <X className="h-4 w-4" />
            Discard
          </button>
        </div>
      </div>

      {/* Live region for status announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </div>
    </form>
  );
}
