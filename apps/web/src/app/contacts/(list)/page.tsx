/**
 * Contacts List Page — Server Component Shell
 *
 * Reads the auth token server-side (outside cache boundary),
 * prefetches the first page of contacts via cached query, then
 * renders the full interactive list as a client island.
 */

import { getAccessToken } from '@/lib/trpc-server';
import { fetchContactsFirstPage } from '@/lib/cached-queries/contact-queries';
import ContactsPageClient from './ContactsPageClient';

export default async function ContactsPage() {
  const token = await getAccessToken();

  // Prefetch first page of contacts — cached for 60s via 'use cache'.
  // Errors are non-fatal: the client island will fetch on its own.
  // JSON roundtrip converts Date→string to match client-side tRPC wire format.
  let initialData: unknown = null;
  try {
    const raw = await fetchContactsFirstPage(token);
    initialData = JSON.parse(JSON.stringify(raw));
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <ContactsPageClient initialData={initialData} />;
}
