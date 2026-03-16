'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Save, X, Paperclip } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
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
  /** Pre-filled recipients for new compose (e.g. from hover card "Email" action) */
  initialTo?: Recipient[];
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

/** Tracked formatting commands for active state detection */
const TRACKED_COMMANDS = [
  'bold',
  'italic',
  'underline',
  'insertOrderedList',
  'insertUnorderedList',
] as const;

export function EmailCompose({
  mode,
  originalEmail,
  initialTo,
  onDiscard,
  onSent,
  className,
}: Readonly<EmailComposeProps>) {
  // Forward mode: set initial body with quoted content
  const initialBody =
    mode === 'forward' && originalEmail?.htmlBody
      ? `<br><br><div style="border-left:2px solid #ccc;padding-left:8px;color:#666">
          <p><strong>Forwarded message:</strong></p>
          ${DOMPurify.sanitize(originalEmail.htmlBody)}
        </div>`
      : '';

  const defaults = getDefaultRecipients(mode, originalEmail);

  const [toRecipients, setToRecipients] = useState<Recipient[]>(initialTo && initialTo.length > 0 ? initialTo : defaults.to);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>(defaults.cc);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(defaults.cc.length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(getDefaultSubject(mode, originalEmail?.subject));
  const [attachments, setAttachments] = useState<File[]>([]);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [bodyHtml, setBodyHtml] = useState(initialBody);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);

  const bodyRef = useRef<HTMLDivElement>(null);
  /** Saved selection range for restoring after toolbar interactions */
  const savedSelectionRef = useRef<Range | null>(null);

  const sendMutation = trpc.email.sendEmail.useMutation();
  const draftMutation = trpc.email.saveDraft.useMutation();

  // Track active formatting state on selection changes
  useEffect(() => {
    const updateFormats = () => {
      // Only update if focus is within the editor
      const sel = window.getSelection();
      if (!sel || !bodyRef.current?.contains(sel.anchorNode)) return;

      const formats: string[] = [];
      try {
        for (const cmd of TRACKED_COMMANDS) {
          if (document.queryCommandState(cmd)) {
            formats.push(cmd);
          }
        }
      } catch {
        /* queryCommandState can throw in edge cases */
      }
      setActiveFormats(formats);
    };

    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, []);

  /** Save the current selection so it can be restored after losing focus */
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && bodyRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  /** Restore a previously saved selection */
  const restoreSelection = useCallback(() => {
    const range = savedSelectionRef.current;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const getBodyHtml = useCallback((): string => {
    return bodyRef.current?.innerHTML || '';
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: string[] = [];
    if (toRecipients.length === 0) {
      newErrors.push('At least one recipient is required');
    }
    const body = getBodyHtml();
    if (!body || body === '<br>' || body.replaceAll(/<[^<>]*>/g, '').trim() === '') {
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
    validate,
    sendMutation,
    toRecipients,
    ccRecipients,
    bccRecipients,
    subject,
    getBodyHtml,
    originalEmail,
    onSent,
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

  /**
   * Execute a formatting command on the editor.
   * For createLink, a URL value must be provided.
   * The toolbar buttons use onMouseDown={preventDefault} to keep the
   * editor selection alive, so we can just execCommand directly.
   */
  const handleFormat = useCallback((command: string, value?: string) => {
    // Restore selection in case it was lost
    restoreSelection();
    bodyRef.current?.focus();

    if (command === 'createLink' && value) {
      document.execCommand('createLink', false, value);
    } else if (command === 'createLink') {
      // No URL provided — ignore
      return;
    } else {
      document.execCommand(command, false); // NOSONAR typescript:S1874
    }

    // Update active formats immediately after command
    const formats: string[] = [];
    try {
      for (const cmd of TRACKED_COMMANDS) {
        if (document.queryCommandState(cmd)) {
          formats.push(cmd);
        }
      }
    } catch {
      /* ignore */
    }
    setActiveFormats(formats);
  }, [restoreSelection]);

  const contactLookup = trpc.email.searchContacts.useQuery(
    { query: toRecipients[0]?.email ?? '', limit: 1 },
    { enabled: toRecipients.length > 0 && (toRecipients[0]?.email?.length ?? 0) >= 2 }
  );

  const resolveVariables = useCallback(
    (text: string): string => {
      const contact = (contactLookup.data as Array<{ firstName: string; lastName: string; email: string; company: string | null }> | undefined)?.[0];
      if (!contact) {
        // Fall back to recipient info if no contact found
        const r = toRecipients[0];
        if (!r) return text;
        return text
          .replaceAll('{{name}}', r.name || r.email)
          .replaceAll('{{email}}', r.email)
          .replaceAll('{{contact.name}}', r.name || r.email)
          .replaceAll('{{contact.email}}', r.email);
      }
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const replacements: Record<string, string> = {
        '{{firstName}}': contact.firstName,
        '{{lastName}}': contact.lastName,
        '{{name}}': fullName,
        '{{email}}': contact.email,
        '{{company}}': contact.company || '',
        '{{contact.name}}': fullName,
        '{{contact.firstName}}': contact.firstName,
        '{{contact.lastName}}': contact.lastName,
        '{{contact.email}}': contact.email,
        '{{contact.company}}': contact.company || '',
      };
      let result = text;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(key, value);
      }
      return result;
    },
    [contactLookup.data, toRecipients]
  );

  const handleTemplateSelect = useCallback(
    (template: { body: string; subject: string }) => {
      if (bodyRef.current) {
        bodyRef.current.innerHTML = DOMPurify.sanitize(resolveVariables(template.body));
      }
      if (!subject) {
        setSubject(resolveVariables(template.subject));
      }
    },
    [subject, resolveVariables]
  );

  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault();
          handleFormat('bold');
        }
        if (e.key === 'i') {
          e.preventDefault();
          handleFormat('italic');
        }
        if (e.key === 'u') {
          e.preventDefault();
          handleFormat('underline');
        }
      }
    },
    [handleFormat]
  );

  const handleBodyInput = useCallback(() => {
    setBodyHtml(bodyRef.current?.innerHTML ?? '');
  }, []);

  // Save selection on mouseup/keyup in the editor for toolbar interactions
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.addEventListener('mouseup', saveSelection);
    el.addEventListener('keyup', saveSelection);
    return () => {
      el.removeEventListener('mouseup', saveSelection);
      el.removeEventListener('keyup', saveSelection);
    };
  }, [saveSelection]);

  // Auto-save draft after 2s debounce when body changes
  const debouncedBody = useDebounce(bodyHtml, 2000);

  useEffect(() => {
    if (!debouncedBody || debouncedBody === initialBody) return;
    const hasContent =
      toRecipients.length > 0 ||
      subject.trim().length > 0 ||
      debouncedBody.replaceAll(/<[^<>]*>/g, '').trim().length > 0;
    if (!hasContent) return;

    draftMutation
      .mutateAsync({
        id: draftId,
        to: toRecipients.map((r) => r.email),
        subject,
        htmlBody: debouncedBody,
      })
      .then((result) => {
        if (result?.id) setDraftId(result.id);
        setStatusMessage('Draft saved automatically');
      })
      .catch(() => {
        // Silent fail — auto-save should not interrupt the user
      });
  }, [debouncedBody]);

  // Discard: save draft if content present, then call onDiscard
  const handleDiscard = useCallback(async () => {
    const body = getBodyHtml();
    const hasContent =
      toRecipients.length > 0 ||
      subject.trim().length > 0 ||
      body.replaceAll(/<[^<>]*>/g, '').trim().length > 0;

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
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
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
            <label htmlFor="cc-picker" className="w-8 text-xs text-muted-foreground">
              CC
            </label>
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
            <label htmlFor="bcc-picker" className="w-8 text-xs text-muted-foreground">
              BCC
            </label>
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
        <label htmlFor="compose-subject" className="sr-only">
          Subject
        </label>
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
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <label className="sr-only" htmlFor="compose-body">
          Message body
        </label>
        <div // NOSONAR — contentEditable rich-text editor; role="textbox" is the correct ARIA pattern
          ref={bodyRef}
          id="compose-body"
          role="textbox"
          tabIndex={0}
          aria-label="Message body"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className="min-h-[120px] text-sm focus:outline-none prose prose-sm max-w-none"
          onKeyDown={handleBodyKeyDown}
          onInput={handleBodyInput}
          dangerouslySetInnerHTML={initialBody ? { __html: initialBody } : undefined}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 ? (
        <div className="border-t border-border px-4 py-2">
          <AttachmentManager files={attachments} onFilesChange={setAttachments} />
        </div>
      ) : null}

      {/* Error messages */}
      {errors.length > 0 ? (
        <div className="px-4 py-1">
          {errors.map((err) => (
            <p key={err} className="text-xs text-destructive">
              {err}
            </p>
          ))}
        </div>
      ) : null}

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

          <TemplateSelector onSelect={handleTemplateSelect} currentBody={getBodyHtml()} />

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
