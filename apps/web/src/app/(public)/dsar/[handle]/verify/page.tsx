/**
 * Data request confirmation page — PG-203 DSAR (spec Addendum A).
 *
 * /dsar/<handle>/verify#r=<request id>.<token>. The token lives in the URL fragment, which
 * is never sent to a server; DsarVerifyContent reads it once and strips it. Never indexed.
 */
import type { Metadata } from 'next';
import DsarVerifyContent from './DsarVerifyContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Confirm your data request',
    robots: { index: false, follow: false },
  };
}

export default function DsarVerifyPage() {
  return <DsarVerifyContent />;
}
