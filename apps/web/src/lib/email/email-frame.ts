/**
 * The document an email body is shown in: one sandboxed iframe for the lead's Emails tab and the
 * /email reader (components/email/EmailBody.tsx).
 *
 * The HTML was already sanitised on the server when it was stored; it is cleaned again here, so a
 * body from any path is treated as hostile. The frame is `sandbox` with no `allow-scripts` and no
 * `allow-same-origin` (an opaque origin: it cannot read the app, its cookies or its storage), and
 * carries its own CSP: nothing loads except images, and external images only after the user
 * chooses to show them (as Gmail does).
 */
import DOMPurify from 'isomorphic-dompurify';

/** Popups only, so a link opens in a new tab. No scripts, no same-origin, no forms, no top navigation. */
export const EMAIL_FRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/** Inline images fetched per message, and the biggest one embedded (bytes). */
export const MAX_INLINE_IMAGES = 12;
export const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;
/** Only these are embedded from an attachment (never SVG, which can carry markup). */
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** `src=cid:x`, `src="cid:x"` or `src='cid:x'`. */
const CID_SRC = /(\bsrc\s*=\s*)(["']?)cid:([^"'\s>]+)\2/gi;

/** The Content-IDs the body's images name (`cid:` URLs), decoded, case kept, once each. */
export function referencedContentIds(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(CID_SRC)) {
    found.add(safeDecode(match[3] ?? ''));
  }
  return [...found];
}

/**
 * Which attachment Content-ID each `cid:` in the body means. An exact match wins; failing that, a
 * case-insensitive one counts only when exactly one attachment fits (providers differ in case, but
 * two ids that differ only by case are different images).
 */
export function resolveContentIds(
  html: string,
  attachmentIds: readonly string[]
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const wanted of referencedContentIds(html)) {
    if (attachmentIds.includes(wanted)) {
      resolved[wanted] = wanted;
      continue;
    }
    const loose = attachmentIds.filter((id) => id.toLowerCase() === wanted.toLowerCase());
    if (new Set(loose).size === 1) resolved[wanted] = loose[0]!;
  }
  return resolved;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface EmailFrameInput {
  html: string;
  /** Load https images from other sites (default: blocked). */
  showRemoteImages: boolean;
  /** Content-ID as the body names it (case kept) to a `data:image/...` URL already fetched through the attachment proxy. */
  inlineImages?: Readonly<Record<string, string>>;
}

export interface EmailFrame {
  srcDoc: string;
  /** External images left out because they are blocked. */
  blockedImageCount: number;
}

const FRAME_STYLE =
  'html{color-scheme:light}body{margin:0;padding:12px;background:#fff;color:#1f2937;' +
  'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}' +
  'img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}';

function csp(showRemoteImages: boolean): string {
  const images = showRemoteImages ? 'data: https:' : 'data:';
  return [
    "default-src 'none'",
    `img-src ${images}`,
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function buildEmailFrame(input: EmailFrameInput): EmailFrame {
  const inline = input.inlineImages ?? {};
  // cid: images become the fetched data URL, or lose their source (DOMPurify would drop `cid:` anyway).
  const resolved = input.html.replaceAll(
    CID_SRC,
    (_all, prefix: string, _quote: string, id: string) => {
      const key = safeDecode(id);
      const data = Object.hasOwn(inline, key) ? inline[key] : '';
      return `${prefix}"${data}"`;
    }
  );
  const body = DOMPurify.sanitize(resolved, {
    RETURN_DOM: true,
    FORBID_TAGS: [
      'style',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'iframe',
      'frame',
      'object',
      'embed',
      'svg',
      'math',
      'link',
      'meta',
      'base',
      'audio',
      'video',
      'source',
      'picture',
    ],
    FORBID_ATTR: ['srcset', 'background', 'formaction', 'ping'],
  }) as HTMLElement;
  let blocked = 0;
  for (const image of Array.from(body.querySelectorAll('img'))) {
    const src = image.getAttribute('src') ?? '';
    if (/^https:/i.test(src) && !input.showRemoteImages) {
      image.removeAttribute('src');
      image.setAttribute('data-blocked', 'true');
      blocked += 1;
    } else if (!/^(https:|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(src)) {
      image.removeAttribute('src');
    }
  }
  for (const link of Array.from(body.querySelectorAll('a, area'))) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  const srcDoc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp(input.showRemoteImages)}">` +
    `<meta name="referrer" content="no-referrer"><style>${FRAME_STYLE}</style></head><body>` +
    `${body.innerHTML}</body></html>`;
  return { srcDoc, blockedImageCount: blocked };
}
