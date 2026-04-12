/**
 * Ticket Components Test Utilities (PG-137)
 *
 * Shared mocks, factories, and helpers for ticket component tests.
 */

import { vi } from 'vitest';
import type {
  TicketListItem,
  TicketDetailData,
  TicketActivity,
  TicketStats,
  TicketFilterOptions,
  TicketCustomer,
  TicketAccount,
  TicketNextStep,
  TicketRelated,
  TicketSLA,
  TicketAIInsights,
  TicketAttachment,
} from '../types';

// ─── Ticket List Item Factory ───────────────────────────────────────────────

export function createMockTicket(overrides?: Partial<TicketListItem>): TicketListItem {
  return {
    id: 'ticket-001',
    ticketNumber: 'T-10924',
    subject: 'System Outage: West Region',
    status: 'OPEN',
    priority: 'CRITICAL',
    slaStatus: 'BREACHED',
    slaTimeRemaining: -134,
    slaResponseDue: new Date('2026-02-10T16:00:00Z'),
    slaResolutionDue: new Date('2026-02-10T20:00:00Z'),
    contactName: 'Robert Chen',
    contactEmail: 'r.chen@acmecorp.com',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'SJ',
    category: 'Technical Issue',
    channel: 'email',
    createdAt: '2 hours ago',
    updatedAt: '10 mins ago',
    ...overrides,
  };
}

export function createMockTicketList(count: number): TicketListItem[] {
  const statuses = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  const slaStatuses = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'] as const;

  return Array.from({ length: count }, (_, i) =>
    createMockTicket({
      id: `ticket-${String(i + 1).padStart(3, '0')}`,
      ticketNumber: `T-${10900 + i}`,
      subject: `Test Ticket ${i + 1}`,
      status: statuses[i % statuses.length],
      priority: priorities[i % priorities.length],
      slaStatus: slaStatuses[i % slaStatuses.length],
      slaTimeRemaining: (i % 2 === 0 ? 1 : -1) * (60 + i * 30),
      contactName: `Contact ${i + 1}`,
      contactEmail: `contact${i + 1}@example.com`,
      assignee: i % 3 === 0 ? null : `Agent ${i + 1}`,
      assigneeAvatar: i % 3 === 0 ? null : `A${i + 1}`,
    })
  );
}

// ─── Activity Factory ───────────────────────────────────────────────────────

export function createMockActivity(overrides?: Partial<TicketActivity>): TicketActivity {
  return {
    id: 'activity-1',
    type: 'customer_message',
    author: {
      name: 'David Kim',
      role: 'customer',
      avatar: undefined,
    },
    content: 'We are experiencing issues with the dashboard.',
    timestamp: 'Yesterday at 4:30 PM',
    ...overrides,
  };
}

export function createMockActivityList(count: number): TicketActivity[] {
  const types: TicketActivity['type'][] = [
    'customer_message',
    'agent_reply',
    'internal_note',
    'system_event',
    'sla_breach',
    'priority_change',
  ];

  return Array.from({ length: count }, (_, i) =>
    createMockActivity({
      id: `activity-${i + 1}`,
      type: types[i % types.length],
      author: {
        name: i % 2 === 0 ? 'Customer' : 'Agent',
        role: i % 2 === 0 ? 'customer' : 'agent',
      },
      content: `Activity content ${i + 1}`,
      timestamp: `${i + 1} hours ago`,
    })
  );
}

// ─── Detail Data Factory ────────────────────────────────────────────────────

export function createMockCustomer(overrides?: Partial<TicketCustomer>): TicketCustomer {
  return {
    id: 'customer-1',
    name: 'David Kim',
    email: 'd.kim@solartech.com',
    phone: '+1 (555) 123-4567',
    title: 'Tech Lead',
    company: 'SolarTech Inc',
    isVIP: true,
    totalTickets: 12,
    ...overrides,
  };
}

export function createMockTicketDetail(overrides?: Partial<TicketDetailData>): TicketDetailData {
  const base = createMockTicket();
  return {
    ...base,
    description: 'Customer reported inability to access the dashboard. Error 503 persisting.',
    tags: ['Outage', 'West Region', 'P1'],
    type: 'Incident',
    customer: createMockCustomer(),
    account: {
      id: 'acc-456',
      name: 'SolarTech Inc',
      industry: 'Technology',
      tier: 'Enterprise',
    } as TicketAccount,
    assigneeInfo: {
      name: 'Sarah Jenkins',
      title: 'Senior Support Engineer',
    },
    activities: createMockActivityList(4),
    nextSteps: [
      {
        id: '1',
        title: 'Verify DB cluster fix deployment',
        dueDate: 'Due in 1 hour',
        completed: false,
      },
      {
        id: '2',
        title: 'Confirm with customer resolution',
        dueDate: 'Due Today',
        completed: false,
      },
      { id: '3', title: 'Document root cause', dueDate: 'Tomorrow', completed: false },
    ] as TicketNextStep[],
    relatedTickets: [
      { id: 'T-10890', subject: 'Slow dashboard loading', status: 'RESOLVED', similarity: 85 },
      { id: 'T-10756', subject: 'Database timeout errors', status: 'RESOLVED', similarity: 72 },
    ] as TicketRelated[],
    sla: {
      firstResponse: { target: 30, actual: 15, met: true },
      resolution: { target: 240, remaining: -134, status: 'BREACHED' },
    } as TicketSLA,
    aiInsights: {
      suggestedSolutions: [
        'Check DB cluster replication status',
        'Verify load balancer health checks',
      ],
      sentiment: 'negative',
      predictedResolutionTime: '2-4 hours',
      similarResolvedTickets: 8,
      escalationRisk: 'high',
    } as TicketAIInsights,
    firstResponseAt: new Date('2026-02-10T16:45:00Z'),
    resolvedAt: null,
    attachments: [
      { id: 'att-1', name: 'error-logs.pdf', size: '2.4 MB', type: 'pdf', uploader: 'David Kim' },
    ] as TicketAttachment[],
    ...overrides,
  };
}

// ─── Stats & Filter Options Factories ───────────────────────────────────────

export function createMockStats(overrides?: Partial<TicketStats>): TicketStats {
  return {
    open: 4,
    inProgress: 3,
    breached: 2,
    resolvedToday: 7,
    ...overrides,
  };
}

export function createMockFilterOptions(
  overrides?: Partial<TicketFilterOptions>
): TicketFilterOptions {
  return {
    statuses: [
      { value: 'OPEN', label: 'OPEN', count: 5 },
      { value: 'IN_PROGRESS', label: 'IN_PROGRESS', count: 3 },
      { value: 'WAITING_ON_CUSTOMER', label: 'WAITING_ON_CUSTOMER', count: 2 },
      { value: 'WAITING_ON_THIRD_PARTY', label: 'WAITING_ON_THIRD_PARTY', count: 1 },
      { value: 'RESOLVED', label: 'RESOLVED', count: 8 },
      { value: 'CLOSED', label: 'CLOSED', count: 4 },
    ],
    priorities: [
      { value: 'LOW', label: 'LOW', count: 5 },
      { value: 'MEDIUM', label: 'MEDIUM', count: 10 },
      { value: 'HIGH', label: 'HIGH', count: 3 },
      { value: 'CRITICAL', label: 'CRITICAL', count: 1 },
    ],
    slaStatuses: [
      { value: 'ON_TRACK', label: 'ON_TRACK', count: 8 },
      { value: 'AT_RISK', label: 'AT_RISK', count: 4 },
      { value: 'BREACHED', label: 'BREACHED', count: 2 },
      { value: 'MET', label: 'MET', count: 3 },
      { value: 'PAUSED', label: 'PAUSED', count: 1 },
    ],
    ...overrides,
  };
}

// ─── Mock Handlers ──────────────────────────────────────────────────────────

export function createMockHandlers() {
  return {
    onClick: vi.fn(),
    onRowClick: vi.fn(),
    onBulkAction: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockResolvedValue(undefined),
    onPriorityChange: vi.fn().mockResolvedValue(undefined),
    onAssign: vi.fn().mockResolvedValue(undefined),
    onAddResponse: vi.fn().mockResolvedValue(undefined),
    onResolve: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn().mockResolvedValue(undefined),
    onEscalate: vi.fn(),
    onDismiss: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onReply: vi.fn().mockResolvedValue(undefined),
    onQuickAction: vi.fn(),
    onPageChange: vi.fn(),
  };
}

// ─── Router Mock ────────────────────────────────────────────────────────────

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export const mockUseRouter = vi.fn(() => mockRouter);

// ─── Reset ──────────────────────────────────────────────────────────────────

export function resetAllMocks() {
  vi.clearAllMocks();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.refresh.mockReset();
  mockRouter.back.mockReset();
  mockRouter.forward.mockReset();
  mockRouter.prefetch.mockReset();
}

// ─── tRPC API Mock Helpers ──────────────────────────────────────────────────

export function createMockTRPCQuery<T>(data: T, isLoading = false) {
  return {
    data: isLoading ? undefined : data,
    isLoading,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };
}

export function createMockTRPCMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  };
}
