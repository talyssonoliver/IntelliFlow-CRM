/**
 * Test Setup and Utilities
 *
 * Provides common test utilities for tRPC router tests:
 * - Mock Prisma client
 * - Test context creation
 * - Test caller factory
 * - Mock data generators
 */

import { beforeEach, afterAll, vi } from 'vitest';
import type { PrismaClient, Prisma as PrismaNamespace } from '@intelliflow/db';
import { Prisma } from '@intelliflow/db';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { BaseContext } from '../context';

// ============================================================================
// Global mocks for tracingMiddleware dependencies
// tracingMiddleware is applied to all procedures (public, protected, admin)
// so every router test needs these mocks.
// Individual tests can override with their own vi.mock() if needed.
// ============================================================================

vi.mock('../tracing/correlation', () => ({
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
  getUserId: vi.fn(() => undefined),
  initializeRequestContext: vi.fn(() => ({
    correlationId: 'test-correlation-id',
    requestId: 'test-request-id',
    userId: undefined,
    startTime: Date.now(),
  })),
  createCorrelationHeaders: vi.fn(() => ({
    'X-Correlation-ID': 'test-correlation-id',
    'X-Request-ID': 'test-request-id',
  })),
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: (_name: string, _opts: unknown, fn: (span: unknown) => unknown) => {
        const mockSpan = {
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        };
        return fn(mockSpan);
      },
    }),
  },
  SpanStatusCode: { ERROR: 2, OK: 0 },
  SpanKind: { INTERNAL: 0, SERVER: 1, CLIENT: 2, PRODUCER: 3, CONSUMER: 4 },
  context: {
    active: () => ({}),
    with: (_ctx: unknown, fn: () => unknown) => fn(),
  },
  propagation: {
    inject: vi.fn(),
    extract: vi.fn(),
  },
}));

vi.mock('../tracing/sentry', () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  startSpan: vi.fn(),
}));

vi.mock('../tracing/otel', () => ({
  getSDKInstance: vi.fn(() => null),
  startTracing: vi.fn(),
}));

/**
 * Create a delayed result that satisfies Prisma's PrismaPromise type.
 * Useful for testing slow query detection branches.
 *
 * PrismaPromise extends Promise with [Symbol.toStringTag]: 'PrismaPromise'.
 * vitest-mock-extended's mockDeep handles this for mockResolvedValue,
 * but mockImplementation needs a manual wrapper for delayed returns.
 */
export function delayedPrismaResult<T>(
  value: T,
  delayMs: number
): PrismaNamespace.PrismaPromise<T> {
  const promise = new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  });
  Object.defineProperty(promise, Symbol.toStringTag, { value: 'PrismaPromise' });
  return promise as PrismaNamespace.PrismaPromise<T>; // NOSONAR
}

/**
 * Mock Prisma client
 * Use mockDeep to create a deep mock of PrismaClient
 */
export const prismaMock = mockDeep<PrismaClient>();

/**
 * Reset all mocks before each test
 * CRITICAL: Reset ALL mock singletons to prevent memory leaks
 */
/**
 * IFC-212 hardening: tolerate composite mocks (plain objects with vi.fn() members,
 * such as `mockServices.aiMonitoringStore` after `bindAiMonitoringStoreToService`)
 * which don't expose a top-level `.mockReset` themselves. Falls back to per-method
 * reset on those, and is a no-op on `undefined`/`null`.
 */
function safeMockReset(mock: unknown): void {
  if (!mock) return;
  if (typeof (mock as { mockReset?: unknown }).mockReset === 'function') {
    mockReset(mock as Parameters<typeof mockReset>[0]);
    return;
  }
  if (typeof mock === 'object') {
    for (const m of Object.values(mock as Record<string, unknown>)) {
      if (m && typeof (m as { mockReset?: unknown }).mockReset === 'function') {
        (m as { mockReset: () => void }).mockReset();
      }
    }
  }
}

beforeEach(() => {
  mockReset(prismaMock);
  // Reset mockServices - prevents call history accumulation
  Object.values(mockServices).forEach(safeMockReset);
  // Reset mockSecurityServices
  Object.values(mockSecurityServices).forEach(safeMockReset);
  // Reset mockAdapters
  Object.values(mockAdapters).forEach(safeMockReset);
});

/**
 * Clear all mocks after all tests in this file complete
 * CRITICAL: Also unstub globals/envs to prevent memory accumulation
 */
afterAll(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();

  // Explicit garbage collection if --expose-gc flag is set
  // Helps prevent OOM during test cleanup
  if (globalThis.gc) {
    globalThis.gc();
  }
});

/**
 * Mock services for testing
 * These mocks can be overridden in individual tests
 */
export const mockServices = {
  lead: mockDeep<any>(),
  contact: mockDeep<any>(),
  account: mockDeep<any>(),
  opportunity: mockDeep<any>(),
  task: mockDeep<any>(),
  ticket: mockDeep<any>(),
  ticketRouting: mockDeep<any>(),
  leadRouting: mockDeep<any>(),
  analytics: mockDeep<any>(),
  chainVersion: mockDeep<any>(),
  convertLeadToDeal: mockDeep<any>(),
  closeDealWon: mockDeep<any>(),
  closeDealLost: mockDeep<any>(),
  feedbackSurvey: mockDeep<any>(),
  publicFeedback: mockDeep<any>(),
  experiment: mockDeep<any>(),
  // IFC-157: Notification Orchestrator — set to undefined so router tests
  // fall back to direct Prisma mocks. Tests that need orchestrator behavior
  // should override via createTestContext({ services: { notificationOrchestrator: ... } }).
  notificationOrchestrator: undefined as any,
  aiMonitoringService: mockDeep<any>(),
  // IFC-214: aiMonitoringStore wraps aiMonitoringService with a Redis cache layer.
  // The router unwraps `.value` on the response, so the mock returns
  // `{ source: 'db', value }`. Each method delegates to mockServices.aiMonitoringService.*
  // at call time so existing tests can keep overriding aiMonitoringService.getX
  // without also overriding the store. (See `bindAiMonitoringStoreToService` below.)
  aiMonitoringStore: {} as any,
  // IFC-196: homeCache undefined so router tests fall back to direct compute.
  homeCache: undefined as any,
  // IFC-310: Duplicate-detection runtime services — leave undefined so router
  // tests skip the detection branch; tests that exercise it should override via
  // createTestContext({ services: { contactDuplicateDetection: ... } }).
  contactDuplicateDetection: undefined as any,
  accountDuplicateDetection: undefined as any,
};

// IFC-214: Bind the lazy aiMonitoringStore methods now that mockServices exists.
// Each method delegates to mockServices.aiMonitoringService.* AT CALL TIME so
// per-test overrides on the underlying service mock automatically flow through.
function bindAiMonitoringStoreToService(): void {
  const svc = mockServices.aiMonitoringService as any;
  mockServices.aiMonitoringStore = {
    getStatus: vi.fn(async (opts: any) => ({ source: 'db' as const, value: await svc.getStatus(opts) })),
    getDriftMetrics: vi.fn(async (opts: any) => ({ source: 'db' as const, value: await svc.getDriftMetrics(opts) })),
    getLatencyMetrics: vi.fn(async (opts: any) => ({ source: 'db' as const, value: await svc.getLatencyMetrics(opts) })),
    getHallucinationReport: vi.fn(async (opts: any) => ({ source: 'db' as const, value: await svc.getHallucinationReport(opts) })),
    getROIMetrics: vi.fn(async (opts: any) => ({ source: 'db' as const, value: await svc.getROIMetrics(opts) })),
  };
}
bindAiMonitoringStoreToService();

/**
 * Mock security services for testing
 * IFC-098, IFC-113, IFC-127
 */
export const mockSecurityServices = {
  auditLogger: mockDeep<any>(),
  rbacService: mockDeep<any>(),
  encryptionService: mockDeep<any>(),
  keyRotationService: mockDeep<any>(),
  auditEventHandler: mockDeep<any>(),
};

/**
 * Mock adapters for testing
 */
export const mockAdapters = {
  leadRepository: mockDeep<any>(),
  contactRepository: mockDeep<any>(),
  accountRepository: mockDeep<any>(),
  opportunityRepository: mockDeep<any>(),
  taskRepository: mockDeep<any>(),
  chainVersionRepository: mockDeep<any>(),
  chainVersionAuditRepository: mockDeep<any>(),
  activityFeedRepository: mockDeep<any>(),
  analyticsRepository: mockDeep<any>(),
  eventBus: mockDeep<any>(),
  aiService: mockDeep<any>(),
  cache: mockDeep<any>(),
  featureFlagProvider: mockDeep<any>(),
  featureFlagAdapter: mockDeep<any>(),
  caseDocumentRepository: mockDeep<any>(),
  storageService: mockDeep<any>(),
  avScanner: mockDeep<any>(),
  notificationService: mockDeep<any>(),
  icsGenerationService: mockDeep<any>(),
  feedbackSurveyRepository: mockDeep<any>(),
  publicFeedbackRepository: mockDeep<any>(),
  tenantModuleRepository: mockDeep<any>(),
  notificationRepository: mockDeep<any>(),
  notificationPreferenceRepository: mockDeep<any>(),
  notificationAuditLogger: mockDeep<any>(),
  experimentRepository: mockDeep<any>(),
  appointmentRepository: mockDeep<any>(),
};

/**
 * Default context properties for spreading into test contexts
 * Use this when creating inline context objects in tests
 */
export const defaultContextProps = {
  services: mockServices,
  security: mockSecurityServices,
  adapters: mockAdapters,
};

type HeaderLike =
  | Headers
  | {
      get?: (name: string) => string | null;
      has?: (name: string) => boolean;
      [key: string]: unknown;
    };

function normalizeHeaders(headers?: HeaderLike): Headers | undefined {
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    return headers;
  }

  const headerSource = headers as Record<string, unknown>;

  return {
    get(name: string): string | null {
      const key = Object.keys(headerSource).find(
        (candidate) => candidate.toLowerCase() === name.toLowerCase()
      );

      let value: unknown;
      if (typeof headerSource.get === 'function') {
        value = headerSource.get(name);
      } else if (key) {
        value = headerSource[key];
      } else {
        value = undefined;
      }

      if (typeof value === 'string') return value;
      if (value == null) return null;
      return String(value);
    },
    has(name: string): boolean {
      if (typeof headerSource.has === 'function') {
        return headerSource.has(name);
      }

      return this.get(name) !== null;
    },
  } as Headers;
}

/**
 * Create a test context with optional overrides
 * Includes tenant context required by router middleware
 */
export function createTestContext(overrides?: Partial<BaseContext>): BaseContext {
  const userId = TEST_UUIDS.user1;
  const tenantId = TEST_UUIDS.tenant;

  const defaultContext: BaseContext = {
    prisma: prismaMock as PrismaClient, // NOSONAR
    container: mockDeep<any>(), // Mock container for testing
    services: mockServices,
    security: mockSecurityServices,
    adapters: mockAdapters,
    user: {
      userId,
      email: 'test@example.com',
      role: 'USER',
      tenantId,
      timezone: 'UTC',
    },
    // Tenant context required by tenantContextMiddleware
    tenant: {
      tenantId,
      tenantType: 'user' as const,
      userId,
      role: 'USER',
      canAccessAllTenantData: false,
    },
    // Prisma with tenant filter applied
    prismaWithTenant: prismaMock as PrismaClient, // NOSONAR
    req: undefined,
    res: undefined,
  };

  const mergedContext = { ...defaultContext, ...overrides };

  if (mergedContext.req) {
    mergedContext.req = {
      ...mergedContext.req,
      headers: normalizeHeaders((mergedContext.req as { headers?: HeaderLike }).headers),
    } as BaseContext['req'];
  }

  return mergedContext;
}

/**
 * Create admin context for testing admin-only procedures
 */
export function createAdminContext(overrides?: Partial<BaseContext>): BaseContext {
  const adminId = TEST_UUIDS.admin1;
  const tenantId = TEST_UUIDS.tenant;

  return createTestContext({
    user: {
      userId: adminId,
      email: 'admin@example.com',
      role: 'ADMIN',
      tenantId,
    },
    tenant: {
      tenantId,
      tenantType: 'user' as const,
      userId: adminId,
      role: 'ADMIN',
      canAccessAllTenantData: true,
    },
    ...overrides,
  });
}

/**
 * Create unauthenticated context for testing public procedures
 */
export function createPublicContext(overrides?: Partial<BaseContext>): BaseContext {
  return createTestContext({
    user: undefined,
    ...overrides,
  });
}

/**
 * IFC-211: MANAGER-role test context helper. Mirrors createAdminContext.
 * Use for RBAC tests that need the team-write code path.
 */
export function createManagerContext(overrides?: Partial<BaseContext>): BaseContext {
  const managerId = TEST_UUIDS.manager1;
  const tenantId = TEST_UUIDS.tenant;
  return createTestContext({
    user: {
      userId: managerId,
      email: 'manager@example.com',
      role: 'MANAGER',
      tenantId,
    },
    tenant: {
      tenantId,
      tenantType: 'user' as const,
      userId: managerId,
      role: 'MANAGER',
      canAccessAllTenantData: true,
    },
    ...overrides,
  });
}

/**
 * UUID generator for tests
 * Generates valid UUIDs for test data
 */
export function generateTestUUID(name: string): string {
  // Generate a valid UUID v4 based on the name for deterministic test data
  const hash = name.split('').reduce((acc, char) => {
    return Math.trunc((acc << 5) - acc + char.codePointAt(0)!);
  }, 0);

  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex.padEnd(12, '0')}`;
}

/**
 * Common test UUIDs - use these for consistent test data
 */
export const TEST_UUIDS = {
  tenant: generateTestUUID('tenant'),
  lead1: generateTestUUID('lead-1'),
  lead2: generateTestUUID('lead-2'),
  contact1: generateTestUUID('contact-1'),
  contact2: generateTestUUID('contact-2'),
  account1: generateTestUUID('account-1'),
  account2: generateTestUUID('account-2'),
  opportunity1: generateTestUUID('opportunity-1'),
  opportunity2: generateTestUUID('opportunity-2'),
  task1: generateTestUUID('task-1'),
  task2: generateTestUUID('task-2'),
  user1: generateTestUUID('test-user'),
  user2: generateTestUUID('test-user-2'),
  admin1: generateTestUUID('admin-user'),
  manager1: generateTestUUID('manager-user'),
  manager2: generateTestUUID('manager-user-2'),
  teamMember1: generateTestUUID('team-member-1'),
  teamMember2: generateTestUUID('team-member-2'),
  otherTenantUser: generateTestUUID('other-tenant-user'),
  team1: generateTestUUID('team-1'),
  team2: generateTestUUID('team-2'),
  otherTenant: generateTestUUID('other-tenant'),
  nonExistent: generateTestUUID('non-existent'),
  score1: generateTestUUID('score-1'),
};

/**
 * Mock data generators
 */

export const mockLead = {
  id: TEST_UUIDS.lead1,
  tenantId: TEST_UUIDS.tenant,
  email: 'lead@example.com',
  firstName: 'John',
  lastName: 'Doe',
  company: 'ACME Corp',
  title: 'CEO',
  phone: '+1234567890',
  source: 'WEBSITE' as const,
  status: 'NEW' as const,
  score: 75,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  // BANT fields
  bantBudget: null,
  bantAuthority: null,
  bantNeed: null,
  bantTimeline: null,
  qualificationNotes: null,
  // Lead 360 fields
  location: null,
  website: null,
  avatarUrl: null,
  lastContactedAt: null,
  estimatedValue: null,
  tags: [],
  isStarred: false, // PG-059
  accountId: null,
};

export const mockContact = {
  id: TEST_UUIDS.contact1,
  tenantId: TEST_UUIDS.tenant,
  email: 'contact@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  title: 'CTO',
  phone: '+1234567891',
  department: 'Engineering',
  status: 'ACTIVE' as const,
  accountId: TEST_UUIDS.account1,
  leadId: null,
  ownerId: TEST_UUIDS.user1,
  // Extended fields (IFC-089)
  streetAddress: '123 Tech Street',
  city: 'San Francisco',
  zipCode: '94102',
  company: 'TechCorp Inc',
  linkedInUrl: 'https://linkedin.com/in/janesmith',
  contactType: 'customer',
  tags: ['enterprise', 'vip'],
  contactNotes: 'Key technical contact',
  avatarUrl: null,
  lastContactedAt: null, // IFC-192
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockAccount = {
  id: TEST_UUIDS.account1,
  tenantId: TEST_UUIDS.tenant,
  name: 'TechCorp Inc',
  website: 'https://techcorp.example.com',
  industry: 'Technology',
  description: 'A leading tech company',
  revenue: new Prisma.Decimal(1000000),
  employees: 50,
  ownerId: TEST_UUIDS.user1,
  parentAccountId: null,
  // IFC-312: AI provenance scalars (nullable on legacy rows)
  score: null,
  scoreProvenance: null,
  scoredAt: null,
  scoreModelVersion: null,
  industryInferredAt: null,
  industryModelVersion: null,
  // IFC-312 audit fix F3: per-account tags array (mirrors Contact.tags)
  tags: [] as string[],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockOpportunity = {
  id: TEST_UUIDS.opportunity1,
  tenantId: TEST_UUIDS.tenant,
  name: 'Enterprise Deal',
  value: new Prisma.Decimal(50000),
  stage: 'PROPOSAL' as const,
  probability: 60,
  expectedCloseDate: new Date('2024-12-31'),
  closedAt: null,
  deletedAt: null,
  description: 'Large enterprise opportunity',
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  sourceLeadId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockTask = {
  id: TEST_UUIDS.task1,
  tenantId: TEST_UUIDS.tenant,
  title: 'Follow up call',
  description: 'Call the lead to discuss requirements',
  status: 'PENDING' as const,
  priority: 'HIGH' as const,
  dueDate: new Date('2024-12-25'),
  completedAt: null,
  leadId: TEST_UUIDS.lead1,
  contactId: null,
  opportunityId: null,
  ownerId: TEST_UUIDS.user1,
  assigneeId: null,
  calendarId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockUser = {
  id: TEST_UUIDS.user1,
  email: 'test@example.com',
  name: 'Test User',
  givenName: null,
  familyName: null,
  avatarUrl: 'https://example.com/avatar.jpg',
  timezone: 'UTC',
  locale: 'en-GB',
  phone: null,
  company: null,
  department: null,
  location: null,
  website: null,
  bio: null,
  provider: null,
  emailVerified: false,
  lastSignInAt: null,
  signInCount: 0,
  createdAt: new Date('2025-01-15T00:00:00.000Z'),
};

export const mockAIScore = {
  id: TEST_UUIDS.score1,
  leadId: TEST_UUIDS.lead1,
  score: 80,
  confidence: 0.85,
  factors: {
    engagement: 0.7,
    company_fit: 0.8,
    timing: 0.6,
  },
  modelVersion: 'v1.0.0',
  scoredById: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/**
 * Timeline test fixtures (IFC-184)
 */
export const mockActivity = {
  id: generateTestUUID('activity-1'),
  contactId: TEST_UUIDS.contact1,
  type: 'call' as const,
  title: 'Discovery call',
  description: 'Initial discovery call with prospect',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  duration: 30,
  actorId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
};

export const mockNote = {
  id: generateTestUUID('note-1'),
  contactId: TEST_UUIDS.contact1,
  content: 'Important meeting notes from client call',
  createdById: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-16T14:00:00Z'),
  updatedAt: new Date('2024-01-16T14:00:00Z'),
};

/**
 * Create mock timeline events for testing
 * @param count Number of events to create
 * @param options Configuration for event types and dates
 */
export function createMockTimelineEvents(
  count: number,
  options: {
    contactId?: string;
    types?: Array<'task' | 'note' | 'activity'>;
    startDate?: Date;
  } = {}
) {
  const {
    contactId = TEST_UUIDS.contact1,
    types = ['task', 'note', 'activity'],
    startDate = new Date('2024-01-01'),
  } = options;

  const events: Array<{
    id: string;
    type: string;
    title: string;
    description?: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const timestamp = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000); // Add days

    switch (type) {
      case 'task': {
        const taskUuid = generateTestUUID('task-' + i);
        events.push({
          id: `task-${taskUuid}`,
          type: 'task',
          title: `Task ${i + 1}`,
          description: `Task description ${i + 1}`,
          timestamp,
          metadata: { status: 'PENDING', priority: 'MEDIUM', contactId },
        });
        break;
      }
      case 'note': {
        const noteUuid = generateTestUUID('note-' + i);
        events.push({
          id: `note-${noteUuid}`,
          type: 'note',
          title: 'Note added',
          description: `Note content ${i + 1}`,
          timestamp,
          metadata: { contactId },
        });
        break;
      }
      case 'activity': {
        const activityUuid = generateTestUUID('activity-' + i);
        events.push({
          id: `activity-${activityUuid}`,
          type: 'activity',
          title: `Activity ${i + 1}`,
          description: `Activity description ${i + 1}`,
          timestamp,
          metadata: { contactId, activityType: 'call' },
        });
        break;
      }
    }
  }

  return events;
}

/**
 * Create mock task with contact association for timeline tests
 */
export function createMockTaskForContact(
  contactId: string,
  overrides: Partial<typeof mockTask> = {}
) {
  return {
    ...mockTask,
    id: generateTestUUID(`task-${Date.now()}`),
    contactId,
    leadId: null,
    ...overrides,
  };
}
