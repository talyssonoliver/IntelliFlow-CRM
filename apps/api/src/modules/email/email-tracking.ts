/**
 * Open and click tracking for mail sent from Aurora (register row 41).
 *
 * When the tenant has `trackOpens` on, the sent HTML carries a 1x1 image whose address names the email record;
 * when `trackClicks` is on, every http(s) link goes through a redirect on our server. A request to either
 * address is recorded on the email record (`openedAt`, `openCount`, `clickedAt`, `clickCount`), which is what
 * the lead's Open Rate reads. With a setting off, nothing is injected for it: the sent HTML is byte for byte
 * what the user wrote.
 *
 * Every address carries an HMAC signature, so nobody can record opens for a record they did not receive mail
 * for, and the redirect only ever goes to a link we put in a mail (it is not an open redirect). The key is
 * derived from the server's existing secret salt, never stored. Pure functions here; the HTTP side is in
 * `email-tracking-route.ts`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getBookingSalt } from '../calendar/booking-abuse';

export type TrackingKind = 'o' | 'c';

export interface TrackingSettings {
  trackOpens: boolean;
  trackClicks: boolean;
}

const SIGNATURE_LENGTH = 32;

function signingKey(): string {
  return createHmac('sha256', getBookingSalt()).update('email-tracking-v1', 'utf8').digest('hex');
}

/** What the signature covers: an open names the record, a click also names the link. */
function signedText(kind: TrackingKind, recordId: string, target: string): string {
  return kind === 'o' ? `o:${recordId}` : `c:${recordId}:${target}`;
}

export function trackingSignature(kind: TrackingKind, recordId: string, target = ''): string {
  return createHmac('sha256', signingKey())
    .update(signedText(kind, recordId, target), 'utf8')
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

export function isValidSignature(
  kind: TrackingKind,
  recordId: string,
  signature: string,
  target = ''
): boolean {
  const expected = Buffer.from(trackingSignature(kind, recordId, target));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The public origin of this API (config only, never a request header), or null when it is not usable. */
export function trackingBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.API_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowed = env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'];
    return allowed.includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

/** Lower-cases A-Z only, so every index in the result is an index in the input (toLowerCase can change lengths). */
function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32));
}

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['lt', '<'],
  ['gt', '>'],
]);

function entityChar(name: string): string | null {
  const named = NAMED_ENTITIES.get(name.toLowerCase());
  if (named !== undefined) return named;
  if (!name.startsWith('#')) return null;
  const hex = name.charAt(1) === 'x' || name.charAt(1) === 'X';
  const code = hex ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null;
}

/** Looks like a character reference name ("copy", "#38", "#x26"), whether or not we know it. */
function looksLikeReference(name: string): boolean {
  return name.length > 0 && [...name].every((char) => /[a-z0-9#]/i.test(char));
}

/**
 * An attribute value as a browser reads it: the common named and numeric character references decoded.
 * Null when it holds a reference we cannot decode (the full table has over two thousand names): that link is
 * then left exactly as written, which always works, instead of being tracked with a wrong destination.
 */
function decodeEntities(text: string): string | null {
  let out = '';
  let from = 0;
  for (let amp = text.indexOf('&', from); amp !== -1; amp = text.indexOf('&', from)) {
    out += text.slice(from, amp);
    const semi = text.indexOf(';', amp);
    const name = semi !== -1 && semi - amp <= 10 ? text.slice(amp + 1, semi) : '';
    const char = looksLikeReference(name) ? entityChar(name) : null;
    if (looksLikeReference(name) && char === null) return null;
    out += char ?? '&';
    from = char === null ? amp + 1 : semi + 1;
  }
  return out + text.slice(from);
}

const WHITESPACE = ' \t\r\n';

function skipWhitespace(html: string, from: number): number {
  let at = from;
  while (at < html.length && WHITESPACE.includes(html.charAt(at))) at += 1;
  return at;
}

/** Where the quoted value of the `href` at `at` starts and ends, when it is an attribute of an `<a ...>` tag. */
function hrefSpan(html: string, lower: string, at: number): { start: number; end: number } | null {
  if (!WHITESPACE.includes(html.charAt(at - 1))) return null;
  const open = html.lastIndexOf('<', at);
  if (open === -1 || open < html.lastIndexOf('>', at)) return null;
  if (lower.charAt(open + 1) !== 'a' || !WHITESPACE.includes(html.charAt(open + 2))) return null;
  const equals = skipWhitespace(html, at + 4);
  if (html.charAt(equals) !== '=') return null;
  const quoteAt = skipWhitespace(html, equals + 1);
  const quote = html.charAt(quoteAt);
  if (quote !== '"' && quote !== "'") return null;
  const end = html.indexOf(quote, quoteAt + 1);
  return end === -1 ? null : { start: quoteAt + 1, end };
}

/**
 * The redirect address for one link, or null when the link is left alone: not http(s), not a valid address, or
 * already one of our tracking addresses (a reply or forward that quotes a tracked mail). The link is signed in the
 * normalized form the redirect reads back, so what is signed is what is checked.
 */
function trackedHref(target: string, recordId: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const normalized = url.toString();
  if (normalized.startsWith(`${base}/t/`)) return null;
  const sig = trackingSignature('c', recordId, normalized);
  // encodeURIComponent keeps the apostrophe, which would end a single-quoted attribute.
  const encoded = encodeURIComponent(normalized).split("'").join('%27');
  return `${base}/t/c/${recordId}/${sig}?u=${encoded}`;
}

/** Rewrites the http(s) links of `<a href="...">` tags (single or double quoted, any case), by plain scanning. */
function rewriteLinks(html: string, recordId: string, base: string): string {
  const lower = asciiLower(html);
  let out = '';
  let copied = 0;
  let from = 0;
  for (let at = lower.indexOf('href', from); at !== -1; at = lower.indexOf('href', from)) {
    from = at + 4;
    const span = hrefSpan(html, lower, at);
    if (!span) continue;
    from = span.end;
    const value = decodeEntities(html.slice(span.start, span.end).trim());
    const tracked = value === null ? null : trackedHref(value, recordId, base);
    if (!tracked) continue;
    out += html.slice(copied, span.start) + tracked;
    copied = span.end;
  }
  return out + html.slice(copied);
}

function withPixel(html: string, recordId: string, base: string): string {
  const sig = trackingSignature('o', recordId);
  const pixel = `<img src="${base}/t/o/${recordId}/${sig}.gif" width="1" height="1" alt="" style="display:none" />`;
  const close = asciiLower(html).lastIndexOf('</body>');
  return close === -1 ? html + pixel : html.slice(0, close) + pixel + html.slice(close);
}

/**
 * The HTML to send. Unchanged when both settings are off, and unchanged (with a log line) when tracking
 * cannot be set up here (no public API address, no signing salt): a mail is never held back for tracking.
 */
export function instrumentHtml(
  html: string,
  recordId: string,
  settings: TrackingSettings,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!settings.trackOpens && !settings.trackClicks) return html;
  const base = trackingBaseUrl(env);
  if (!base) {
    console.error('[email] tracking is on but API_PUBLIC_URL is not usable; sending untracked');
    return html;
  }
  try {
    const linked = settings.trackClicks ? rewriteLinks(html, recordId, base) : html;
    return settings.trackOpens ? withPixel(linked, recordId, base) : linked;
  } catch (error) {
    console.error('[email] tracking could not be added; sending untracked', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return html;
  }
}
