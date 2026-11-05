import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { getVerifiedCaller } from '@/lib/route-access';

interface WebhookTestRequest {
  url: string;
  payload: unknown;
  headers?: Record<string, string>;
}

interface UpstreamResult {
  status: number;
  body: string;
  responseHeaders: Record<string, string>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_CHARS = 256 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_USER = 20;
const FORBIDDEN_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

/** Every range a webhook test must never reach, including provider metadata. */
const BLOCKED_RANGES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  // No ::ffff:0:0/96 rule: BlockList checks IPv4 against it, which would block every
  // IPv4 address. A mapped address is already checked against the IPv4 rules above.
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, 'ipv6');
}

function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_RANGES.check(ip, 'ipv4');
  if (family === 6) return BLOCKED_RANGES.check(ip, 'ipv6');
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
    if (results.some(({ address }) => isBlockedAddress(address))) {
      return 'Host resolves to a non-public address.';
    }
  } catch {
    return 'Host could not be resolved.';
  }
  return null;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number
) => void;

/**
 * Resolves again at connect time and vets what the socket will use, so a name
 * that changes its answer after assertPublicUrl still can't reach a blocked address.
 */
function vettedLookup(
  hostname: string,
  options: { all?: boolean },
  callback: LookupCallback
): void {
  lookup(hostname, { all: true })
    .then((results) => {
      const first = results[0];
      if (!first || results.some(({ address }) => isBlockedAddress(address))) {
        callback(new Error('Host resolves to a non-public address.'), '');
      } else if (options.all) {
        callback(null, results);
      } else {
        callback(null, first.address, first.family);
      }
    })
    .catch((error: NodeJS.ErrnoException) => callback(error, ''));
}

function safeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => !FORBIDDEN_HEADERS.has(name.toLowerCase()))
  );
}

function readResponseHeaders(response: http.IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    Object.entries(response.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : (value ?? ''),
    ])
  );
}

/** Sends one POST. Redirects aren't followed, and the response is cut at the size limit. */
function sendTestRequest(
  url: URL,
  body: string,
  headers: Record<string, string>
): Promise<UpstreamResult> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const outbound = client.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        lookup: vettedLookup as never,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        const finish = () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            responseHeaders: readResponseHeaders(response),
          });
        response.on('data', (chunk: Buffer) => {
          const remaining = MAX_RESPONSE_BYTES - received;
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
          received += chunk.length;
          if (received >= MAX_RESPONSE_BYTES) {
            finish();
            response.destroy();
          }
        });
        response.on('end', finish);
        response.on('error', reject);
      }
    );
    outbound.on('timeout', () => outbound.destroy(new Error('Request timed out')));
    outbound.on('error', reject);
    outbound.end(body);
  });
}

const recentCalls = new Map<string, number[]>();

/** Per user, per server instance. A limit on abuse, not a global quota. */
function isOverRateLimit(userId: string, now: number): boolean {
  const recent = (recentCalls.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  recent.push(now);
  recentCalls.set(userId, recent);
  return recent.length > RATE_MAX_PER_USER;
}

function reply(status: number, body: string): NextResponse {
  return NextResponse.json({ status: 0, latencyMs: 0, body, responseHeaders: {} }, { status });
}

export async function POST(request: Request) {
  const caller = await getVerifiedCaller(request);
  if (!caller) return reply(401, 'Sign in to send a test webhook.');
  if (isOverRateLimit(caller.id, Date.now())) {
    return reply(429, 'Too many test webhooks. Try again in a minute.');
  }

  let body: WebhookTestRequest;
  try {
    body = await request.json();
  } catch {
    return reply(400, 'Invalid request body');
  }

  if (!body.url || typeof body.url !== 'string') {
    return reply(400, 'URL is required');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return reply(400, 'Invalid URL');
  }

  const ssrfError = await assertPublicUrl(parsedUrl);
  if (ssrfError) return reply(400, ssrfError);

  const payload = JSON.stringify(body.payload) ?? 'null';
  if (payload.length > MAX_PAYLOAD_CHARS) return reply(413, 'Payload is too large.');

  const start = Date.now();
  try {
    const result = await sendTestRequest(parsedUrl, payload, safeHeaders(body.headers));
    return NextResponse.json({ ...result, latencyMs: Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { status: 0, latencyMs: Date.now() - start, body: message, responseHeaders: {} },
      { status: 502 }
    );
  }
}
