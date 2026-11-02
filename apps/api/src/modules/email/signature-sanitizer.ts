/**
 * Server-side sanitiser for email signature HTML (PG-207, SEC-10).
 *
 * A signature written by one user ends up in other people's compose windows
 * (org signatures) and in outgoing mail, so it is cleaned on save and again
 * when it is prefilled. Allow-list only: basic text markup, links over
 * https/mailto (forced noopener), https images, a few colour/font styles.
 * No scripts, handlers, SVG, iframes, forms, data:/javascript: URLs or CSS
 * url()/expression().
 */
import sanitizeHtml from 'sanitize-html';

const SAFE_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]{3,20}$/i];
const SAFE_SIZE = [/^\d{1,3}(\.\d{1,2})?(px|pt|em|rem|%)$/];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'br',
    'p',
    'div',
    'span',
    'ul',
    'ol',
    'li',
    'img',
    'table',
    'tbody',
    'tr',
    'td',
    'hr',
    'small',
    'blockquote',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    '*': ['style'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: { img: ['https'], a: ['https', 'mailto'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: SAFE_COLOR,
      'background-color': SAFE_COLOR,
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-style': [/^(normal|italic)$/],
      'font-size': SAFE_SIZE,
      'font-family': [/^[a-z0-9 ,'"-]{1,80}$/i],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [/^(none|underline)$/],
    },
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
  disallowedTagsMode: 'discard',
};

export function sanitizeSignatureHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
