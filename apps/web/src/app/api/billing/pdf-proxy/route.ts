import { NextRequest } from 'next/server';

/**
 * Closed tuple of literal hostnames we proxy Stripe PDFs from. The
 * request-forgery fix pattern resolves user input down to one of these
 * LITERAL constants via equality check, then concatenates the literal with a
 * sanitised pathname — the outbound `fetch` URL is never derived from the
 * original user-supplied string.
 */
const STRIPE_HOSTS = ['files.stripe.com', 'invoice.stripe.com', 'pay.stripe.com'] as const;
type StripeHost = (typeof STRIPE_HOSTS)[number];

function pickStripeHost(hostname: string): StripeHost | null {
  for (const literal of STRIPE_HOSTS) {
    if (hostname === literal) return literal;
  }
  return null;
}

// Conservative pathname filter — drops everything outside the URL-path
// alphabet before we concatenate it with the literal base.
const PATHNAME_SAFE_RE = /[^A-Za-z0-9\-._~!$&'()*+,;=:@/%]/g;

/**
 * Proxies invoice/receipt PDF downloads from Stripe through our own origin.
 *
 * Cross-origin PDF URLs ignore the `download` attribute on anchor elements,
 * causing navigation instead of download. This route fetches the PDF
 * server-side and streams it back with proper Content-Disposition headers.
 *
 * Usage: GET /api/billing/pdf-proxy?url=<encoded-stripe-pdf-url>&filename=<desired-filename>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const filename = request.nextUrl.searchParams.get('filename') || 'invoice.pdf';

  if (!url) {
    return new Response('Missing url query parameter.', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response('Invalid url parameter.', { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return new Response('Only HTTPS URLs are allowed.', { status: 400 });
  }

  const safeHost = pickStripeHost(parsed.hostname);
  if (safeHost === null) {
    return new Response('Host is not allowed.', { status: 403 });
  }

  // Build the outbound URL by CONCATENATING a literal hostname with a
  // whitelist-filtered pathname/query. The `fetch` target is therefore never
  // derived from the raw user URL — CodeQL treats this as the canonical
  // request-forgery break.
  const safePath =
    parsed.pathname.length > 0
      ? '/' + parsed.pathname.slice(1).replaceAll(PATHNAME_SAFE_RE, '')
      : '/';
  const safeQuery = parsed.search.length > 1 ? parsed.search.slice(0, 2000) : '';
  const safeUrlString = `https://${safeHost}${safePath}${safeQuery}`;

  let upstream: Response;
  try {
    upstream = await fetch(safeUrlString, { redirect: 'error' });
  } catch {
    return new Response('Failed to fetch PDF from provider.', { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Provider returned ${upstream.status}.`, {
      status: upstream.status >= 500 ? 502 : upstream.status,
    });
  }

  const body = await upstream.arrayBuffer();
  const sanitizedFilename = filename.replaceAll(/[^a-zA-Z0-9._-]/g, '_');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
