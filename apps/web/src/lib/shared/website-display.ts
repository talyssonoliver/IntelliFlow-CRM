/**
 * How a stored company website is shown on record pages: the bare domain as the
 * label, and a link without tracking parameters.
 */

/** Query parameters added by ad and email tools, never part of the site itself. */
const TRACKING_PARAMS = new Set([
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'fbclid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref_src',
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
}

export interface WebsiteDisplay {
  /** Link target: the stored address with tracking parameters removed. */
  readonly href: string;
  /** Label: the host without `www.`, e.g. `example.co.uk`. */
  readonly domain: string;
}

/**
 * Reads a stored website (a plain string, or a value object with `normalized`
 * or `value`) and returns its link and bare-domain label. Null when there is no
 * usable http(s) address.
 */
export function websiteDisplay(website: unknown): WebsiteDisplay | null {
  let raw: unknown = website;
  if (raw && typeof raw === 'object') {
    if ('normalized' in raw) raw = (raw as { normalized: unknown }).normalized;
    else if ('value' in raw) raw = (raw as { value: unknown }).value;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;

  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParam(name)) url.searchParams.delete(name);
  }
  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  return { href: url.toString(), domain };
}
