/**
 * @vitest-environment jsdom
 *
 * PG-197: a legacy `/accounts/{id}?edit=true` URL moves to the edit page,
 * but only after auth resolves (no bounce for unauthenticated users).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams('edit=true'),
  auth: { isLoading: false, isAuthenticated: true },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useParams: () => ({ id: 'acc-123' }),
  useSearchParams: () => h.search,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/components/accounts/AccountDetail', () => ({
  AccountDetail: () => <div data-testid="account-detail" />,
}));

import AccountDetailPage from '../page';

describe('AccountDetailPage legacy ?edit=true', () => {
  beforeEach(() => {
    h.replace.mockReset();
    h.search = new URLSearchParams('edit=true');
    h.auth = { isLoading: false, isAuthenticated: true };
  });

  it('redirects to /accounts/{id}/edit once authenticated', () => {
    render(<AccountDetailPage />);
    expect(h.replace).toHaveBeenCalledWith('/accounts/acc-123/edit');
  });

  it('waits while auth is loading', () => {
    h.auth = { isLoading: true, isAuthenticated: false };
    render(<AccountDetailPage />);
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('sends unauthenticated users to login, not to the edit page', () => {
    h.auth = { isLoading: false, isAuthenticated: false };
    render(<AccountDetailPage />);
    expect(h.replace).toHaveBeenCalledWith('/login');
    expect(h.replace).not.toHaveBeenCalledWith('/accounts/acc-123/edit');
  });

  it('does not redirect without the legacy query', () => {
    h.search = new URLSearchParams();
    render(<AccountDetailPage />);
    expect(h.replace).not.toHaveBeenCalled();
  });
});
