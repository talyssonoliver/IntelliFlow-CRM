import { NextResponse } from 'next/server';
import { runServiceChecks } from '@/lib/status/service-checks';

/**
 * Seconds a status answer is shared by every visitor. Next.js regenerates this route at most
 * once per window; in between, the CDN serves the stored JSON with no function run, no call to
 * the API and no call to Supabase. 5 minutes is the shortest window the free hosting budget
 * allows, and short enough that an outage shows up quickly: at most 12 rounds of checks an hour,
 * each round three health requests, whatever the number of visitors.
 *
 * Keep this a literal (Next.js reads it at build time), keep the route free of request-bound
 * APIs (`headers()`, `cookies()`, the request object) and do not set `dynamic = 'force-dynamic'`
 * or `Cache-Control: no-store`: any of them would make every page view run the checks again.
 * The tests pin all of this.
 */
export const revalidate = 300;

/** Live service checks for the public status page (PG-014), shared and cached. */
export async function GET() {
  const services = await runServiceChecks(fetch, {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return NextResponse.json({ services, checkedAt: new Date().toISOString() });
}
