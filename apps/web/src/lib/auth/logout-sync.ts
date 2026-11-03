/**
 * Takes a page out of the portal when the session ended somewhere it could not see:
 * - another tab logged out, and this tab still has personal data on screen;
 * - the browser restored this page from its back-forward cache after logout, which
 *   brings the old page back without asking the server.
 *
 * Public pages are left alone, so a visitor keeps the back-forward cache.
 *
 * @param isAuthenticated whether this page currently shows a logged-in user
 * @returns stops watching
 */
import { leaveAfterLogout, onLogoutBroadcast } from '@/lib/shared/session-cleanup';

export function watchForLogoutElsewhere(isAuthenticated: () => boolean): () => void {
  const stopListening = onLogoutBroadcast(() => {
    if (isAuthenticated()) leaveAfterLogout('/');
  });

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && isAuthenticated() && !localStorage.getItem('accessToken')) {
      leaveAfterLogout('/');
    }
  };
  globalThis.addEventListener('pageshow', onPageShow);

  return () => {
    stopListening();
    globalThis.removeEventListener('pageshow', onPageShow);
  };
}
