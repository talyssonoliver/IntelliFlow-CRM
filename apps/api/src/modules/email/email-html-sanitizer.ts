/**
 * Server-side sanitiser for the HTML body of received and sent mail, run at write time by every
 * sync path (Gmail, Microsoft, Zoho), by the backfill and again when an HTML body is read back.
 *
 * Allow-list only. Layout markup (tables, blocks, inline text, headings, lists), links over
 * https/http/mailto/tel with noopener, images over https, cid: (an inline attachment, resolved on
 * demand through the attachment proxy) and small raster data: images, and a fixed set of inline
 * CSS properties whose values cannot load anything.
 *
 * Removed: scripts, event handlers, <style> blocks and <link>, forms, frames, objects, SVG,
 * <base>/<meta>, javascript:/vbscript:/data: links, srcset and background attributes, CSS url(),
 * expression(), @import and position, and remote tracking pixels (images of 2px or less, or
 * hidden). Other remote images stay (the reader blocks them until the user shows them).
 */
import sanitizeHtml from 'sanitize-html';

/** A CSS value that cannot fetch, script or escape the declaration. */
const SAFE_VALUE = [
  /^(?![\s\S]*(?:url\s*\(|image-set|src\s*\(|cross-fade|element\s*\(|paint\s*\(|expression|javascript:|vbscript:|@import|behavior|binding|var\())[^<>{}\\;]{1,200}$/i,
];

const BOX = [
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
] as const;

const TEXT = [
  'color',
  'background-color',
  'background',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'text-indent',
  'vertical-align',
  'white-space',
  'word-break',
  'list-style-type',
  'table-layout',
] as const;

const ALLOWED_STYLES: Record<string, RegExp[]> = {};
for (const property of [...BOX, ...TEXT]) ALLOWED_STYLES[property] = SAFE_VALUE;
ALLOWED_STYLES['display'] = [/^(block|inline|inline-block|table|table-row|table-cell)$/i];
ALLOWED_STYLES['float'] = [/^(left|right|none)$/i];

/** Only absolute units are judged: 2em or 2% depend on the page, and are real sizes. */
const SIZE_UNITS = ['px', 'pt'];

/** A length of 2px/pt or less (a tracking pixel), unitless or not, with or without !important. */
function pixelSized(value: string | undefined): boolean {
  if (value === undefined) return false;
  let text = value.trim().toLowerCase();
  if (text.endsWith('!important')) text = text.slice(0, -'!important'.length).trim();
  const unit = SIZE_UNITS.find((candidate) => text.endsWith(candidate));
  if (unit) text = text.slice(0, -unit.length).trim();
  const size = Number(text);
  return text !== '' && Number.isFinite(size) && size >= 0 && size <= 2;
}

/** The value of one declaration in an inline style, read without a pattern. */
function styleSize(style: string | undefined, property: 'width' | 'height'): string | undefined {
  for (const declaration of (style ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0 && declaration.slice(0, colon).trim().toLowerCase() === property) {
      return declaration.slice(colon + 1);
    }
  }
  return undefined;
}

/** An image the reader would never see (a tracking pixel), or one left with no usable source. */
function isTrackerOrEmptyImage(attribs: Record<string, string>): boolean {
  if (!attribs['src']) return true;
  if (pixelSized(attribs['width']) || pixelSized(attribs['height'])) return true;
  if (pixelSized(styleSize(attribs['style'], 'width'))) return true;
  if (pixelSized(styleSize(attribs['style'], 'height'))) return true;
  return /display\s*:\s*none/i.test(attribs['style'] ?? '');
}

const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_DATA_IMAGE_CHARS = 700_000;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'abbr',
    'address',
    'article',
    'aside',
    'b',
    'big',
    'blockquote',
    'br',
    'caption',
    'center',
    'cite',
    'code',
    'col',
    'colgroup',
    'dd',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'font',
    'footer',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hr',
    'i',
    'img',
    'li',
    'main',
    'ol',
    'p',
    'pre',
    's',
    'section',
    'small',
    'span',
    'strike',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    table: ['width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'bgcolor'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor'],
    th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'bgcolor'],
    tr: ['align', 'valign', 'bgcolor'],
    col: ['span', 'width'],
    font: ['color', 'face', 'size'],
    '*': ['style', 'dir', 'lang', 'align'],
  },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'cid', 'data'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  allowedStyles: { '*': ALLOWED_STYLES },
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title', 'head'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    img: (tagName, attribs) => {
      const src = attribs['src'] ?? '';
      // The scheme as sanitize-html and browsers read it: whitespace and control characters ignored.
      const scheme = [...src]
        .filter((char) => char.charCodeAt(0) > 32)
        .join('')
        .toLowerCase();
      const keep =
        !scheme.startsWith('data:') ||
        (RASTER_DATA.test(src) && src.length <= MAX_DATA_IMAGE_CHARS);
      const { src: _dropped, ...rest } = attribs;
      // Judged on the raw attributes (the style allow-list would hide `display:none`): a pixel or a
      // hidden image loses its source and is then removed.
      return { tagName, attribs: keep && !isTrackerOrEmptyImage(attribs) ? attribs : rest };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && isTrackerOrEmptyImage(frame.attribs),
};

/** The sanitised HTML, or null when nothing readable is left (so the text body is used). */
export function sanitizeEmailHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, OPTIONS).trim();
  return clean.length > 0 ? clean : null;
}
