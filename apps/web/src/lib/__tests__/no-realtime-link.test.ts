/**
 * The HTTP-only tRPC client (no NEXT_PUBLIC_WS_URL) must not error on a
 * subscription: that error crashed every page with a live-update hook into the
 * error boundary (nightly E2E, /agent-approvals and /leads).
 */
import { describe, it, expect, vi } from 'vitest';
import { createTRPCClient, httpBatchLink, splitLink } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api-client';
import { noRealtimeLink } from '../no-realtime-link';

const fetchSpy = vi.fn();
const httpOnly = () =>
  httpBatchLink({ url: 'http://api.example.invalid/api/trpc', fetch: fetchSpy as never });

function subscribe(client: ReturnType<typeof createTRPCClient<AppRouter>>) {
  return new Promise<{ completed: boolean; error?: unknown }>((resolve) => {
    // A subscription a page mounts for live updates.
    (client as any).notifications.onNew.subscribe(
      {},
      {
        onError: (error: unknown) => resolve({ completed: false, error }),
        onComplete: () => resolve({ completed: true }),
      }
    );
  });
}

describe('noRealtimeLink', () => {
  it('reproduces the crash cause: a bare httpBatchLink THROWS on subscribe', async () => {
    // Synchronously — it never reaches the hook's onError, which is why it
    // escaped into React's error boundary instead of being handled.
    const client = createTRPCClient<AppRouter>({ links: [httpOnly()] });
    // A rejection here (not a resolved { error }) means onError was bypassed.
    await expect(subscribe(client)).rejects.toThrow(/Subscriptions are unsupported/);
  });

  it('completes subscriptions quietly and sends nothing over HTTP', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: noRealtimeLink,
          false: httpOnly(),
        }),
      ],
    });

    const result = await subscribe(client);

    expect(result).toEqual({ completed: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
