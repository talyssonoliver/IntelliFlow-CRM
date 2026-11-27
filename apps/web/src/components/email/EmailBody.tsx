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
  resolveContentIds,
} from '@/lib/email/email-frame';
import { saveName } from '@/lib/email/save-name';

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

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const BASE64_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ['iVBORw0KGgo', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
];

/**
 * The raster type to draw an inline image with: the declared one when it is a raster type, else (a
 * provider that sends octet-stream) the one the first bytes show. Never SVG or anything unknown.
 */
export function rasterTypeOf(file: { contentType: string; contentBase64: string }): string | null {
  const declared = file.contentType.toLowerCase().split(';')[0]!.trim();
  if (isEmbeddable(declared)) return declared;
  if (declared !== 'application/octet-stream' && declared !== '') return null;
  return BASE64_SIGNATURES.find(([prefix]) => file.contentBase64.startsWith(prefix))?.[1] ?? null;
}

function isEmbeddable(type: string): boolean {
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(type.toLowerCase());
}

/** The inline images to fetch and how the body's ids map to them: the effect runs again when this changes. */
function keyOf(
  todo: readonly EmailBodyAttachment[],
  cidMap: Readonly<Record<string, string>>
): string {
  const ids = todo.map((a) => [a.id, a.contentId].join(':')).join('|');
  return [ids, JSON.stringify(cidMap)].join('#');
}

interface InlineLoad {
  list: readonly EmailBodyAttachment[];
  cidMap: Readonly<Record<string, string>>;
  fetchFile: (attachmentId: string) => Promise<{ contentType: string; contentBase64: string }>;
  isCancelled: () => boolean;
  onImages: (images: Record<string, string>) => void;
  onSettled: (attachmentId: string) => void;
}

/**
 * Inline (cid:) images, one at a time: each is a request to the mail provider, and the server limits
 * how many a user can have running. An image is keyed by the id the body names (one attachment can
 * serve several spellings of it); one that fails or is not a raster type stays blank.
 */
/** One inline image's data URL, keyed by every id the body names for it; null when it cannot be drawn. */
async function inlineImageOf(
  load: InlineLoad,
  attachment: EmailBodyAttachment
): Promise<Record<string, string> | null> {
  try {
    const file = await load.fetchFile(attachment.id!);
    const type = rasterTypeOf(file);
    if (type === null) return null;
    const data = `data:${type};base64,${file.contentBase64}`;
    const keyed: Record<string, string> = {};
    for (const [named, cid] of Object.entries(load.cidMap)) {
      if (cid === attachment.contentId) keyed[named] = data;
    }
    return keyed;
  } catch {
    return null; // that image stays blank
  }
}

async function loadInlineImages(load: InlineLoad): Promise<void> {
  const found: Record<string, string> = {};
  for (const attachment of load.list) {
    if (load.isCancelled()) return;
    const keyed = await inlineImageOf(load, attachment);
    if (load.isCancelled()) return;
    if (keyed) {
      Object.assign(found, keyed);
      load.onImages({ ...found });
    }
    load.onSettled(attachment.id!);
  }
}

/** Which `cid:` the body names each fetchable inline attachment serves, and which of them are fetched. */
function planInline(
  htmlBody: string | undefined,
  attachments: readonly EmailBodyAttachment[]
): { cidMap: Record<string, string>; todo: EmailBodyAttachment[] } {
  const fetchable = attachments.filter((a) => a.id && a.onDemand && a.contentId);
  const cidMap = htmlBody
    ? resolveContentIds(
        htmlBody,
        fetchable.map((a) => a.contentId!)
      )
    : {};
  const matched = new Set(Object.values(cidMap));
  const todo = fetchable
    .filter((a) => matched.has(a.contentId!))
    .filter((a) => a.size <= MAX_INLINE_IMAGE_BYTES)
    .slice(0, MAX_INLINE_IMAGES);
  return { cidMap, todo };
}

/**
 * The attachments listed to download. An inline image is left out only while it is (or will be)
 * drawn in the body; one that is not drawn (too large, an unsupported type, not referenced, failed)
 * is listed so it can still be downloaded.
 */
function listedFiles(
  attachments: readonly EmailBodyAttachment[],
  state: {
    todo: readonly EmailBodyAttachment[];
    cidMap: Readonly<Record<string, string>>;
    inlineImages: Readonly<Record<string, string>>;
    settled: Readonly<Record<string, boolean>>;
  }
): EmailBodyAttachment[] {
  const drawing = new Set(state.todo.map((a) => a.id));
  return attachments.filter((a) => {
    if (!a.isInline || !a.id || !drawing.has(a.id)) return true;
    const drawn = Object.entries(state.cidMap).some(
      ([named, cid]) => cid === a.contentId && state.inlineImages[named]
    );
    return !drawn && state.settled[a.id] === true;
  });
}

export function EmailBody({
  emailId,
  htmlBody,
  textBody,
  attachments = [],
}: Readonly<EmailBodyProps>) {
  const utils = trpc.useUtils();
  // Consent is for one mail: the id of the mail whose images were shown.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const showImages = shownFor === emailId;
  const [tall, setTall] = useState(false);
  const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
  /** Inline attachments whose fetch has finished (drawn or not). */
  const [settled, setSettled] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline (cid:) images: fetched through the proxy when the mail is shown, never stored. The
  // effect runs again only when the set of images to fetch changes (callers pass fresh arrays).
  const { cidMap, todo } = planInline(htmlBody, attachments);
  const todoRef = useRef(todo);
  todoRef.current = todo;
  const cidMapRef = useRef(cidMap);
  cidMapRef.current = cidMap;
  const utilsRef = useRef(utils);
  utilsRef.current = utils;
  const todoKey = keyOf(todo, cidMap);
  useEffect(() => {
    const list = todoRef.current;
    // A different mail starts with no images of the last one (Content-IDs are often generic).
    setInlineImages({});
    setSettled({});
    if (list.length === 0) return;
    let cancelled = false;
    loadInlineImages({
      list,
      cidMap: cidMapRef.current,
      fetchFile: (attachmentId) =>
        utilsRef.current.emailAttachments.fetch.fetch({ emailId, attachmentId }),
      isCancelled: () => cancelled,
      onImages: setInlineImages,
      onSettled: (id) => setSettled((now) => ({ ...now, [id]: true })),
    }).catch(() => undefined);
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

  const files = listedFiles(attachments, { todo, cidMap, inlineImages, settled });

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
                onClick={() => setShownFor(emailId)}
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
            className={`w-full rounded-md border border-border bg-white max-sm:rounded-none max-sm:border-0 ${tall ? 'h-[80vh]' : 'h-[28rem]'}`}
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
