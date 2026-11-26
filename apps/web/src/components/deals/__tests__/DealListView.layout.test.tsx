/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  data: undefined as unknown,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/app/deals/actions', () => ({ revalidateDealCaches: vi.fn() }));
vi.mock('@/components/shared', () => ({ SearchFilterBar: () => null }));
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ emptyMessage }: any) => <div data-testid="deal-table">{emptyMessage}</div>,
  TableRowActions: () => null,
  ConfirmationDialog: () => null,
  StatusSelectDialog: () => null,
  Skeleton: () => null,
  toast: vi.fn(),
}));
vi.mock('@/lib/trpc', () => {
  const mutation = () => ({ useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) });
  return {
    trpc: {
      useUtils: () => ({
        opportunity: { list: { invalidate: vi.fn() }, stats: { invalidate: vi.fn() } },
      }),
      opportunity: {
        list: {
          useQuery: () => ({
            data: state.data,
            isLoading: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          }),
        },
        update: mutation(),
        delete: mutation(),
        bulkUpdateStage: mutation(),
        bulkDelete: mutation(),
      },
    },
  };
});

import { DealListView } from '../DealListView';

const list = (n: number) => ({
  total: n,
  opportunities: Array.from({ length: n }, (_, i) => ({
    id: `deal-${i}`,
    name: `Deal ${i}`,
    value: 1000,
    stage: 'PROPOSAL',
    probability: 60,
    expectedCloseDate: null,
    account: { name: 'Acme' },
    contact: null,
    ownerId: 'u1',
    owner: { name: 'Owner' },
    createdAt: '2026-11-01T00:00:00.000Z',
  })),
});

function phone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as never;
}

afterEach(() => {
  // jsdom has no matchMedia by default
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('DealListView layout (MVP-012 #43)', () => {
  it('on a phone shows a card per deal, with the stage and probability, instead of the table', () => {
    state.data = list(2);
    phone(true);
    render(<DealListView />);
    expect(screen.queryByTestId('deal-table')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByText('Proposal')).toHaveLength(2);
    expect(screen.getAllByText('60%')).toHaveLength(2);
  });

  it('from md up keeps the table', () => {
    state.data = list(2);
    phone(false);
    render(<DealListView />);
    expect(screen.getByTestId('deal-table')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Deals' })).toBeNull();
  });

  it('on a phone with no deals still shows the empty state', () => {
    state.data = list(0);
    phone(true);
    render(<DealListView />);
    expect(screen.getByTestId('deal-table')).toBeInTheDocument();
  });
});

vi.mock('@/lib/format/useTenantCurrency', () => ({ useTenantCurrency: () => 'GBP' }));
