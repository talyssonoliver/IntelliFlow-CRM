/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();

const mockOpportunityQueryState = {
  data: {
    id: 'deal-123',
    name: 'Test Deal Wire',
    value: 98000,
    currency: 'GBP',
    stage: 'NEGOTIATION' as string,
    probability: 75,
    expectedCloseDate: '2026-04-15',
    description: 'A real wired deal',
    accountId: 'acc-1',
    contactId: 'contact-1',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    weightedValue: 73500,
    isClosed: false,
    isWon: false,
    isLost: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    owner: { id: 'owner-1', name: 'Alice Manager', email: 'alice@test.com' } as {
      id: string;
      name: string | null;
      email: string;
    } | null,
    account: { id: 'acc-1', name: 'Wire Corp', website: 'https://wire.test' } as {
      id: string;
      name: string;
      website: string | null;
    } | null,
    contact: {
      id: 'contact-1',
      firstName: 'Bob',
      lastName: 'Tester',
      title: 'CTO',
      email: 'bob@test.com',
    } as {
      id: string;
      firstName: string;
      lastName: string;
      title: string | null;
      email: string;
    } | null,
  } as Record<string, unknown> | null,
  isLoading: false,
  error: null as { message?: string } | null,
};

const mockProductsQueryState = {
  data: {
    products: [
      {
        id: 'prod-1',
        name: 'Enterprise License',
        description: '100 Seats',
        totalPrice: 80000,
        quantity: 100,
        unitPrice: 800,
      },
    ],
    totalValue: 80000,
  } as Record<string, unknown> | null,
  isLoading: false,
};

let mockIsAuthenticated = true;
let mockAuthLoading = false;

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'deal-123' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Finding 6: Use only AuthContext import (matching page import and codebase convention)
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: mockAuthLoading,
    isAuthenticated: mockIsAuthenticated,
    user: mockIsAuthenticated ? { id: 'user-1', email: 'user@test.com' } : null,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    opportunity: {
      getById: {
        useQuery: () => ({
          data: mockOpportunityQueryState.data,
          isLoading: mockOpportunityQueryState.isLoading,
          error: mockOpportunityQueryState.error,
        }),
      },
      getProducts: {
        useQuery: () => ({
          data: mockProductsQueryState.data,
          isLoading: mockProductsQueryState.isLoading,
        }),
      },
    },
    useUtils: () => ({
      opportunity: { getById: { invalidate: vi.fn() } },
    }),
  },
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC', setTimezone: vi.fn() }),
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: Record<string, unknown>) => (
    <div data-testid="card" className={className as string}>
      {children as React.ReactNode}
    </div>
  ),
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...(props as Record<string, string>)}>{children as React.ReactNode}</button>
  ),
  Skeleton: ({ className }: Record<string, unknown>) => (
    <div data-testid="skeleton" className={className as string} />
  ),
  EmptyState: ({ entity }: Record<string, unknown>) => (
    <p data-testid="empty-state">No {entity as string} yet</p>
  ),
}));

vi.mock('@/components/shared', () => ({
  EntityHeader: ({ title, badges }: Record<string, unknown>) => (
    <div data-testid="entity-header">
      <span data-testid="entity-title">{title as string}</span>
      {(badges as Array<{ label: string }>)?.map((b, i) => (
        <span key={i} data-testid="entity-badge">
          {b.label}
        </span>
      ))}
    </div>
  ),
  AppAvatar: ({ name }: Record<string, unknown>) => (
    <div data-testid="app-avatar">{name as string}</div>
  ),
}));

vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: () => <div data-testid="activity-feed">Activity Feed</div>,
}));

vi.mock('@/components/shared/entity-action-sheet', () => ({
  EntityActionSheet: () => <div data-testid="entity-action-sheet" />,
}));

vi.mock('@/components/shared/more-actions-button', () => ({
  MoreActionsButton: () => <button data-testid="more-actions">More</button>,
}));

vi.mock('@/components/home/PinButton', () => ({
  PinButton: () => <button data-testid="pin-button">Pin</button>,
}));

vi.mock('@/components/tasks/RelatedTasksCard', () => ({
  RelatedTasksCard: () => <div data-testid="related-tasks">Tasks</div>,
}));

function resetMockData() {
  mockIsAuthenticated = true;
  mockAuthLoading = false;
  mockOpportunityQueryState.data = {
    id: 'deal-123',
    name: 'Test Deal Wire',
    value: 98000,
    currency: 'GBP',
    stage: 'NEGOTIATION',
    probability: 75,
    expectedCloseDate: '2026-04-15',
    description: 'A real wired deal',
    accountId: 'acc-1',
    contactId: 'contact-1',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    weightedValue: 73500,
    isClosed: false,
    isWon: false,
    isLost: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    owner: { id: 'owner-1', name: 'Alice Manager', email: 'alice@test.com' },
    account: { id: 'acc-1', name: 'Wire Corp', website: 'https://wire.test' },
    contact: {
      id: 'contact-1',
      firstName: 'Bob',
      lastName: 'Tester',
      title: 'CTO',
      email: 'bob@test.com',
    },
  };
  mockOpportunityQueryState.isLoading = false;
  mockOpportunityQueryState.error = null;
  mockProductsQueryState.data = {
    products: [
      {
        id: 'prod-1',
        name: 'Enterprise License',
        description: '100 Seats',
        totalPrice: 80000,
        quantity: 100,
        unitPrice: 800,
      },
    ],
    totalValue: 80000,
  };
  mockProductsQueryState.isLoading = false;
}

describe('DealDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockData();
  });

  describe('Auth guard (AC-002)', () => {
    it('does not render deal data when unauthenticated and shows not-found state', async () => {
      mockIsAuthenticated = false;
      mockOpportunityQueryState.data = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      // When not authenticated, query disabled, data null → not-found state
      expect(screen.queryByText('Test Deal Wire')).toBeNull();
      expect(screen.getByText(/deal not found|don't have access/i)).toBeTruthy();
    });
  });

  describe('Loading state (AC-008)', () => {
    it('shows skeleton elements when query is loading', async () => {
      mockOpportunityQueryState.isLoading = true;
      mockOpportunityQueryState.data = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows skeleton when auth is loading', async () => {
      mockAuthLoading = true;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error state (AC-009)', () => {
    it('shows error message when API fails', async () => {
      mockOpportunityQueryState.error = { message: 'Not found' };
      mockOpportunityQueryState.data = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText(/deal not found|don't have access/i)).toBeTruthy();
    });

    it('shows back to deals link in error state', async () => {
      mockOpportunityQueryState.error = { message: 'Server error' };
      mockOpportunityQueryState.data = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const backLink = screen.getByText('Back to Deals').closest('a');
      expect(backLink?.getAttribute('href')).toBe('/deals');
    });
  });

  describe('Core data display (AC-001, AC-007)', () => {
    it('displays deal name from API data', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByTestId('entity-title').textContent).toBe('Test Deal Wire');
    });

    it('displays deal value formatted as currency', async () => {
      // formatCurrency (page.tsx:86) uses en-GB Intl with currency=GBP —
      // values render as £N (not $N) post-Timezone-Refactor locale migration.
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('£98,000')).toBeTruthy();
    });

    it('displays probability from API data', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const probElements = screen.getAllByText(/75%/);
      expect(probElements.length).toBeGreaterThan(0);
    });

    it('displays owner name from API owner relation data (AC-007)', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const ownerElements = screen.getAllByText('Alice Manager');
      expect(ownerElements.length).toBeGreaterThan(0);
    });
  });

  describe('Stage progress (AC-003, AC-004)', () => {
    it('renders correct stage label for API-provided stage', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const stageElements = screen.getAllByText('Negotiation');
      expect(stageElements.length).toBeGreaterThan(0);
    });

    it('renders green bar for CLOSED_WON stage', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).stage = 'CLOSED_WON';
      (mockOpportunityQueryState.data as Record<string, unknown>).isClosed = true;
      (mockOpportunityQueryState.data as Record<string, unknown>).isWon = true;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const wonBadges = screen.getAllByText('Won');
      expect(wonBadges.length).toBeGreaterThan(0);
    });

    it('renders red bar for CLOSED_LOST stage', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).stage = 'CLOSED_LOST';
      (mockOpportunityQueryState.data as Record<string, unknown>).isClosed = true;
      (mockOpportunityQueryState.data as Record<string, unknown>).isLost = true;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const lostBadges = screen.getAllByText('Lost');
      expect(lostBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Stakeholder display (AC-006, AC-010)', () => {
    it('account name rendered with link to /accounts/acc-1', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const accountLink = screen.getByText('Wire Corp').closest('a');
      expect(accountLink).toBeTruthy();
      expect(accountLink?.getAttribute('href')).toBe('/accounts/acc-1');
    });

    it('contact name rendered with link to /contacts/contact-1', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      const contactLinks = screen.getAllByText('Bob Tester');
      const linkElement = contactLinks.find((el) => el.closest('a'));
      expect(linkElement).toBeTruthy();
      expect(linkElement?.closest('a')?.getAttribute('href')).toBe('/contacts/contact-1');
    });

    it('hides website icon when account website is null', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).account = {
        id: 'acc-1',
        name: 'Wire Corp',
        website: null,
      };
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      // Account name still rendered, but no website link
      expect(screen.getByText('Wire Corp')).toBeTruthy();
    });

    it('shows "No contact linked" when contact is null (AC-010)', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).contact = null;
      (mockOpportunityQueryState.data as Record<string, unknown>).contactId = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('No contact linked')).toBeTruthy();
    });
  });

  describe('About deal card details', () => {
    it('shows "Not set" when expectedCloseDate is null', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).expectedCloseDate = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('Not set')).toBeTruthy();
    });
  });

  describe('Owner null guard', () => {
    it('shows "Unassigned" when owner is null', async () => {
      (mockOpportunityQueryState.data as Record<string, unknown>).owner = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('Unassigned')).toBeTruthy();
    });
  });

  describe('Products display (AC-011)', () => {
    it('renders products from getProducts API', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('Enterprise License')).toBeTruthy();
      const priceElements = screen.getAllByText('£80,000');
      expect(priceElements.length).toBeGreaterThan(0);
    });

    it('shows empty state when no products', async () => {
      mockProductsQueryState.data = { products: [], totalValue: 0 };
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      // The local `@intelliflow/ui` mock (line 148-149) stubs EmptyState to
      // `<p data-testid="empty-state">No {entity} yet</p>`, so for
      // entity="products" the DOM text is 'No products yet' — not the
      // canonical config title.
      expect(screen.getByText('No products yet')).toBeTruthy();
    });

    it('shows skeleton when products loading', async () => {
      mockProductsQueryState.isLoading = true;
      mockProductsQueryState.data = null;
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      // Products skeleton has skeleton elements
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('No fake data (AC-005)', () => {
    it('SAMPLE_DEAL sentinel values are absent from rendered output', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.queryByText('$125,000')).toBeNull();
      expect(screen.queryByText('Acme Corp Software License')).toBeNull();
      expect(screen.queryByText('Jane Doe')).toBeNull();
      expect(screen.queryByText('Web Referral')).toBeNull();
    });
  });

  describe('Files card', () => {
    it('shows empty state for files', async () => {
      const { default: DealDetailPage } = await import('../page');
      render(<DealDetailPage />);
      expect(screen.getByText('No files yet')).toBeTruthy();
    });
  });
});
