/**
 * Lead enrichment — pure client-side derivation helpers (PG-060).
 *
 * Given the data a user types into the New Lead form, derive the API-supported
 * `website` and `company` fields from the email domain. This is a pure,
 * synchronous module: NO network, NO LLM, NO tRPC, NO React. It adds zero
 * latency to the lead-create submission path.
 *
 * Scope note: AI-backed enrichment (LangChain chains) exists only for contacts
 * and accounts in the ai-worker; leads intentionally use this deterministic
 * client-side derivation. See the PG-060 spec for the rationale.
 *
 * Consumer: `apps/web/src/app/leads/(list)/new/page.tsx` (email field onBlur).
 */

/** Personal/free mailbox providers — never derive a company/website from these. */
const FREEMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'mail.com',
  'zoho.com',
]);

/**
 * Second-level public-suffix labels (e.g. `co.uk`, `com.br`). When the label
 * before the TLD is one of these, the registrable label is one position earlier
 * (so `acme.co.uk` / `acme.com.br` both derive `Acme`, not `Co` / `Com`).
 */
const SLD_LABELS: ReadonlySet<string> = new Set([
  'com',
  'net',
  'org',
  'gov',
  'edu',
  'co',
  'ac',
  'ne',
  'or',
  'gob',
]);

/** Fields this module can derive — a subset of the New Lead form. */
export interface EnrichableLeadFields {
  website?: string;
  company?: string;
}

/**
 * Only valid hostname characters (rejects URL syntax: `/ : ? # @` and spaces).
 * A single anchored character class — linear, no backtracking.
 */
const HOSTNAME_CHARS_RE = /^[a-z0-9.-]+$/;
/** A plausible TLD: alphabetic, at least two characters. */
const TLD_RE = /^[a-z]{2,}$/;

/**
 * True when `domain` is a syntactically valid host: dot-separated labels of
 * alphanumerics/hyphens (no empty label, no leading/trailing hyphen) ending in
 * an alphabetic TLD. Rejects URL fragments like `acme.com/path` or `acme.com:80`
 * that would otherwise yield a bogus website URL. (Network-level SSRF defence
 * stays server-side; this is purely input-shape validation.)
 */
function isValidHost(domain: string): boolean {
  if (!HOSTNAME_CHARS_RE.test(domain)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label === '' || label.startsWith('-') || label.endsWith('-')) return false;
  }
  return TLD_RE.test(labels[labels.length - 1]);
}

/**
 * Extract a normalized (trimmed, lower-cased) domain from an email address.
 * Returns null for anything that is not a plausible, syntactically valid
 * `local@domain.tld` (a second `@`, whitespace, URL syntax, or a missing/
 * malformed host all yield null).
 */
function extractDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  // Any internal whitespace means this is not a single valid address — reject
  // before deriving a domain (otherwise `bad local@acme.com` would enrich from
  // `acme.com`). Honours the contract above: "whitespace ... yields null".
  if (/\s/.test(trimmed)) return null;
  const at = trimmed.indexOf('@');
  // at <= 0 covers both "no @" (-1) and "empty local part" (0).
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1);
  return isValidHost(domain) ? domain : null;
}

/** True for empty / whitespace-only values (treated as "user has not filled this"). */
function isBlank(value: string | undefined | null): boolean {
  return value == null || value.trim() === '';
}

/** Title-case a domain label, splitting on hyphens (`acme-corp` → `Acme Corp`). */
function titleCaseLabel(label: string): string {
  return label
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Derive a canonical `https://<domain>` website from a corporate email.
 * Returns null for freemail, invalid, or domain-less input.
 */
export function deriveWebsiteFromEmail(email: string): string | null {
  const domain = extractDomain(email);
  if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;
  return normalizeWebsiteUrl(domain);
}

/**
 * Canonicalize a user-entered URL: bare domain → https, http → https, and
 * strip any trailing slash(es). An empty/whitespace input yields ''.
 */
export function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed.replace(/^https?:\/\//i, 'https://')
    : `https://${trimmed}`;
  // Strip trailing slash(es) so "https://acme.com/" === "https://acme.com".
  // Use an O(n) reverse scan rather than a regex like /\/+$/, which backtracks
  // quadratically on a long run of trailing slashes (ReDoS — Sonar S5852).
  let end = withScheme.length;
  while (end > 0 && withScheme[end - 1] === '/') end--;
  return withScheme.slice(0, end);
}

/**
 * Derive a title-cased company hint from a corporate email's registrable
 * domain label (the label immediately before the final TLD). Returns null for
 * freemail or invalid input.
 */
export function deriveCompanyHint(email: string): string | null {
  const domain = extractDomain(email);
  if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;
  const labels = domain.split('.');
  // Registrable label = the one before the TLD, skipping a country-code SLD
  // (handles sub.acme.com → Acme and acme.co.uk / acme.com.br → Acme).
  let idx = labels.length >= 2 ? labels.length - 2 : 0;
  if (labels.length >= 3 && SLD_LABELS.has(labels[idx])) {
    idx = labels.length - 3;
  }
  const registrable = labels[idx];
  if (!registrable) return null;
  return titleCaseLabel(registrable);
}

/**
 * Non-destructively enrich `website` and `company` from the email domain.
 * Only fills fields that are currently blank (whitespace counts as blank);
 * never overwrites a value the user has already entered. Returns a new object —
 * the input is not mutated.
 */
export function enrichFromEmail(email: string, fields: EnrichableLeadFields): EnrichableLeadFields {
  const next: EnrichableLeadFields = { ...fields };

  if (isBlank(next.website)) {
    const website = deriveWebsiteFromEmail(email);
    if (website) next.website = website;
  }

  if (isBlank(next.company)) {
    const company = deriveCompanyHint(email);
    if (company) next.company = company;
  }

  return next;
}
