/**
 * Contact Components Test Utilities (PG-133)
 *
 * Shared mocks, factories, and helpers for contact component tests.
 */

import { vi } from 'vitest';

// ─── Type Definitions ───────────────────────────────────────────────────────

export type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ActivityType = 'email' | 'call' | 'meeting' | 'chat' | 'document' | 'deal' | 'ticket' | 'note';

export interface MockContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  status: ContactStatus;
  accountId: string | null;
  createdAt: Date | string;
  owner?: { id: string; email: string; name: string | null } | null;
  account?: { id: string; name: string } | null;
  _count?: { opportunities: number; tasks: number };
}

export interface MockActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: Record<string, unknown>;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// ─── Contact Factory ────────────────────────────────────────────────────────

export function createMockContact(overrides?: Partial<MockContact>): MockContact {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    title: 'VP of Sales',
    department: 'sales',
    status: 'ACTIVE',
    accountId: 'account-1',
    createdAt: '2026-01-01T00:00:00Z',
    owner: {
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Sales Manager',
    },
    account: {
      id: 'account-1',
      name: 'Acme Corporation',
    },
    _count: {
      opportunities: 3,
      tasks: 5,
    },
    ...overrides,
  };
}

export function createMockContactList(count: number): MockContact[] {
  return Array.from({ length: count }, (_, i) => createMockContact({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    firstName: `Contact${i + 1}`,
    lastName: `User${i + 1}`,
    email: `contact${i + 1}@example.com`,
    phone: i % 2 === 0 ? `+1 (555) 000-000${i}` : null,
    _count: { opportunities: i % 3, tasks: i % 5 },
  }));
}

// ─── Activity Factory ───────────────────────────────────────────────────────

export function createMockActivity(overrides?: Partial<MockActivity>): MockActivity {
  return {
    id: 'activity-1',
    type: 'email',
    title: 'Sent follow-up email',
    description: 'Discussed quarterly review and next steps',
    timestamp: '2026-02-08T14:30:00Z',
    user: 'Sales Manager',
    sentiment: 'positive',
    ...overrides,
  };
}

export function createMockActivityList(count: number): MockActivity[] {
  const types: ActivityType[] = ['email', 'call', 'meeting', 'chat', 'document', 'deal', 'ticket', 'note'];
  const sentiments: Array<'positive' | 'neutral' | 'negative'> = ['positive', 'neutral', 'negative'];

  return Array.from({ length: count }, (_, i) => createMockActivity({
    id: `activity-${i + 1}`,
    type: types[i % types.length],
    title: `Activity ${i + 1}`,
    description: `Description for activity ${i + 1}`,
    timestamp: new Date(Date.now() - i * 86400000).toISOString(), // Days in the past
    user: `User ${i % 3 + 1}`,
    sentiment: sentiments[i % sentiments.length],
  }));
}

// ─── Next.js Mocks ──────────────────────────────────────────────────────────

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  pathname: '/contacts',
  query: {},
  asPath: '/contacts',
};

export const mockUseRouter = vi.fn(() => mockRouter);

export function createMockLink() {
  return vi.fn(({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    // @ts-ignore - simplified mock
    <a href={href} {...props}>{children}</a>
  ));
}

// ─── Mock Handlers ──────────────────────────────────────────────────────────

export function createMockHandlers() {
  return {
    onClick: vi.fn(),
    onRowClick: vi.fn(),
    onCall: vi.fn(),
    onEmail: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onBulkDelete: vi.fn(),
    onBulkEmail: vi.fn(),
    onBulkExport: vi.fn(),
    onCreateDeal: vi.fn(),
    onCreateTicket: vi.fn(),
    onScheduleMeeting: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onTabChange: vi.fn(),
    onLoadMore: vi.fn(),
    onSearch: vi.fn(),
  };
}

// ─── Contact Detail Data ────────────────────────────────────────────────────

export function createMockContactDetail() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah.connor@example.com',
    phone: '+1 (555) 987-6543',
    title: 'Chief Technology Officer',
    department: 'Engineering',
    status: 'ACTIVE' as ContactStatus,
    createdAt: '2025-06-15T00:00:00Z',
    lastContactedAt: '2026-02-05T00:00:00Z',
    avatarUrl: undefined,
    owner: {
      name: 'Account Manager',
      title: 'Senior Sales',
      avatarUrl: undefined,
    },
    account: {
      id: 'account-1',
      name: 'TechCorp Industries',
      industry: 'Technology',
    },
    metrics: {
      totalDeals: 8,
      totalValue: 450000,
      openTasks: 12,
      emailsSent: 34,
    },
    aiInsight: {
      conversionProbability: 75,
      lifetimeValue: 250000,
      churnRisk: 'LOW',
      nextBestAction: 'Schedule quarterly review meeting',
      sentiment: 'POSITIVE',
      engagementScore: 82,
      recommendations: [
        'Follow up on Q1 objectives',
        'Introduce new product features',
      ],
      sentimentTrend: 'IMPROVING',
      lastEngagementDays: 3,
    },
  };
}

// ─── Contact Form Data ──────────────────────────────────────────────────────

export function createMockFormData() {
  return {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+1 (555) 111-2222',
    streetAddress: '123 Main St',
    city: 'San Francisco',
    zipCode: '94102',
    company: 'StartupCo',
    jobTitle: 'Product Manager',
    department: 'product',
    linkedIn: 'https://linkedin.com/in/janesmith',
    contactType: 'prospect',
    status: 'ACTIVE' as ContactStatus,
    tags: 'VIP, Decision Maker',
    notes: 'Met at conference, interested in enterprise plan',
  };
}

// ─── Relationship Graph Data ────────────────────────────────────────────────

export function createMockRelationshipData() {
  return {
    contact: {
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'John',
      lastName: 'Doe',
      account: { id: 'account-1', name: 'Acme Corporation' },
      accountId: 'account-1',
    },
    relatedContacts: [
      { id: 'contact-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', title: 'CTO' },
      { id: 'contact-3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com', title: 'VP Sales' },
    ],
    opportunityCount: 5,
    taskCount: 8,
    linkedLead: { id: 'lead-1', name: 'Initial Inquiry - Acme Corp' },
  };
}

// ─── Reset All Mocks ────────────────────────────────────────────────────────

export function resetAllMocks(handlers: ReturnType<typeof createMockHandlers>) {
  Object.values(handlers).forEach(mock => mock.mockReset());
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.refresh.mockReset();
  mockRouter.back.mockReset();
  mockRouter.forward.mockReset();
  mockRouter.prefetch.mockReset();
}
