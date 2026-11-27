/**
 * MVP-001: which provider runs an address's mail, read from its domain's MX records, so the
 * connect screen can offer the right one-click button first; and whether the address is a
 * personal one (gmail.com, outlook.com, ...), which a company mailbox should not use.
 *
 * Only the domain of a valid address is looked up, never a host the user types. Lookups time
 * out after 3 s and are cached for 10 minutes per domain (at most 500 domains), so the
 * settings page cannot be used to drive DNS traffic. A failed lookup is "UNKNOWN", never an error.
 */
import { promises as dns } from 'node:dns';

export type MailProvider = 'GOOGLE' | 'MICROSOFT' | 'ZOHO' | 'OTHER' | 'UNKNOWN';

export interface ProviderHint {
  domain: string;
  provider: MailProvider;
  /** A free personal mailbox domain: customers would see a personal address. */
  personal: boolean;
}

/** Free personal mailbox domains (the provider each belongs to is known without a lookup). */
const PERSONAL_DOMAINS: ReadonlyMap<string, MailProvider> = new Map([
  ['gmail.com', 'GOOGLE'],
  ['googlemail.com', 'GOOGLE'],
  ['outlook.com', 'MICROSOFT'],
  ['hotmail.com', 'MICROSOFT'],
  ['hotmail.co.uk', 'MICROSOFT'],
  ['live.com', 'MICROSOFT'],
  ['live.co.uk', 'MICROSOFT'],
  ['msn.com', 'MICROSOFT'],
  ['zohomail.com', 'ZOHO'],
  ['yahoo.com', 'OTHER'],
  ['yahoo.co.uk', 'OTHER'],
  ['icloud.com', 'OTHER'],
  ['me.com', 'OTHER'],
  ['aol.com', 'OTHER'],
  ['proton.me', 'OTHER'],
  ['protonmail.com', 'OTHER'],
  ['gmx.com', 'OTHER'],
]);

/** More free or ISP mailbox domains that many unrelated people share (not used for the setup hint). */
const OTHER_SHARED_DOMAINS: ReadonlySet<string> = new Set([
  'gmx.net',
  'gmx.de',
  'gmx.co.uk',
  'mail.com',
  'ymail.com',
  'yahoo.ie',
  'yahoo.fr',
  'yahoo.de',
  'outlook.co.uk',
  'outlook.ie',
  'hotmail.fr',
  'hotmail.de',
  'live.ie',
  'icloud.co.uk',
  'btinternet.com',
  'btopenworld.com',
  'sky.com',
  'talktalk.net',
  'virginmedia.com',
  'blueyonder.co.uk',
  'ntlworld.com',
  'tiscali.co.uk',
  'yandex.com',
  'pm.me',
]);

/** True for a free personal mailbox domain (gmail.com ...): many unrelated people share it. */
export function isPersonalMailDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return PERSONAL_DOMAINS.has(lower) || OTHER_SHARED_DOMAINS.has(lower);
}

const LOOKUP_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { provider: MailProvider; at: number }>();

/** Test-only: forget cached lookups. */
export function __resetProviderHintCache(): void {
  cache.clear();
}

function endsWithLabel(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** The provider an MX host set points to (any one recognised host decides). */
export function providerFromMx(hosts: readonly string[]): MailProvider {
  for (const raw of hosts) {
    const host = raw.trim().toLowerCase().replace(/\.$/, '');
    if (endsWithLabel(host, 'google.com') || endsWithLabel(host, 'googlemail.com')) return 'GOOGLE';
    if (endsWithLabel(host, 'mail.protection.outlook.com') || endsWithLabel(host, 'outlook.com')) {
      return 'MICROSOFT';
    }
    if (ZOHO_MX.test(host)) {
      return 'ZOHO';
    }
  }
  return hosts.length > 0 ? 'OTHER' : 'UNKNOWN';
}

/** Zoho's MX hosts per data centre (mx, mx2, mx3 ...): exact domains only, no lookalikes. */
const ZOHO_MX = /^mx\d*\.(zoho\.(com|eu|in|com\.au|jp|sa|uk|com\.cn)|zohocloud\.ca)$/;

type ResolveMx = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The provider hint for an address already validated as an email address. */
export async function providerHintFor(
  address: string,
  resolveMx: ResolveMx = (domain) => dns.resolveMx(domain),
  now: () => number = Date.now
): Promise<ProviderHint> {
  const domain = address
    .slice(address.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase();
  const known = PERSONAL_DOMAINS.get(domain);
  if (known) return { domain, provider: known, personal: true };

  const cached = cache.get(domain);
  if (cached && now() - cached.at < CACHE_TTL_MS) {
    return { domain, provider: cached.provider, personal: false };
  }
  let provider: MailProvider;
  try {
    const records = await withTimeout(resolveMx(domain), LOOKUP_TIMEOUT_MS);
    const ordered = [...records].sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    provider = providerFromMx(ordered);
  } catch {
    provider = 'UNKNOWN';
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(domain, { provider, at: now() });
  return { domain, provider, personal: false };
}
