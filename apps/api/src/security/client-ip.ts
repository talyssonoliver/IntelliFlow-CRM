/**
 * Trusted client-IP extraction for security and audit controls (S17-AUDIT-009
 * follow-on, #261).
 *
 * `x-forwarded-for` is a comma-separated list appended by each proxy hop
 * ("client, proxy1, …, edge"). The RIGHTMOST entry is set by our platform's
 * edge proxy (Railway / Vercel / nginx) and cannot be forged by the client;
 * the LEFTMOST entry is fully client-controlled. Security-sensitive controls
 * (audit logging, signature provenance, per-IP throttling on low-volume
 * endpoints) must therefore read the rightmost, trusted hop — taking the
 * leftmost value lets an attacker inject an arbitrary IP and bypass IP-based
 * controls. This mirrors `public-feedback`'s `extractClientIp`.
 *
 * NOTE: the general anonymous rate-limiter (`apps/api/src/middleware/rate-limit.ts`)
 * deliberately uses `x-real-ip` / the leftmost hop instead — for a high-volume
 * general limiter the rightmost hop is the shared edge IP, which would collapse
 * all anonymous traffic into a single bucket. See its inline rationale; do NOT
 * unify it with this helper.
 */
export function pickTrustedForwardedIp(xff: string | null | undefined): string | undefined {
  if (!xff) return undefined;
  const parts = xff
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}
