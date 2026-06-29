/**
 * Team Settings Page Tests
 *
 * Task: IFC-234 — Settings Pages Wiring
 * Tests that the team page renders real data from trpc.user.list.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock auth
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1' },
  }),
}));

// Mock tRPC — controlled per test via module-level mutable refs
let mockListData:
  | { users: Array<{ id: string; name: string; email: string; avatarUrl: string | null }> }
  | undefined = undefined;
let mockIsLoading = false;
let mockIsError = false;
const mockRefetch = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: {
      list: {
        useQuery: () => ({
          data: mockListData,
          isLoading: mockIsLoading,
          isError: mockIsError,
          refetch: mockRefetch,
        }),
      },
    },
    useUtils: () => ({}),
  },
}));

// Mock next/navigation (PageHeader uses Link)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/team',
}));

// Must be imported AFTER mocks are hoisted by vitest
import TeamPage from '../page';

describe('TeamPage', () => {
  beforeEach(() => {
    mockListData = undefined;
    mockIsLoading = false;
    mockIsError = false;
    mockRefetch.mockReset();
  });

  it('renders a loading skeleton while data is fetching', () => {
    mockIsLoading = true;
    render(<TeamPage />);
    // Loading skeleton renders with aria-busy="true"
    expect(screen.getByTestId('team-loading')).toBeInTheDocument();
  });

  it('renders real user names from the API response', () => {
    mockListData = {
      users: [
        { id: 'u1', name: 'Alice Smith', email: 'alice@example.com', avatarUrl: null },
        { id: 'u2', name: 'Bob Jones', email: 'bob@example.com', avatarUrl: null },
      ],
    };
    render(<TeamPage />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('does NOT render hardcoded fake names', () => {
    mockListData = {
      users: [{ id: 'u1', name: 'Alice Smith', email: 'alice@example.com', avatarUrl: null }],
    };
    render(<TeamPage />);
    expect(screen.queryByText('Alex Johnson')).not.toBeInTheDocument();
    expect(screen.queryByText('Jane Anderson')).not.toBeInTheDocument();
    expect(screen.queryByText('Mike Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Sarah Wilson')).not.toBeInTheDocument();
  });

  it('shows empty state when no users are returned', () => {
    mockListData = { users: [] };
    render(<TeamPage />);
    // EmptyState (legacy icon mode) renders the team-specific title
    expect(screen.getByText('No team members yet')).toBeInTheDocument();
  });

  it('shows error state with a retry button on query failure', () => {
    mockIsError = true;
    render(<TeamPage />);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    retryBtn.click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('derives member count from real data, not a hardcoded value', () => {
    mockListData = {
      users: [
        { id: 'u1', name: 'Alice Smith', email: 'alice@example.com', avatarUrl: null },
        { id: 'u2', name: 'Bob Jones', email: 'bob@example.com', avatarUrl: null },
        { id: 'u3', name: 'Carol White', email: 'carol@example.com', avatarUrl: null },
      ],
    };
    render(<TeamPage />);
    // Member count badge should show 3
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });
});
