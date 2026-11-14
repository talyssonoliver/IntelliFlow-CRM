import { NextResponse } from 'next/server';
import { runServiceChecks } from '@/lib/status/service-checks';

export const dynamic = 'force-dynamic';

/**
 * Live service checks for the public status page (PG-014). Runs on each
 * request; nothing is stored or cached, so every answer is a fresh measurement.
 */
export async function GET() {
  const services = await runServiceChecks(fetch, {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return NextResponse.json(
    { services, checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
