/**
 * Deal Pipeline Test Utilities (PG-135)
 *
 * Factory functions and test helpers for deal component tests.
 * Follows contact-test-utils.tsx pattern.
 */

import * as React from 'react';
import { vi } from 'vitest';
import { render, type RenderResult } from '@testing-library/react';
import type { Deal, PipelineStats, DealFiltersValue, OpportunityStage } from '../types';

// ─── Deal Factory ────────────────────────────────────────────────────────────

export function createMockDeal(overrides?: Partial<Deal>): Deal {
  return {
    id: 'deal-001',
    name: 'Enterprise License - Acme Corp',
    value: 75000,
    stage: 'QUALIFICATION' as OpportunityStage,
    probability: 40,
    expectedCloseDate: '2026-03-15',
    accountName: 'Acme Corporation',
    contactName: 'John Doe',
    ownerId: 'user-1',
    ownerName: 'Jane Smith',
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

export function createMockDeals(count: number, stage?: OpportunityStage): Deal[] {
  const stages: OpportunityStage[] = [
    'PROSPECTING',
    'QUALIFICATION',
    'NEEDS_ANALYSIS',
    'PROPOSAL',
    'NEGOTIATION',
    'CLOSED_WON',
    'CLOSED_LOST',
  ];

  return Array.from({ length: count }, (_, i) =>
    createMockDeal({
      id: `deal-${String(i + 1).padStart(3, '0')}`,
      name: `Deal ${i + 1}`,
      value: (i + 1) * 10000,
      stage: stage ?? stages[i % stages.length],
      probability: 20 + i * 10,
      accountName: `Company ${i + 1}`,
      contactName: i % 3 === 0 ? null : `Contact ${i + 1}`,
      ownerId: `user-${(i % 3) + 1}`,
      ownerName: `Owner ${(i % 3) + 1}`,
    })
  );
}

// ─── Stats Factory ───────────────────────────────────────────────────────────

export function createMockPipelineStats(overrides?: Partial<PipelineStats>): PipelineStats {
  return {
    totalDeals: 12,
    totalValue: 450000,
    weightedValue: 225000,
    wonValue: 50000,
    ...overrides,
  };
}

// ─── Filter Factory ──────────────────────────────────────────────────────────

export function createMockDealFilters(overrides?: Partial<DealFiltersValue>): DealFiltersValue {
  return {
    ownerId: undefined,
    dateRange: undefined,
    ...overrides,
  };
}

// ─── DnD Test Helpers ────────────────────────────────────────────────────────

// Mock DndContext for testing components that use @dnd-kit
const MockDndContext = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="mock-dnd-context">{children}</div>
);

export function renderWithDndContext(ui: React.ReactElement): RenderResult {
  return render(<MockDndContext>{ui}</MockDndContext>);
}

// ─── tRPC Mock Helpers ───────────────────────────────────────────────────────

export function mockOpportunityRouter() {
  const mockRefetch = vi.fn();
  const mockMutate = vi.fn();
  const mockMoveStage = vi.fn();

  return {
    mockRefetch,
    mockMutate,
    mockMoveStage,
    trpcMock: {
      opportunity: {
        list: {
          useQuery: vi.fn(() => ({
            data: undefined,
            isLoading: false,
            isError: false,
            error: null,
            refetch: mockRefetch,
          })),
        },
        update: {
          useMutation: vi.fn(() => ({
            mutate: mockMutate,
            isLoading: false,
          })),
        },
        moveStage: {
          useMutation: vi.fn(() => ({
            mutate: mockMoveStage,
            isPending: false,
          })),
        },
      },
    },
  };
}

// ─── Mock Handlers ───────────────────────────────────────────────────────────

export function createMockHandlers() {
  return {
    onStageChange: vi.fn(),
    onDealNavigate: vi.fn(),
    onNavigate: vi.fn(),
    onChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onClose: vi.fn(),
    onNavigateToDetail: vi.fn(),
  };
}
