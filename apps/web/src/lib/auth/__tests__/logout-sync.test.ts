import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastLogout, leaveAfterLogout } from '@/lib/shared/session-cleanup';
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
    stop = watchForLogoutElsewhere(() => true);

    otherTabLoggedOut();

    expect(leaveAfterLogout).toHaveBeenCalledWith('/');
  });

  it('leaves a public page alone when another tab logs out', () => {
    stop = watchForLogoutElsewhere(() => false);

    otherTabLoggedOut();

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('stops listening once stopped', () => {
    stop = watchForLogoutElsewhere(() => true);
    stop();

    otherTabLoggedOut();

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('leaves a logged-in page restored from the back-forward cache with no token', () => {
    stop = watchForLogoutElsewhere(() => true);

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).toHaveBeenCalledWith('/');
  });

  it('keeps a restored page when the token is still there', () => {
    localStorage.setItem('accessToken', 'still-signed-in');
    stop = watchForLogoutElsewhere(() => true);

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('keeps a restored public page, so visitors keep the back-forward cache', () => {
    stop = watchForLogoutElsewhere(() => false);

    restoredFromBackForwardCache(true);

    expect(leaveAfterLogout).not.toHaveBeenCalled();
  });

  it('ignores an ordinary page load', () => {
    stop = watchForLogoutElsewhere(() => true);

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
});
