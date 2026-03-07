/**
 * Webhook Rate Limiter (IFC-224)
 *
 * In-memory IP-based rate limiter for webhook route handlers.
 * 200 requests per minute per IP (NF-002).
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 200;

interface RateEntry {
  count: number;
  windowStart: number;
}

const ipCounts = new Map<string, RateEntry>();

export function isRateLimited(request: Request): boolean {
  const ip = extractClientIp(request);
  const now = Date.now();

  const entry = ipCounts.get(ip);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    ipCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return true;
  }

  return false;
}

function extractClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Use rightmost IP (most trusted in reverse proxy chains)
    const ips = forwarded.split(',').map(s => s.trim());
    return ips.at(-1) || 'unknown';
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export function checkIpAllowlist(request: Request): void {
  const allowedIps = process.env.CALENDAR_WEBHOOK_ALLOWED_IPS;
  if (!allowedIps) return;

  const ip = extractClientIp(request);
  const allowed = allowedIps.split(',').map(s => s.trim());
  if (!allowed.includes(ip)) {
    console.warn('[WebhookRateLimiter] security_event_ip_not_allowlisted', {
      ip,
      allowedIps: allowed.length,
    });
  }
}

/** Test-only: reset rate limiter state */
export function resetRateLimiter(): void {
  ipCounts.clear();
}
