// @vitest-environment jsdom
/**
 * NotificationBell: opening the popover must refresh the notification list and
 * the unread count so the cached data shown instantly is re-validated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/trpc', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { trpc: trpcCaptureClient };
});
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 'user-1' } }),
}));
vi.mock('../hooks/useNotificationSubscription', () => ({
  useNotificationSubscription: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/notifications/actions', () => ({
  revalidateNotifications: vi.fn().mockResolvedValue(undefined),
  revalidateActivityFeed: vi.fn().mockResolvedValue(undefined),
}));
// Expose onOpenChange through a button so the test can open the popover.
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Popover: ({ children, onOpenChange }: any) => (
    <div>
      <button data-testid="open-popover" onClick={() => onOpenChange(true)} />
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

import { NotificationBell } from '../NotificationBell';

describe('NotificationBell popover open', () => {
  beforeEach(() => {
    capture.reset();
  });

  it('invalidates list and unread count when the popover opens', () => {
    render(<NotificationBell />);
    expect(capture.invalidations).toEqual([]);

    fireEvent.click(screen.getByTestId('open-popover'));

    expect(capture.invalidations).toEqual(
      expect.arrayContaining(['notifications.list', 'notifications.getUnreadCount'])
    );
  });

  it('logs instead of leaving an unhandled rejection when the refresh on open fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('refetch failed');
    capture.invalidateError = boom;
    render(<NotificationBell />);

    fireEvent.click(screen.getByTestId('open-popover'));

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[NotificationBell] Failed to refresh notifications:',
        boom
      )
    );
    errorSpy.mockRestore();
  });
});
