/**
 * Personal data download page — PG-203 DSAR (spec Addendum A).
 *
 * /dsar/<handle>/export#r=<request id>.<token>. The token lives in the URL fragment, which
 * is never sent to a server; DsarExportContent reads it once and strips it. Never indexed.
 */
import type { Metadata } from 'next';
import DsarExportContent from './DsarExportContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Your personal data',
    robots: { index: false, follow: false },
  };
}

export default function DsarExportPage() {
  return <DsarExportContent />;
}
