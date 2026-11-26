'use client';

/**
 * The one email body renderer, shared by the /email reader (EmailMessage) and the lead's Emails
 * tab. The HTML goes in a sandboxed iframe (lib/email/email-frame.ts), external images are blocked
 * until "Show images", and the plain text is the fallback when a mail has no HTML.
 *
 * Attachments and inline images are not stored in Aurora: they are fetched from the mail provider
 * on demand through `emailAttachments.fetch`, when the mail is opened (inline images) or the user
 * clicks a file (downloads).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  EMAIL_FRAME_SANDBOX,
  INLINE_IMAGE_TYPES,
  MAX_INLINE_IMAGES,
  MAX_INLINE_IMAGE_BYTES,
  buildEmailFrame,
  referencedContentIds,
} from '@/lib/email/email-frame';

export interface EmailBodyAttachment {
  id?: string;
  filename: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentId?: string | null;
  /** True when the file is fetched from the mail provider on demand. */
  onDemand?: boolean;
}

export interface EmailBodyProps {
  emailId: string;
  htmlBody?: string;
  textBody?: string;
  attachments?: readonly EmailBodyAttachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveName(name: string): string {
  const cleaned = [...name]
    .map((char) => (char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char))
    .join('');
  return cleaned.slice(0, 200) || 'attachment';
}

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isEmbeddable(type: string): boolean {
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(type.toLowerCase());
}

export function EmailBody({
  emailId,
  htmlBody,
  textBody,
  attachments = [],
}: Readonly<EmailBodyProps>) {
  const utils = trpc.useUtils();
  const [showImages, setShowImages] = useState(false);
  const [tall, setTall] = useState(false);
  const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline (cid:) images: fetched through the proxy when the mail is shown, never stored. The
  // effect runs again only when the set of images to fetch changes (callers pass fresh arrays).
  const wanted = new Set(htmlBody ? referencedContentIds(htmlBody) : []);
  const todo = attachments
    .filter((a) => a.id && a.onDemand && a.contentId && wanted.has(a.contentId.toLowerCase()))
    .filter((a) => a.size <= MAX_INLINE_IMAGE_BYTES)
    .slice(0, MAX_INLINE_IMAGES);
  const todoRef = useRef(todo);
  todoRef.current = todo;
  const utilsRef = useRef(utils);
  utilsRef.current = utils;
  const todoKey = todo.map((a) => `${a.id}:${a.contentId}`).join('|');
  useEffect(() => {
    const list = todoRef.current;
    if (list.length === 0) return;
    let cancelled = false;
    void Promise.all(
      list.map(async (a) => {
        try {
          const file = await utilsRef.current.emailAttachments.fetch.fetch({
            emailId,
            attachmentId: a.id!,
          });
          if (!isEmbeddable(file.contentType)) return null;
          return [
            a.contentId!.toLowerCase(),
            `data:${file.contentType};base64,${file.contentBase64}`,
          ] as const;
        } catch {
          return null; // that image stays blank
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setInlineImages(Object.fromEntries(pairs.filter((p) => p !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [emailId, todoKey]);

  const frame = useMemo(
    () =>
      htmlBody
        ? buildEmailFrame({ html: htmlBody, showRemoteImages: showImages, inlineImages })
        : null,
    [htmlBody, showImages, inlineImages]
  );

  const files = attachments.filter((a) => !a.isInline);

  async function download(attachment: EmailBodyAttachment) {
    if (!attachment.id) return;
    setBusyId(attachment.id);
    try {
      const file = await utils.emailAttachments.fetch.fetch({
        emailId,
        attachmentId: attachment.id,
      });
      const url = URL.createObjectURL(
        new Blob([bytesOf(file.contentBase64)], { type: file.contentType })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = saveName(file.fileName);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast({
        title: 'Could not open the attachment',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="email-body">
      {frame ? (
        <div>
          {frame.blockedImageCount > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span>Images from other sites are hidden.</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setShowImages(true)}
              >
                Show images
              </button>
            </div>
          )}
          <iframe
            title="Email content"
            sandbox={EMAIL_FRAME_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={frame.srcDoc}
            className={`w-full rounded-md border border-border bg-white ${tall ? 'h-[80vh]' : 'h-[28rem]'}`}
          />
          <button
            type="button"
            className="mt-1 text-xs text-muted-foreground hover:underline"
            onClick={() => setTall((value) => !value)}
          >
            {tall ? 'Show less' : 'Show more'}
          </button>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap text-sm">{textBody}</pre>
      )}

      {files.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              attach_file
            </span>
            <span>{files.length} attachment(s)</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {files.map((file) =>
              file.onDemand && file.id ? (
                <button
                  key={file.id}
                  type="button"
                  disabled={busyId === file.id}
                  onClick={() => void download(file)}
                  aria-label={`Download ${file.filename}`}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    download
                  </span>
                  {file.filename}
                  {file.size > 0 && (
                    <span className="text-muted-foreground">({formatSize(file.size)})</span>
                  )}
                </button>
              ) : (
                <span
                  key={file.id ?? file.filename}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    attach_file
                  </span>
                  {file.filename}
                </span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
