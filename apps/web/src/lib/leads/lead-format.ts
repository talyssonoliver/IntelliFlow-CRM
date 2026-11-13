/**
 * Shared lead activity + date formatting helpers.
 *
 * Extracted verbatim from `app/leads/[id]/page.tsx` (PG-061) so that both the
 * Lead 360 page and the extracted `LeadTimeline` component consume one source of
 * truth — avoiding duplicated icon maps / relative-time logic. Follows the
 * PG-059 `lib/leads/*` extraction convention.
 */

// Activity types matching the database enum (UI-facing variant).
export type ActivityType =
  | 'web_form'
  | 'score_update'
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'status_change'
  | 'qualification';

/** Material-symbol icon name for an activity type. */
export function getActivityIcon(type: Readonly<ActivityType>): string {
  const icons: Record<ActivityType, string> = {
    web_form: 'web',
    score_update: 'psychology',
    email: 'mail',
    call: 'call',
    note: 'edit_note',
    meeting: 'event',
    status_change: 'person_add',
    qualification: 'verified',
  };
  return icons[type];
}

/** Tailwind badge background/text classes for an activity type. */
export function getActivityIconBg(type: Readonly<ActivityType>): string {
  const colors: Record<ActivityType, string> = {
    web_form: 'bg-blue-100 dark:bg-slate-800 text-blue-600',
    score_update: 'bg-purple-100 dark:bg-slate-800 text-purple-600',
    email: 'bg-orange-100 dark:bg-slate-800 text-orange-600',
    call: 'bg-green-100 dark:bg-slate-800 text-green-600',
    note: 'bg-amber-100 dark:bg-slate-800 text-amber-600',
    meeting: 'bg-indigo-100 dark:bg-slate-800 text-indigo-600',
    status_change: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
    qualification: 'bg-teal-100 dark:bg-slate-800 text-teal-600',
  };
  return colors[type];
}

/**
 * Human-friendly relative time: `Nm ago`, `Nh ago`, `Yesterday`, `N days ago`,
 * or a localised date for anything a week or older.
 */
export function formatRelativeTime(dateString: string, timezone: string = 'Europe/London'): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}

/**
 * A compact pound label for an amount in whole currency units:
 * `50_000` -> `"£50k"`, `500` -> `"£500"`. The CRM works in GBP (UI-017).
 */
export function formatGBPCompact(amount: number): string {
  // Round first, so 999.5 reads "£1k" rather than "£1000".
  const whole = Math.round(amount);
  if (whole >= 1000) return `£${Math.round(whole / 1000)}k`;
  return `£${whole}`;
}

/** Ad and campaign tracking parameters, dropped from a lead's website. */
const TRACKING_PARAM = /^(utm_.*|gclid|fbclid|msclkid|dclid|gbraid|wbraid)$/i;

/**
 * The raw query string without tracking pairs. The pairs that stay are kept byte for
 * byte (no re-encoding of "%20" or bare flags), and the query is unchanged when there
 * is nothing to drop.
 */
function withoutTrackingParams(search: string): string {
  if (!search) return search;
  const segments = search.slice(1).split('&');
  const kept = segments.filter((segment) => {
    const rawKey = segment.split('=', 1)[0].replace(/\+/g, ' ');
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      // Malformed escape: compare the raw key.
    }
    return !TRACKING_PARAM.test(key);
  });
  if (kept.length === segments.length) return search;
  return kept.length ? `?${kept.join('&')}` : '';
}

/** The host part of an address as the user typed it: no scheme, user info, port or path. */
function typedHost(text: string): string {
  const afterScheme = text.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  // A backslash ends an http(s) host for the URL parser too ("a.example\@b.example").
  const authority = afterScheme.split(/[\\/?#]/, 1)[0];
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.replace(/:\d*$/, '');
}

/**
 * A real address host: a bracketed IPv6 literal, a full dotted-quad IPv4 address, or
 * a domain with a dot, no empty labels and a top-level label that has a letter.
 */
function isAddressHost(host: string): boolean {
  if (/^\[[\da-f:.]+\]$/i.test(host)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => label === '')) return false;
  return /\p{L}/u.test(labels[labels.length - 1]);
}

/** True when the typed host is the host the parsed link opens (after IDNA and IP normalising). */
function opensTypedHost(typed: string, url: URL): boolean {
  try {
    return new URL(`https://${typed}`).hostname === url.hostname;
  } catch {
    return false;
  }
}

/** The path as readable text, or still encoded when decoding would show control or bidi characters. */
function readablePath(path: string): string {
  try {
    const decoded = decodeURIComponent(path);
    return /[\p{Cc}\p{Cf}]/u.test(decoded) ? path : decoded;
  } catch {
    return path;
  }
}

/**
 * A lead's website as a clean link: the href without tracking parameters, and a short
 * label (the host without "www.", plus a path when there is one), e.g.
 * "http://www.energym.co.uk/?utm_source=google" -> { label: "energym.co.uk" }.
 * Null when there is no usable http(s) address, so the row is not shown.
 */
export function leadWebsite(
  raw: string | null | undefined
): { href: string; label: string } | null {
  const text = raw?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Placeholders ("N/A", "none", "n.a.", "0") must not become links. The URL parser
  // rewrites hosts ("0" -> "0.0.0.0"), so the check runs on the host as typed.
  const typed = typedHost(text);
  if (!isAddressHost(typed)) return null;
  // The label must name the host the link opens; anything else is not shown at all.
  if (!opensTypedHost(typed, url)) return null;
  url.search = withoutTrackingParams(url.search);
  // The label reads as typed: the parser would show "café" as punycode and "menú"
  // percent-encoded. The href keeps the parsed, encoded form.
  const host = typed.toLowerCase().replace(/^www\./, '');
  const path = readablePath(url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
  return { href: url.toString(), label: host + path };
}

/**
 * Format a lead's estimated value — stored in CENTS per the domain contract
 * (packages/validators/src/lead.ts:36, packages/domain/src/crm/lead/Lead.ts:73) —
 * as a compact pound label: `5_000_000` (pence) -> `"£50k"`, `50_000` -> `"£500"`.
 */
export function formatEstimatedValue(cents: number): string {
  return formatGBPCompact(cents / 100);
}

/**
 * Tags the COA pipeline sync writes for its own bookkeeping
 * (`apps/api/src/modules/inbound/inbound.router.ts`): `coa-pipeline` and
 * `coa-lead:<id>`. They stay on the lead (the sync matches on them) but are not
 * the user's tags, so they are hidden wherever tags are shown (UI-017).
 */
export function isSystemTag(tag: string): boolean {
  return tag === 'coa-pipeline' || tag.startsWith('coa-lead:');
}

/** The tags to show a user: everything except the system tags. */
export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isSystemTag(tag));
}

/** The parts of a lead that can name it. */
export interface LeadNameParts {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
}

/**
 * The one name to show for a lead: first and last name, then company, then
 * email. Leads imported without a person's name (company-only or email-only
 * records) would otherwise render a blank title and confirm dialogs such as
 * "permanently delete ?". Used for the page title and every action prompt so
 * they always agree.
 */
export function leadDisplayName(lead: Readonly<LeadNameParts>): string {
  const personName = [lead.firstName, lead.lastName]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  return personName || lead.company?.trim() || lead.email?.trim() || 'Unnamed lead';
}

/**
 * The recommendation texts of a stored LeadAIInsight. The column is JSON with two shapes
 * in production: a plain string[] (scoring) and, when sentiment data exists, an object
 * `{ texts, emotions, keyPhrases, primaryEmotion }` (intelligence router). Anything else
 * reads as no recommendations, never as a crash.
 */
export function insightRecommendations(raw: unknown): string[] {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((r): r is string => typeof r === 'string') : [];
  if (Array.isArray(raw)) return strings(raw);
  if (raw && typeof raw === 'object') return strings((raw as { texts?: unknown }).texts);
  return [];
}
