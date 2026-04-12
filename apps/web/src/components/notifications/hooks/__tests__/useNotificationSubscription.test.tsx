/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockUseSubscription, mockHandleSubscriptionAuthError, mockUseAuth } = vi.hoisted(() => ({
  mockUseSubscription: vi.fn(),
  mockHandleSubscriptionAuthError: vi.fn(() => false),
  mockUseAuth: vi.fn(() => ({
    isAuthenticated: true,
  })),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    notifications: {
      onNew: {
        useSubscription: mockUseSubscription,
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/lib/trpc/subscription-auth', () => ({
  handleSubscriptionAuthError: mockHandleSubscriptionAuthError,
}));

import { useNotificationSubscription } from '../useNotificationSubscription';

describe('useNotificationSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockHandleSubscriptionAuthError.mockReturnValue(false);
  });

  it('enables the subscription only when the user is authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    renderHook(() => useNotificationSubscription());

    expect(mockUseSubscription).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it('handles auth errors without logging raw websocket errors to the console', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockHandleSubscriptionAuthError.mockReturnValue(true);

    renderHook(() => useNotificationSubscription());

    const [, options] = mockUseSubscription.mock.calls[0];
    const error = { message: 'Authentication required. Please log in to access this resource.' };
    options.onError(error);

    expect(mockHandleSubscriptionAuthError).toHaveBeenCalledWith(
      error,
      'useNotificationSubscription'
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
