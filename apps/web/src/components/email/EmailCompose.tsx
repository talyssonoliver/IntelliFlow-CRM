'use client';

import { useState, useCallback, useRef, useEffect, type ComponentPropsWithRef } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { toast } from '@intelliflow/ui';
import { MAX_EMAIL_ATTACHMENT_BYTES, type EmailAttachmentRef } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { RecipientPicker, type Recipient } from './RecipientPicker';
import { FormatToolbar } from './FormatToolbar';
import { AttachmentManager } from './AttachmentManager';
import { TemplateSelector } from './TemplateSelector';
import { getEmailSendError, partialSendNotice, type EmailSendErrorView } from './send-errors';
import { SendErrorAlert } from './SendErrorAlert';
import { ComposeFrom } from './ComposeFrom';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

interface OriginalEmail {
  id: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
}

/** A saved draft to carry on writing. */
export interface ComposeDraft {
  id: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
  threadId?: string;
}

interface EmailComposeProps {
  mode: ComposeMode;
  originalEmail?: OriginalEmail;
  /** Pre-filled recipients for new compose (e.g. from hover card "Email" action) */
  initialTo?: Recipient[];
  /**
   * PG-207 (owner ruling Q5): the default signature a new message starts with.
   * Sanitised again here; it is part of the body from the first render, so
   * nothing is injected after mount and the server appends nothing.
   */
  initialSignatureHtml?: string;
  /** Opens a saved draft instead of starting a new message. */
  initialDraft?: ComposeDraft;
  /** Told when the draft first gets an id, so the page can come back to it. */
  onDraftSaved?: (draftId: string) => void;
  /** Follows a link out of Compose once the draft is saved. Defaults to a page load. */
  onLeave?: (href: string) => void;
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
// A contentEditable rich-text editor cannot be an <input>/<textarea>, so it follows the ARIA
// textbox pattern on a plain div; the role is spread so the tag-over-role lint (which targets
// native-tag-replaceable roles) does not demand a native element here.
const TEXTBOX_ARIA = { role: 'textbox', 'aria-multiline': true } as const;

function RichTextBody(props: ComponentPropsWithRef<'div'>) {
  return <div {...TEXTBOX_ARIA} {...props} />;
}

const MAX_ATTACHMENT_MB = MAX_EMAIL_ATTACHMENT_BYTES / (1024 * 1024);

/** The file as base64 (the upload payload), without the data-URL prefix. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

const asRecipient = (email: string): Recipient => ({ name: email, email });
const emailsOf = (recipients: readonly Recipient[]) => recipients.map((r) => r.email);
const hasText = (html: string) => html.replaceAll(/<[^<>]*>/g, '').trim().length > 0;

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
  initialSignatureHtml,
  initialDraft,
  onDraftSaved,
  onLeave,
  onDiscard,
  onSent,
  className,
}: Readonly<EmailComposeProps>) {
  const signatureHtml = initialSignatureHtml ? DOMPurify.sanitize(initialSignatureHtml) : '';
  // Forward mode: set initial body with quoted content; a new message starts
  // with the signature below an empty first line.
  let initialBody = '';
  if (initialDraft) {
    initialBody = DOMPurify.sanitize(initialDraft.htmlBody);
  } else if (mode === 'forward' && originalEmail?.htmlBody) {
    initialBody = `<br><br><div style="border-left:2px solid #ccc;padding-left:8px;color:#666">
          <p><strong>Forwarded message:</strong></p>
          ${DOMPurify.sanitize(originalEmail.htmlBody)}
        </div>`;
  } else if (signatureHtml) {
    initialBody = `<br><br>${signatureHtml}`;
  }

  const defaults = getDefaultRecipients(mode, originalEmail);

  const [toRecipients, setToRecipients] = useState<Recipient[]>(() => {
    if (initialDraft) return initialDraft.to.map(asRecipient);
    return initialTo && initialTo.length > 0 ? initialTo : defaults.to;
  });
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>(
    initialDraft ? initialDraft.cc.map(asRecipient) : defaults.cc
  );
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>(
    initialDraft ? initialDraft.bcc.map(asRecipient) : []
  );
  const [showCc, setShowCc] = useState(ccRecipients.length > 0);
  const [showBcc, setShowBcc] = useState(bccRecipients.length > 0);
  const [subject, setSubject] = useState(
    initialDraft ? initialDraft.subject : getDefaultSubject(mode, originalEmail?.subject)
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [bodyHtml, setBodyHtml] = useState(initialBody);
  // One object for the editor's whole life: React 19 re-applies
  // dangerouslySetInnerHTML whenever the object changes, which would wipe what
  // the user typed (and a template insert) on every re-render.
  const [initialBodyProp] = useState(() => (initialBody ? { __html: initialBody } : undefined));
  const [sendError, setSendError] = useState<EmailSendErrorView | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  /** Saved selection range for restoring after toolbar interactions */
  const savedSelectionRef = useRef<Range | null>(null);

  const sendMutation = trpc.email.sendEmail.useMutation();
  const draftMutation = trpc.email.saveDraft.useMutation();
  const uploadMutation = trpc.emailAttachments.upload.useMutation();
  const removeDraftMutation = trpc.email.processEmail.useMutation();
  const identityQuery = trpc.emailMailbox.sendingIdentity.useQuery();
  const threadId = originalEmail?.id ?? initialDraft?.threadId;

  // Saves run one at a time so two of them cannot each create a draft, and always
  // send the latest recipients and subject. Once the message is sent, none may run,
  // or a late autosave would bring the draft back.
  const draftIdRef = useRef(initialDraft?.id);
  const sentRef = useRef(false);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const latestDraftRef = useRef({ toRecipients, ccRecipients, bccRecipients, subject, threadId });
  latestDraftRef.current = { toRecipients, ccRecipients, bccRecipients, subject, threadId };
  const draftMutateAsyncRef = useRef(draftMutation.mutateAsync);
  draftMutateAsyncRef.current = draftMutation.mutateAsync;
  const onDraftSavedRef = useRef(onDraftSaved);
  onDraftSavedRef.current = onDraftSaved;

  // The body is read when the save runs, so a queued save never writes older text over newer.
  // Once the page has gone there is no editor to read: the last text seen is what remains.
  const lastBodyRef = useRef(initialBody);
  const persistDraft = useCallback(() => {
    lastBodyRef.current = bodyRef.current?.innerHTML ?? lastBodyRef.current;
    const run = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (sentRef.current) return;
        const latest = latestDraftRef.current;
        const htmlBody = bodyRef.current?.innerHTML ?? lastBodyRef.current;
        lastBodyRef.current = htmlBody;
        const result = await draftMutateAsyncRef.current({
          id: draftIdRef.current,
          to: emailsOf(latest.toRecipients),
          cc: emailsOf(latest.ccRecipients),
          bcc: emailsOf(latest.bccRecipients),
          subject: latest.subject,
          htmlBody,
          threadId: latest.threadId,
        });
        if (result?.id && result.id !== draftIdRef.current) {
          draftIdRef.current = result.id;
          onDraftSavedRef.current?.(result.id);
        }
      });
    saveChainRef.current = run;
    return run;
  }, []);

  /** Sent, so the draft has done its job. A failure here must not look like a failed send. */
  const removeSentDraft = useCallback(async () => {
    sentRef.current = true;
    await saveChainRef.current.catch(() => undefined);
    if (!draftIdRef.current) return;
    try {
      await removeDraftMutation.mutateAsync({
        emailId: draftIdRef.current,
        action: 'permanentDelete',
      });
    } catch {
      // It stays in Drafts, where the user can delete it.
    }
  }, [removeDraftMutation]);

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

  const reportSendError = useCallback(() => {
    setStatusMessage('Failed to send email. Please try again.');
  }, []);

  /** Stores every attachment privately before the send; null (and a visible error) on any failure. */
  const uploadAttachments = useCallback(async (): Promise<EmailAttachmentRef[] | null> => {
    const oversized = attachments.find((file) => file.size > MAX_EMAIL_ATTACHMENT_BYTES);
    if (oversized) {
      setAttachmentError(
        `${oversized.name} is larger than ${MAX_ATTACHMENT_MB} MB, so it cannot be attached.`
      );
      return null;
    }
    const refs: EmailAttachmentRef[] = [];
    for (const file of attachments) {
      try {
        refs.push(
          await uploadMutation.mutateAsync({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            contentBase64: await readAsBase64(file),
          })
        );
      } catch (error) {
        const reason = error instanceof Error && error.message ? error.message : 'Try again.';
        setAttachmentError(`${file.name} could not be attached: ${reason}`);
        return null;
      }
    }
    return refs;
  }, [attachments, uploadMutation]);

  const sendNow = useCallback(async () => {
    if (!validate()) return;
    setSendError(null);
    setAttachmentError(null);
    setSkippedNotice(null);

    const uploaded = await uploadAttachments();
    if (!uploaded) return;

    try {
      const result = await sendMutation.mutateAsync({
        to: toRecipients.map((r) => r.email),
        cc: ccRecipients.length > 0 ? ccRecipients.map((r) => r.email) : undefined,
        bcc: bccRecipients.length > 0 ? bccRecipients.map((r) => r.email) : undefined,
        subject,
        htmlBody: getBodyHtml(),
        threadId,
        attachments: uploaded.length > 0 ? uploaded : undefined,
      });
      const notice = partialSendNotice(result);
      setSkippedNotice(notice);
      setStatusMessage(notice ?? 'Email sent successfully');
      if (notice) toast({ title: 'Email sent', description: notice });
      await removeSentDraft();
      onSent?.();
    } catch (error) {
      // The draft stays as it is; the focused alert says what to do next (and is
      // the only announcement: the live region is left alone).
      setSendError(getEmailSendError(error));
    }
  }, [
    validate,
    uploadAttachments,
    sendMutation,
    toRecipients,
    ccRecipients,
    bccRecipients,
    subject,
    getBodyHtml,
    threadId,
    removeSentDraft,
    onSent,
  ]);

  // One send at a time: attachments upload before the mutation is pending, so
  // the mutation's own pending flag cannot stop a second click.
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const handleSend = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await sendNow();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [sendNow]);

  const handleSaveDraft = useCallback(async () => {
    try {
      await persistDraft();
      setStatusMessage('Draft saved');
    } catch {
      setStatusMessage('Failed to save draft');
    }
  }, [persistDraft]);

  /**
   * Execute a formatting command on the editor.
   * For createLink, a URL value must be provided.
   * The toolbar buttons use onMouseDown={preventDefault} to keep the
   * editor selection alive, so we can just execCommand directly.
   */
  const handleFormat = useCallback(
    (command: string, value?: string) => {
      // Restore selection in case it was lost
      restoreSelection();
      bodyRef.current?.focus();

      if (command === 'createLink' && value) {
        document.execCommand('createLink', false, value);
      } else if (command === 'createLink') {
        // No URL provided — ignore
        return;
      } else {
        document.execCommand(command, false);
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
    },
    [restoreSelection]
  );

  const contactLookup = trpc.email.searchContacts.useQuery(
    { query: toRecipients[0]?.email ?? '', limit: 1 },
    { enabled: toRecipients.length > 0 && (toRecipients[0]?.email?.length ?? 0) >= 2 }
  );

  const resolveVariables = useCallback(
    (text: string): string => {
      const contact = (
        contactLookup.data as
          | Array<{ firstName: string; lastName: string; email: string; company: string | null }>
          | undefined
      )?.[0];
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
        // A template replaces the body; the signature is kept after it (CA-7).
        const body = DOMPurify.sanitize(resolveVariables(template.body));
        bodyRef.current.innerHTML = signatureHtml ? `${body}<br>${signatureHtml}` : body;
      }
      if (!subject) {
        setSubject(resolveVariables(template.subject));
      }
    },
    [subject, resolveVariables, signatureHtml]
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
    const html = bodyRef.current?.innerHTML ?? '';
    lastBodyRef.current = html;
    setBodyHtml(html);
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

  /** Empty means nothing to create; a draft that exists must still record being cleared. */
  const nothingToSave = useCallback((body: string) => {
    if (draftIdRef.current) return false;
    const latest = latestDraftRef.current;
    return (
      latest.toRecipients.length === 0 &&
      latest.ccRecipients.length === 0 &&
      latest.bccRecipients.length === 0 &&
      latest.subject.trim().length === 0 &&
      !hasText(body)
    );
  }, []);

  // Auto-save a draft 2s after anything in it stops changing.
  const debouncedBody = useDebounce(bodyHtml, 2000);
  const draftFieldsKey = JSON.stringify([
    emailsOf(toRecipients),
    emailsOf(ccRecipients),
    emailsOf(bccRecipients),
    subject,
  ]);
  const debouncedFieldsKey = useDebounce(draftFieldsKey, 2000);
  const lastAutoSavedRef = useRef({ body: initialBody, fields: draftFieldsKey });

  useEffect(() => {
    const last = lastAutoSavedRef.current;
    if (debouncedBody === last.body && debouncedFieldsKey === last.fields) return;
    if (nothingToSave(getBodyHtml())) return;

    lastAutoSavedRef.current = { body: debouncedBody, fields: debouncedFieldsKey };
    persistDraft()
      .then(() => setStatusMessage('Draft saved automatically'))
      .catch(() => {
        // Silent fail — auto-save should not interrupt the user
      });
  }, [debouncedBody, debouncedFieldsKey, getBodyHtml, nothingToSave, persistDraft]);

  /** Saves what is there, if anything; going on matters more than a failed save. */
  const saveBeforeLeaving = useCallback(async () => {
    if (nothingToSave(getBodyHtml())) return;
    await persistDraft().catch(() => undefined);
  }, [nothingToSave, getBodyHtml, persistDraft]);

  // Discard: save draft if content present, then call onDiscard
  const handleDiscard = useCallback(async () => {
    await saveBeforeLeaving();
    onDiscard();
  }, [saveBeforeLeaving, onDiscard]);

  const leaveFor = useCallback(
    (href: string) => {
      void saveBeforeLeaving().then(() => {
        if (onLeave) onLeave(href);
        else window.location.assign(href);
      });
    },
    [saveBeforeLeaving, onLeave]
  );

  /** The blank space around the text is part of the message: it starts typing at the end. */
  const focusBodyFromBlank = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const editor = bodyRef.current;
    if (event.target !== event.currentTarget || !editor) return;
    event.preventDefault();
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  return (
    <form
      aria-label="Compose email"
      className={cn('flex flex-col bg-card', className)}
      onSubmit={(e) => {
        e.preventDefault();
        handleSend().catch(reportSendError);
      }}
    >
      {/* Recipients */}
      <div className="space-y-1 border-b border-border px-4 py-2">
        <ComposeFrom identity={identityQuery.data} onLeave={leaveFor} />
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
      <div
        role="none"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2"
        onMouseDown={focusBodyFromBlank}
      >
        <label className="sr-only" htmlFor="compose-body">
          Message body
        </label>
        <RichTextBody
          ref={bodyRef}
          id="compose-body"
          tabIndex={0}
          aria-label="Message body"
          contentEditable
          suppressContentEditableWarning
          className="min-h-[200px] flex-1 text-sm focus:outline-none prose prose-sm max-w-none"
          onKeyDown={handleBodyKeyDown}
          onInput={handleBodyInput}
          dangerouslySetInnerHTML={initialBodyProp}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 ? (
        <div className="border-t border-border px-4 py-2">
          <AttachmentManager files={attachments} onFilesChange={setAttachments} />
          <p className="mt-1 text-xs text-muted-foreground">
            Files are added when you send. They are not kept with a draft, so attach them again if
            you leave this page.
          </p>
        </div>
      ) : null}

      {/* Coded send refusal (PG-207, AC-EM-018) */}
      {sendError ? (
        <SendErrorAlert error={sendError} className="mx-4 my-2 text-sm" onAction={leaveFor} />
      ) : null}

      {attachmentError ? (
        <p role="alert" className="px-4 py-1 text-xs text-red-700 dark:text-red-300">
          {attachmentError}
        </p>
      ) : null}

      {skippedNotice ? (
        <p className="px-4 py-1 text-xs text-muted-foreground">{skippedNotice}</p>
      ) : null}

      {/* Error messages */}
      {errors.length > 0 ? (
        <div className="px-4 py-1">
          {errors.map((err) => (
            <p key={err} className="text-xs text-red-700 dark:text-red-300">
              {err}
            </p>
          ))}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 border-t border-border px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            type="submit"
            aria-label="Send"
            disabled={sending || sendMutation.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              send
            </span>{' '}
            Send
          </button>

          <button
            type="button"
            aria-label="Save draft"
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              save
            </span>{' '}
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
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              attach_file
            </span>
          </button>

          <TemplateSelector onSelect={handleTemplateSelect} currentBody={getBodyHtml()} />

          <button
            type="button"
            aria-label="Discard"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={handleDiscard}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              close
            </span>{' '}
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
