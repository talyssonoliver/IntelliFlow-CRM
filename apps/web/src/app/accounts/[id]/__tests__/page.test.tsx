import { describe, it, expect, vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({ id: 'acc-123' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/accounts/acc-123',
}));

// Mock auth - authenticated state
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'test@test.com' },
  }),
}));

// Mock AccountDetail component
vi.mock('@/components/accounts/AccountDetail', () => ({
  AccountDetail: ({ accountId }: { accountId: string }) => (
    <div data-testid="account-detail">Account: {accountId}</div>
  ),
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe('AccountDetailPage', () => {
  it('should export a default page component', async () => {
    const mod = await import('../page');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('should render AccountDetail with correct accountId when authenticated', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../page');

    render(<mod.default />);

    const detail = screen.getByTestId('account-detail');
    expect(detail).toBeDefined();
    expect(screen.getByText('Account: acc-123')).toBeDefined();
  });
});

describe('AccountDetailPage - loading state', () => {
  it('should show skeletons when auth is loading', async () => {
    // Override auth mock for this test
    vi.doMock('@/lib/auth/AuthContext', () => ({
      useRequireAuth: () => ({
        isLoading: true,
        isAuthenticated: false,
        user: null,
      }),
    }));

    // Force re-import
    vi.resetModules();

    // Re-mock dependencies needed after resetModules
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
        refresh: vi.fn(),
      }),
      useParams: () => ({ id: 'acc-123' }),
      useSearchParams: () => new URLSearchParams(),
      usePathname: () => '/accounts/acc-123',
    }));

    vi.doMock('@/components/accounts/AccountDetail', () => ({
      AccountDetail: () => <div data-testid="account-detail" />,
    }));

    vi.doMock('@intelliflow/ui', () => ({
      Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div data-testid="card" className={className}>
          {children}
        </div>
      ),
      Skeleton: ({ className }: { className: string }) => (
        <div data-testid="skeleton" className={className} />
      ),
    }));

    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../page');

    render(<mod.default />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
