import { NextRequest } from 'next/server';

const ALLOWED_HOSTS = ['files.stripe.com', 'invoice.stripe.com', 'pay.stripe.com'];

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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response('Host is not allowed.', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString());
  } catch {
    return new Response('Failed to fetch PDF from provider.', { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Provider returned ${upstream.status}.`, {
      status: upstream.status >= 500 ? 502 : upstream.status,
    });
  }

  const body = await upstream.arrayBuffer();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

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
