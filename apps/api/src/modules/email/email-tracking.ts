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

function isTrackableLink(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

/** Rewrites every `href="..."` / `href='...'` that is an http(s) link, by plain scanning. */
function rewriteLinks(html: string, recordId: string, base: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let cursor = 0;
  for (let at = lower.indexOf('href=', cursor); at !== -1; at = lower.indexOf('href=', cursor)) {
    const quote = html.charAt(at + 5);
    if (quote !== '"' && quote !== "'") {
      out += html.slice(cursor, at + 5);
      cursor = at + 5;
      continue;
    }
    const start = at + 6;
    const end = html.indexOf(quote, start);
    if (end === -1) break;
    const target = html.slice(start, end).trim().split('&amp;').join('&');
    out += html.slice(cursor, start);
    if (isTrackableLink(target)) {
      const sig = trackingSignature('c', recordId, target);
      out += `${base}/t/c/${recordId}/${sig}?u=${encodeURIComponent(target)}`;
    } else {
      out += html.slice(start, end);
    }
    cursor = end;
  }
  return out + html.slice(cursor);
}

function withPixel(html: string, recordId: string, base: string): string {
  const sig = trackingSignature('o', recordId);
  const pixel = `<img src="${base}/t/o/${recordId}/${sig}.gif" width="1" height="1" alt="" style="display:none" />`;
  const close = html.toLowerCase().lastIndexOf('</body>');
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
