/**
 * Personal data transfer page — IFC-317 (UK GDPR Art 20(2)).
 *
 * /dsar/transfer#t=<token>. The token lives in the URL fragment, which is never sent to a server,
 * so the path carries no firm, request or person; DsarTransferContent reads it once and strips
 * it. The page itself does no server work (no `force-dynamic`, no data fetch, no search
 * params) and is never indexed; the /dsar/:path*
 * headers in next.config.js already send no Referer and forbid caching.
 */
import type { Metadata } from 'next';
import DsarTransferContent from './DsarTransferContent';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Personal data sent to you',
    robots: { index: false, follow: false },
  };
}

export default function DsarTransferPage() {
  return <DsarTransferContent />;
}
