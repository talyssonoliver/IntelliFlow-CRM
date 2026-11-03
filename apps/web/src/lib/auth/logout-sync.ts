/**
 * Takes a page out of the portal when the session ended somewhere it could not see:
 * - another tab logged out, and this tab still has personal data on screen;
 * - the browser restored this page from its back-forward cache after logout, or after a
 *   different user signed in, which brings the old page back without asking the server.
 *
 * Public pages are left alone, so a visitor keeps the back-forward cache.
 *
 * @param pageSession who this page is logged in as, or null on a page with no logged-in user
 * @returns stops watching
 */
import { leaveAfterLogout, onLogoutBroadcast } from '@/lib/shared/session-cleanup';
import { decodeJwtPayload } from './jwt';

export interface PageSession {
  /** The token subject when the page logged in, if it could be read. */
  subject: string | null;
}

export function watchForLogoutElsewhere(pageSession: () => PageSession | null): () => void {
  const stopListening = onLogoutBroadcast(() => {
    if (pageSession()) leaveAfterLogout('/');
  });

  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    const session = pageSession();
    if (!session) return;

    const token = localStorage.getItem('accessToken');
    const otherUser = session.subject && token && decodeJwtPayload(token)?.sub !== session.subject;
    if (!token || otherUser) leaveAfterLogout('/');
  };
  globalThis.addEventListener('pageshow', onPageShow);

  return () => {
    stopListening();
    globalThis.removeEventListener('pageshow', onPageShow);
  };
}
