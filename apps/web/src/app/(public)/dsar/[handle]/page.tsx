/**
 * Public data request page — PG-203 DSAR (owner ruling Q16; spec Addendum A).
 *
 * /dsar/<firm booking handle>. Server shell only: the form is the DsarRequestContent client
 * component, which talks to the privacy tRPC router. The page is never indexed and its title
 * is generic, so the response reveals nothing about whether a handle exists.
 */
import type { Metadata } from 'next';
import DsarRequestContent from './DsarRequestContent';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Make a data request',
    robots: { index: false, follow: false },
  };
}

export default async function DsarRequestPage({
  params,
}: Readonly<{ params: Promise<{ handle: string }> }>) {
  const { handle } = await params;
  return <DsarRequestContent handle={handle} />;
}
