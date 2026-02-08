/**
 * Contact test utilities — mock factories and shared test setup
 * Following the configurable mockQueryState pattern from deals page tests.
 */
import { vi } from 'vitest';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  department: string | null;
  accountId: string | null;
  status: ContactStatus;
  createdAt: string;
  owner?: { id: string; email: string; name: string | null } | null;
  account?: { id: string; name: string } | null;
  _count?: { opportunities: number; tasks: number };
}

export type ActivityType = 'email' | 'call' | 'meeting' | 'chat' | 'document' | 'deal' | 'ticket' | 'note';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: Record<string, unknown>;
  sentiment?: 'positive' | 'neutral' | 'negative';
  reactions?: { emoji: string; count: number; users: string[] }[];
  comments?: { user: string; text: string; timestamp: string }[];
}

export interface ContactWithRelations {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  avatarUrl?: string | null;
  account?: { id: string; name: string; industry: string | null; website: string | null } | null;
  owner?: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
  activities?: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    timestamp: string;
    userName: string;
    metadata: unknown;
    sentiment: string | null;
  }>;
  notes?: Array<{ id: string; content: string; author: string; createdAt: string }>;
  aiInsight?: {
    conversionProbability: number;
    lifetimeValue: number;
    churnRisk: string;
    nextBestAction: string | null;
    sentiment: string | null;
    engagementScore: number;
    recommendations: unknown;
    sentimentTrend: string | null;
    lastEngagementDays: number;
  } | null;
  opportunities?: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    probability: number;
    closeDate: string | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    priority: string | null;
    status: string;
  }>;
  documents?: Array<{ id: string; name: string; fileType: string; createdAt: string }>;
  calendarEvents?: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string | null;
    attendees: string[] | null;
  }>;
}

// ─── Factory Functions ──────────────────────────────────────────────────────────

let idCounter = 0;

export function createMockContact(overrides: Partial<Contact> = {}): Contact {
  idCounter++;
  return {
    id: `contact-${idCounter}`,
    email: `contact${idCounter}@example.com`,
    firstName: `First${idCounter}`,
    lastName: `Last${idCounter}`,
    title: 'Software Engineer',
    phone: '+1555000000' + idCounter,
    department: 'Engineering',
    accountId: `account-${idCounter}`,
    status: 'ACTIVE',
    createdAt: '2026-01-15T10:00:00.000Z',
    owner: { id: 'user-1', email: 'owner@example.com', name: 'Jane Smith' },
    account: { id: `account-${idCounter}`, name: `Acme Corp ${idCounter}` },
    _count: { opportunities: 2, tasks: 3 },
    ...overrides,
  };
}

export function createMockActivity(overrides: Partial<Activity> = {}): Activity {
  idCounter++;
  return {
    id: `activity-${idCounter}`,
    type: 'email',
    title: `Activity ${idCounter}`,
    description: `Description for activity ${idCounter}`,
    timestamp: '2026-01-15T14:00:00.000Z',
    user: 'Jane Smith',
    metadata: {},
    sentiment: undefined,
    reactions: [],
    comments: [],
    ...overrides,
  };
}

export function createMockContactWithRelations(
  overrides: Partial<ContactWithRelations> = {},
): ContactWithRelations {
  idCounter++;
  return {
    id: `contact-${idCounter}`,
    firstName: `First${idCounter}`,
    lastName: `Last${idCounter}`,
    email: `contact${idCounter}@example.com`,
    phone: '+15550001234',
    title: 'VP of Engineering',
    department: 'Engineering',
    status: 'ACTIVE',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-02-01T12:00:00.000Z',
    avatarUrl: null,
    account: { id: 'acct-1', name: 'Acme Corporation', industry: 'Technology', website: 'https://acme.com' },
    owner: { id: 'user-1', name: 'Jane Smith', email: 'jane@example.com', avatarUrl: null },
    activities: [
      { id: 'act-1', type: 'EMAIL', title: 'Sent proposal', description: 'Sent Q1 proposal', timestamp: '2026-01-14T10:00:00.000Z', userName: 'Jane Smith', metadata: { subject: 'Q1 Proposal' }, sentiment: 'POSITIVE' },
      { id: 'act-2', type: 'CALL', title: 'Follow-up call', description: 'Called to follow up', timestamp: '2026-01-13T15:00:00.000Z', userName: 'Bob Wilson', metadata: { duration: '15 min', outcome: 'connected' }, sentiment: 'NEUTRAL' },
      { id: 'act-3', type: 'MEETING', title: 'Demo meeting', description: 'Product demo', timestamp: '2026-01-12T09:00:00.000Z', userName: 'Jane Smith', metadata: { attendees: ['Jane', 'Sarah'], location: 'Zoom' }, sentiment: null },
    ],
    notes: [
      { id: 'note-1', content: 'Key decision maker for Q1 renewal', author: 'Jane Smith', createdAt: '2026-01-10T10:00:00.000Z' },
    ],
    aiInsight: {
      conversionProbability: 75,
      lifetimeValue: 15000000,
      churnRisk: 'LOW',
      nextBestAction: 'Schedule a demo meeting',
      sentiment: 'POSITIVE',
      engagementScore: 85,
      recommendations: ['Send follow-up email', 'Schedule product demo'],
      sentimentTrend: 'IMPROVING',
      lastEngagementDays: 3,
    },
    opportunities: [
      { id: 'opp-1', name: 'Enterprise License', value: 75000, stage: 'PROPOSAL', probability: 60, closeDate: '2026-03-15' },
      { id: 'opp-2', name: 'Support Contract', value: 25000, stage: 'NEGOTIATION', probability: 80, closeDate: '2026-02-28' },
    ],
    tasks: [
      { id: 'task-1', title: 'Send contract', dueDate: '2026-02-10', priority: 'HIGH', status: 'IN_PROGRESS' },
      { id: 'task-2', title: 'Update CRM', dueDate: '2026-02-15', priority: 'MEDIUM', status: 'COMPLETED' },
    ],
    documents: [
      { id: 'doc-1', name: 'Proposal.pdf', fileType: 'pdf', createdAt: '2026-01-10T10:00:00.000Z' },
    ],
    calendarEvents: [
      { id: 'evt-1', title: 'Quarterly Review', startTime: '2026-03-01T14:00:00.000Z', endTime: '2026-03-01T15:00:00.000Z', attendees: ['jane@example.com'] },
    ],
    ...overrides,
  };
}

// ─── Mock Router ────────────────────────────────────────────────────────────────

export const mockPush = vi.fn();
export const mockReplace = vi.fn();
export const mockBack = vi.fn();

export function setupRouterMock() {
  vi.mock('next/navigation', () => ({
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/contacts',
    useParams: () => ({ id: 'contact-1' }),
  }));
}

// ─── Reset State ────────────────────────────────────────────────────────────────

export function resetMocks() {
  idCounter = 0;
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
}
