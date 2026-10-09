import { afterEach, describe, expect, it, vi } from 'vitest';

const invalidateTicketsCache = vi.fn();
vi.mock('@/app/tickets/actions', () => ({
  invalidateTicketsCache: (...args: unknown[]) => invalidateTicketsCache(...args),
}));

import { revalidateTicketsCache } from '../revalidate-tickets-cache';

describe('revalidateTicketsCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invalidateTicketsCache.mockReset();
  });

  it('awaits the server action without logging when it succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invalidateTicketsCache.mockResolvedValue(undefined);

    await expect(revalidateTicketsCache()).resolves.toBeUndefined();

    expect(invalidateTicketsCache).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs the failure and still resolves when the server action rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('revalidate boom');
    invalidateTicketsCache.mockRejectedValue(failure);

    await expect(revalidateTicketsCache()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith('Failed to revalidate the tickets cache:', failure);
  });
});
