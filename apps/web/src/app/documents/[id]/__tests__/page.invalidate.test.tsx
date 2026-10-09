/**
 * Document detail page - sign/approve mutations return their cache
 * invalidation so the mutation stays pending until fresh data has loaded
 * (SonarCloud S9383: no floating promises in mutation callbacks).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const invalidate = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({
  sign: undefined as { onSuccess?: () => unknown } | undefined,
  approve: undefined as { onSuccess?: () => unknown } | undefined,
}));
const stable = vi.hoisted(() => ({
  getById: { data: undefined, isLoading: true, error: null },
  audit: { data: undefined },
  signed: { data: undefined },
  utils: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'doc-42' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    documents: {
      getById: { useQuery: () => stable.getById },
      getAuditTrail: { useQuery: () => stable.audit },
      getSignedUrl: { useQuery: () => stable.signed },
      sign: {
        useMutation: (opts: { onSuccess?: () => unknown }) => {
          captured.sign = opts;
          return { isPending: false, mutate: vi.fn() };
        },
      },
      approve: {
        useMutation: (opts: { onSuccess?: () => unknown }) => {
          captured.approve = opts;
          return { isPending: false, mutate: vi.fn() };
        },
      },
    },
    useUtils: () => stable.utils,
  },
}));

vi.mock('@/components/shared/app-avatar', () => ({ AppAvatar: () => null }));
vi.mock('@/components/shared/activity-feed', () => ({ ActivityFeed: () => null }));

import DocumentDetailPage from '../page';

describe('DocumentDetailPage mutation callbacks', () => {
  beforeEach(() => {
    invalidate.mockReset();
    captured.sign = undefined;
    captured.approve = undefined;
    stable.utils = { documents: { getById: { invalidate } } };
  });

  it('sign onSuccess returns the getById invalidation', () => {
    const pending = Promise.resolve();
    invalidate.mockReturnValue(pending);
    render(<DocumentDetailPage />);

    expect(captured.sign?.onSuccess?.()).toBe(pending);
    expect(invalidate).toHaveBeenCalledWith({ id: 'doc-42' });
  });

  it('approve onSuccess returns the getById invalidation', () => {
    const pending = Promise.resolve();
    invalidate.mockReturnValue(pending);
    render(<DocumentDetailPage />);

    expect(captured.approve?.onSuccess?.()).toBe(pending);
    expect(invalidate).toHaveBeenCalledWith({ id: 'doc-42' });
  });
});
