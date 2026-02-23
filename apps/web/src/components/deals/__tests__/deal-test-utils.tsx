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

// ─── Forecast Factories (PG-131) ────────────────────────────────────────────

import type {
  RiskFactor,
  Recommendation,
  HistoryPoint,
  DealForecastResponse,
} from '../forecast/types';

export function createMockRiskFactor(overrides?: Partial<RiskFactor>): RiskFactor {
  return {
    id: 'risk-001',
    factor: 'Probability below stage default',
    severity: 'high',
    description: 'Current 40% vs 60% PROPOSAL default',
    impact: '20 points below expected',
    ...overrides,
  };
}

export function createMockRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec-001',
    action: 'SCHEDULE_CALL',
    title: 'Schedule follow-up call',
    description: 'Schedule follow-up call to qualify deal status',
    priority: 'high',
    ...overrides,
  };
}

export function createMockHistoryPoint(overrides?: Partial<HistoryPoint>): HistoryPoint {
  return {
    date: '2026-02-15',
    probability: 60,
    event: 'Stage → Proposal',
    ...overrides,
  };
}

export function createMockDealForecastResponse(
  overrides?: Partial<DealForecastResponse>
): DealForecastResponse {
  return {
    deal: {
      id: 'deal-001',
      name: 'Acme Corp Enterprise',
      stage: 'PROPOSAL' as OpportunityStage,
      probability: 55,
      value: 120000,
      expectedCloseDate: '2026-03-15',
      owner: { name: 'Jane Smith', avatar: 'JS' },
      account: { name: 'Acme Corporation' },
      contact: { name: 'John Doe', title: 'CTO' },
    },
    riskFactors: [
      createMockRiskFactor(),
      createMockRiskFactor({
        id: 'risk-002',
        factor: 'Activity gap',
        severity: 'medium',
        description: 'Last activity was 18 days ago',
        impact: 'No recent engagement',
      }),
    ],
    recommendations: [
      createMockRecommendation(),
      createMockRecommendation({
        id: 'rec-002',
        action: 'SEND_EMAIL',
        title: 'Send follow-up email',
        description: 'Send follow-up email or schedule call with contact',
        priority: 'medium',
      }),
    ],
    history: [
      createMockHistoryPoint({ date: '2026-02-01', probability: 20, event: 'Stage → Qualification' }),
      createMockHistoryPoint({ date: '2026-02-10', probability: 40, event: 'Stage → Needs Analysis' }),
      createMockHistoryPoint({ date: '2026-02-15', probability: 60, event: 'Stage → Proposal' }),
    ],
    confidence: 0.75,
    lastActivityAt: '2026-02-04T14:30:00Z',
    stageDefault: 60,
    ...overrides,
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
