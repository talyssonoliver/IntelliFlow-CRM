import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the Next.js web app.
 *
 * Mirrors the API server's `/healthz` liveness shape ({ status, uptime,
 * timestamp }; see apps/api/src/health.ts) so the same monitoring contract
 * applies to both services. Deliberately dependency-free — it must report
 * "up" whenever the Node process is serving requests, without touching the
 * DB or Supabase (Railway/k8s restart the container when this fails, so a
 * transient DB blip must not take the web app down).
 *
 * Also consumed by the no-backend E2E smoke gate
 * (tests/e2e/smoke.spec.ts > "API Health"), which asserts a 200 JSON
 * response carrying a `status` field.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
