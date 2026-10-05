/**
 * @vitest-environment jsdom
 */
/**
 * Case detail page: every mutation's onSuccess must RETURN the invalidation
 * promise so TanStack Query keeps the mutation pending until fresh data has
 * been refetched.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock('@/components/cases', () => ({
  CaseDetail: () => <div data-testid="case-detail" />,
}));

import CaseDetailPage from '../page';

const FULL_REFRESH = ['cases.getById', 'cases.list', 'cases.stats'];

describe('CaseDetailPage mutation onSuccess', () => {
  beforeEach(() => {
    capture.reset();
    render(<CaseDetailPage />);
  });

  it.each(['update', 'changeStatus', 'close'])(
    'cases.%s returns the refresh of the case, the list and the stats',
    async (name) => {
      const result = capture.mutations[`cases.${name}`].onSuccess?.();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(capture.invalidations).toEqual(FULL_REFRESH);
    }
  );

  it.each(['addTask', 'completeTask', 'removeTask'])(
    'cases.%s returns the refresh of the case only',
    async (name) => {
      const result = capture.mutations[`cases.${name}`].onSuccess?.();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(capture.invalidations).toEqual(['cases.getById']);
    }
  );
});
