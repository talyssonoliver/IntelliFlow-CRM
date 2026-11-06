/**
 * Content Security Policy for every page, sent as
 * `Content-Security-Policy-Report-Only` by `src/proxy.ts`.
 *
 * Report-only first: browsers report what the policy would block and block
 * nothing. Scripts allow `'unsafe-inline'` because Next.js emits inline scripts
 * and statically prerendered pages can't carry a per-request nonce; a nonce or
 * hash plan comes before the policy is enforced. What this first policy watches
 * is scripts, connections, frames and plugins from hosts not named below.
 *
 * Hosts come from the environment at runtime (API, WebSocket, Supabase and the
 * Sentry ingest host from its DSN), plus the third parties the app loads:
 * Stripe.js and its API, and Supabase or Railway when the variables are unset.
 */

export interface CspEnv {
  apiUrl?: string;
  wsUrl?: string;
  supabaseUrl?: string;
  sentryDsn?: string;
  sentryEnvironment?: string;
}

export function cspEnvFromProcess(): CspEnv {
  return {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    wsUrl: process.env.NEXT_PUBLIC_WS_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    sentryEnvironment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  };
}

const STRIPE_SCRIPT = 'https://js.stripe.com';
const STRIPE_FRAMES = ['https://js.stripe.com', 'https://hooks.stripe.com'];
const STRIPE_API = 'https://api.stripe.com';
const HOSTED_FALLBACKS = [
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://*.up.railway.app',
  'wss://*.up.railway.app',
];

/** `scheme://host[:port]` of a URL, or `null` when it isn't one. */
export function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'ws:' ||
      url.protocol === 'wss:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** The WebSocket origin that pairs with an http(s) origin. */
function socketOriginOf(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}`;
  if (origin.startsWith('http://')) return `ws://${origin.slice('http://'.length)}`;
  return null;
}

function parseDsn(
  dsn: string | undefined
): { origin: string; key: string; project: string } | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn.trim());
    const project = url.pathname.split('/').filter(Boolean).pop() ?? '';
    if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(project)) return null;
    return { origin: url.origin, key: url.username, project };
  } catch {
    return null;
  }
}

/**
 * Sentry's endpoint for CSP reports, built from the public DSN. `null` when no
 * usable DSN is set, and then violations only show in the browser console.
 */
export function sentryReportUri(dsn: string | undefined, environment?: string): string | null {
  const parsed = parseDsn(dsn);
  if (!parsed) return null;
  const uri = new URL(`${parsed.origin}/api/${parsed.project}/security/`);
  uri.searchParams.set('sentry_key', parsed.key);
  if (environment?.trim()) uri.searchParams.set('sentry_environment', environment.trim());
  return uri.toString();
}

function sources(...values: Array<string | null | undefined>): string {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].join(' ');
}

export function buildReportOnlyCsp(env: CspEnv): string {
  const api = originOf(env.apiUrl);
  const socket = originOf(env.wsUrl);
  const supabase = originOf(env.supabaseUrl);
  const sentry = parseDsn(env.sentryDsn)?.origin ?? null;
  const reportUri = sentryReportUri(env.sentryDsn, env.sentryEnvironment);

  const directives = [
    "default-src 'self'",
    `script-src ${sources("'self'", "'unsafe-inline'", STRIPE_SCRIPT)}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${sources(
      "'self'",
      api,
      socketOriginOf(api),
      socket,
      supabase,
      socketOriginOf(supabase),
      ...HOSTED_FALLBACKS,
      sentry,
      STRIPE_API
    )}`,
    `frame-src ${sources("'self'", ...STRIPE_FRAMES, supabase, 'https://*.supabase.co')}`,
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
  ];
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives.join('; ');
}
