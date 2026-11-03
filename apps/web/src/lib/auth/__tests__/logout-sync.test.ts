import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastLogout, leaveAfterLogout, onLogoutBroadcast } from '@/lib/shared/session-cleanup';
import { watchForLogoutElsewhere } from '../logout-sync';

vi.mock('@/lib/shared/session-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/shared/session-cleanup')>()),
  leaveAfterLogout: vi.fn(),
}));

/** The storage fallback is the path every browser takes in jsdom. */
function otherTabLoggedOut(): void {
  globalThis.dispatchEvent(new StorageEvent('storage', { key: 'logout-event', newValue: '1' }));
}

function restoredFromBackForwardCache(persisted: boolean): void {
  const event = new Event('pageshow') as Event & { persisted: boolean };
  Object.defineProperty(event, 'persisted', { value: persisted });
  globalThis.dispatchEvent(event);
}

describe('watchForLogoutElsewhere', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.mocked(leaveAfterLogout).mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    stop();
  });

  it('leaves the portal when another tab logs out', () => {
    stop = watchForLogoutElsewhere(() => ({ subject: null }));

    otherTabLoggedOut();

    expect(leaveAfterLogout).toHaveBeenCalledWith('/');
  });

  it('leaves a public page alone when another tab logs out', () => {
    stop = watchForLogoutElsewhere(() => null);

    otherTabLoggedOut();

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('stops listening once stopped', () => {
    stop = watchForLogoutElsewhere(() => ({ subject: null }));
    stop();

    otherTabLoggedOut();

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('leaves a logged-in page restored from the back-forward cache with no token', () => {
    stop = watchForLogoutElsewhere(() => ({ subject: null }));

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).toHaveBeenCalledWith('/');
  });

  it('keeps a restored page when the token is still there', () => {
    localStorage.setItem('accessToken', 'still-signed-in');
    stop = watchForLogoutElsewhere(() => ({ subject: null }));

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  const tokenFor = (sub: string) =>
    ['header', Buffer.from(JSON.stringify({ sub })).toString('base64url'), 'signature'].join('.');

  it('leaves a restored page when a different user has signed in since', () => {
    localStorage.setItem('accessToken', tokenFor('user-b'));
    stop = watchForLogoutElsewhere(() => ({ subject: 'user-a' }));

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).toHaveBeenCalledWith('/');
  });

  it('keeps a restored page for the same user', () => {
    localStorage.setItem('accessToken', tokenFor('user-a'));
    stop = watchForLogoutElsewhere(() => ({ subject: 'user-a' }));

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('keeps a restored public page, so visitors keep the back-forward cache', () => {
    stop = watchForLogoutElsewhere(() => null);

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('ignores an ordinary page load', () => {
    stop = watchForLogoutElsewhere(() => ({ subject: null }));

    restoredFromBackForwardCache(false);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('hears the message the logout path really sends', () => {
    const received = vi.fn();
    const channel = new BroadcastChannel('intelliflow-logout');
    channel.addEventListener('message', received);

    broadcastLogout();

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(received).toHaveBeenCalled();
        channel.close();
        stop = () => undefined;
        resolve();
      }, 20);
    });
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('does not treat its own logout broadcast as another tab', async () => {
    const heard = vi.fn();
    stop = onLogoutBroadcast(heard);

    broadcastLogout();
    await wait();

    expect(heard).not.toHaveBeenCalled();
  });

  it('hears a logout broadcast from another tab', async () => {
    const heard = vi.fn();
    stop = onLogoutBroadcast(heard);
    const otherTab = new BroadcastChannel('intelliflow-logout');

    otherTab.postMessage({ type: 'logout', timestamp: 1, tab: 'another-tab' });
    await wait();
    otherTab.close();

    expect(heard).toHaveBeenCalledTimes(1);
  });
});
