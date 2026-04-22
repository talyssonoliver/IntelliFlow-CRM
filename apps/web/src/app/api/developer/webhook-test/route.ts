import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

interface WebhookTestRequest {
  url: string;
  payload: unknown;
  headers?: Record<string, string>;
}

/**
 * Block SSRF targets: loopback, private, link-local, unique-local, and
 * cloud-metadata endpoints. Accepts an IP literal in string form.
 */
function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::' || lower.startsWith('::ffff:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    if (lower.startsWith('fe80')) return true; // link-local
    return false;
  }
  // Non-IP string (shouldn't happen once we call this post-resolution).
  return true;
}

const HOSTNAME_BLOCKLIST = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

async function assertPublicUrl(url: URL): Promise<string | null> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Only http(s) URLs are permitted.';
  }
  const host = url.hostname.toLowerCase();
  if (!host) return 'URL must include a hostname.';
  if (HOSTNAME_BLOCKLIST.has(host)) return 'Host is not allowed.';
  if (host.endsWith('.local') || host.endsWith('.internal')) return 'Host is not allowed.';

  try {
    // `all:true` so every resolved address is vetted, not just the first.
    const results = await lookup(host, { all: true });
    if (results.length === 0) return 'Host is not allowed.';
    for (const { address } of results) {
      if (isPrivateAddress(address)) return 'Host resolves to a non-public address.';
    }
  } catch {
    return 'Host could not be resolved.';
  }
  return null;
}

export async function POST(request: Request) {
  let body: WebhookTestRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: 'Invalid request body', responseHeaders: {} },
      { status: 400 }
    );
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: 'URL is required', responseHeaders: {} },
      { status: 400 }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: 'Invalid URL', responseHeaders: {} },
      { status: 400 }
    );
  }

  const ssrfError = await assertPublicUrl(parsedUrl);
  if (ssrfError) {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: ssrfError, responseHeaders: {} },
      { status: 400 }
    );
  }

  const start = Date.now();

  try {
    // `redirect: 'error'` prevents a compliant public host from 3xx-ing us
    // into a private target after the SSRF check has already passed.
    const response = await fetch(parsedUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...body.headers,
      },
      body: JSON.stringify(body.payload),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });

    const latencyMs = Date.now() - start;
    const responseBody = await response.text();
    const responseHeaders = Object.fromEntries(response.headers);

    return NextResponse.json({
      status: response.status,
      latencyMs,
      body: responseBody,
      responseHeaders,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';

    return NextResponse.json(
      { status: 0, latencyMs, body: message, responseHeaders: {} },
      { status: 502 }
    );
  }
}
