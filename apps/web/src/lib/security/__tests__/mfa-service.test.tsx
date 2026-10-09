/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const invalidate = vi.fn(() => Promise.resolve());
  const mutationOptions: Record<string, { onSuccess: () => unknown }> = {};

  const auth = new Proxy(
    {},
    {
      get: (_t, proc) => ({
        useQuery: () => ({ data: undefined }),
        useMutation: (opts: { onSuccess: () => unknown }) => {
          mutationOptions[String(proc)] = opts;
          return { mutate: vi.fn() };
        },
      }),
    }
  );

  return { invalidate, mutationOptions, auth };
});

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ auth: { getMfaStatus: { invalidate: h.invalidate } } }),
    auth: h.auth,
  },
}));

import { useDisableMfa, useRegenerateBackupCodes } from '../mfa-service';

describe('mfa-service mutation hooks', () => {
  beforeEach(() => {
    h.invalidate.mockClear();
  });

  it('useDisableMfa invalidates MFA status on success', () => {
    renderHook(() => useDisableMfa());

    h.mutationOptions.disableMfa.onSuccess();

    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it('useRegenerateBackupCodes invalidates MFA status on success', () => {
    renderHook(() => useRegenerateBackupCodes());

    h.mutationOptions.regenerateBackupCodes.onSuccess();

    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it('useDisableMfa returns the refresh so the mutation stays pending until it finishes', () => {
    const refresh = Promise.resolve();
    h.invalidate.mockReturnValueOnce(refresh);
    renderHook(() => useDisableMfa());

    expect(h.mutationOptions.disableMfa.onSuccess()).toBe(refresh);
  });

  it('useRegenerateBackupCodes returns the refresh so the mutation stays pending', () => {
    const refresh = Promise.resolve();
    h.invalidate.mockReturnValueOnce(refresh);
    renderHook(() => useRegenerateBackupCodes());

    expect(h.mutationOptions.regenerateBackupCodes.onSuccess()).toBe(refresh);
  });
});
