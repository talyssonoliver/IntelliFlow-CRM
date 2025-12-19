/**
 * Common Mocks for IntelliFlow CRM Tests
 *
 * This module provides mock implementations of common dependencies
 * used throughout the test suite. This ensures consistent mocking
 * and reduces boilerplate in individual test files.
 */

import { vi } from 'vitest';

/**
 * Mock Logger
 * Provides a mock logger that captures log calls for assertions
 */
export interface MockLogger {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  getCalls: () => {
    debug: any[][];
    info: any[][];
    warn: any[][];
    error: any[][];
  };
  clear: () => void;
}

export function createMockLogger(): MockLogger {
  const debugCalls: any[][] = [];
  const infoCalls: any[][] = [];
  const warnCalls: any[][] = [];
  const errorCalls: any[][] = [];

  return {
    debug: vi.fn((...args: any[]) => {
      debugCalls.push(args);
    }),
    info: vi.fn((...args: any[]) => {
      infoCalls.push(args);
    }),
    warn: vi.fn((...args: any[]) => {
      warnCalls.push(args);
    }),
    error: vi.fn((...args: any[]) => {
      errorCalls.push(args);
    }),
    getCalls: () => ({
      debug: debugCalls,
      info: infoCalls,
      warn: warnCalls,
      error: errorCalls,
    }),
    clear: () => {
      debugCalls.length = 0;
      infoCalls.length = 0;
      warnCalls.length = 0;
      errorCalls.length = 0;
    },
  };
}

/**
 * Mock Repository
 * Generic mock repository implementation for testing
 */
export interface MockRepository<T> {
  findById: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export function createMockRepository<T>(): MockRepository<T> {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };
}

/**
 * Mock Lead Repository
 * Specialized mock for Lead repository with domain-specific methods
 */
export interface MockLeadRepository extends MockRepository<any> {
  findByEmail: ReturnType<typeof vi.fn>;
  findByStatus: ReturnType<typeof vi.fn>;
  findByScore: ReturnType<typeof vi.fn>;
  updateScore: ReturnType<typeof vi.fn>;
}

export function createMockLeadRepository(): MockLeadRepository {
  return {
    ...createMockRepository(),
    findByEmail: vi.fn(),
    findByStatus: vi.fn(),
    findByScore: vi.fn(),
    updateScore: vi.fn(),
  };
}

/**
 * Mock Event Publisher
 * Mock implementation of domain event publisher
 */
export interface MockEventPublisher {
  publish: ReturnType<typeof vi.fn>;
  publishBatch: ReturnType<typeof vi.fn>;
  getPublishedEvents: () => any[];
  clear: () => void;
}

export function createMockEventPublisher(): MockEventPublisher {
  const publishedEvents: any[] = [];

  return {
    publish: vi.fn((event: any) => {
      publishedEvents.push(event);
      return Promise.resolve();
    }),
    publishBatch: vi.fn((events: any[]) => {
      publishedEvents.push(...events);
      return Promise.resolve();
    }),
    getPublishedEvents: () => [...publishedEvents],
    clear: () => {
      publishedEvents.length = 0;
    },
  };
}

/**
 * Mock Email Service
 * Mock implementation of email service for testing
 */
export interface MockEmailService {
  sendEmail: ReturnType<typeof vi.fn>;
  sendBulkEmail: ReturnType<typeof vi.fn>;
  getSentEmails: () => Array<{
    to: string;
    subject: string;
    body: string;
    sentAt: Date;
  }>;
  clear: () => void;
}

export function createMockEmailService(): MockEmailService {
  const sentEmails: Array<{
    to: string;
    subject: string;
    body: string;
    sentAt: Date;
  }> = [];

  return {
    sendEmail: vi.fn((to: string, subject: string, body: string) => {
      sentEmails.push({ to, subject, body, sentAt: new Date() });
      return Promise.resolve({ success: true, messageId: 'mock-message-id' });
    }),
    sendBulkEmail: vi.fn((emails: Array<{ to: string; subject: string; body: string }>) => {
      emails.forEach((email) => {
        sentEmails.push({ ...email, sentAt: new Date() });
      });
      return Promise.resolve({ success: true, count: emails.length });
    }),
    getSentEmails: () => [...sentEmails],
    clear: () => {
      sentEmails.length = 0;
    },
  };
}

/**
 * Mock AI Service
 * Mock implementation of AI/LLM service for testing
 */
export interface MockAIService {
  scoreLeads: ReturnType<typeof vi.fn>;
  generateEmail: ReturnType<typeof vi.fn>;
  analyzeText: ReturnType<typeof vi.fn>;
  getApiCalls: () => Array<{
    method: string;
    input: any;
    output: any;
    timestamp: Date;
  }>;
  clear: () => void;
}

export function createMockAIService(): MockAIService {
  const apiCalls: Array<{
    method: string;
    input: any;
    output: any;
    timestamp: Date;
  }> = [];

  return {
    scoreLeads: vi.fn((leads: any[]) => {
      const result = leads.map((lead) => ({
        leadId: lead.id,
        score: 75,
        confidence: 0.85,
        tier: 'WARM',
      }));
      apiCalls.push({
        method: 'scoreLeads',
        input: leads,
        output: result,
        timestamp: new Date(),
      });
      return Promise.resolve(result);
    }),
    generateEmail: vi.fn((context: any) => {
      const result = {
        subject: 'Test Email Subject',
        body: 'Test email body content',
      };
      apiCalls.push({
        method: 'generateEmail',
        input: context,
        output: result,
        timestamp: new Date(),
      });
      return Promise.resolve(result);
    }),
    analyzeText: vi.fn((text: string) => {
      const result = {
        sentiment: 'positive',
        topics: ['technology', 'business'],
        entities: [],
      };
      apiCalls.push({
        method: 'analyzeText',
        input: text,
        output: result,
        timestamp: new Date(),
      });
      return Promise.resolve(result);
    }),
    getApiCalls: () => [...apiCalls],
    clear: () => {
      apiCalls.length = 0;
    },
  };
}

/**
 * Mock Cache Service
 * Mock implementation of cache service for testing
 */
export interface MockCacheService {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
  getCacheState: () => Map<string, any>;
}

export function createMockCacheService(): MockCacheService {
  const cache = new Map<string, any>();

  return {
    get: vi.fn((key: string) => {
      return Promise.resolve(cache.get(key));
    }),
    set: vi.fn((key: string, value: any, ttl?: number) => {
      cache.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      cache.delete(key);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      cache.clear();
      return Promise.resolve();
    }),
    has: vi.fn((key: string) => {
      return Promise.resolve(cache.has(key));
    }),
    getCacheState: () => new Map(cache),
  };
}

/**
 * Mock Queue Service
 * Mock implementation of job queue for testing
 */
export interface MockQueueService {
  enqueue: ReturnType<typeof vi.fn>;
  getJobs: () => Array<{
    name: string;
    data: any;
    enqueuedAt: Date;
  }>;
  clear: () => void;
}

export function createMockQueueService(): MockQueueService {
  const jobs: Array<{
    name: string;
    data: any;
    enqueuedAt: Date;
  }> = [];

  return {
    enqueue: vi.fn((name: string, data: any) => {
      jobs.push({ name, data, enqueuedAt: new Date() });
      return Promise.resolve({ jobId: `job-${jobs.length}` });
    }),
    getJobs: () => [...jobs],
    clear: () => {
      jobs.length = 0;
    },
  };
}

/**
 * Mock HTTP Client
 * Mock implementation of HTTP client for testing external API calls
 */
export interface MockHttpClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  getRequests: () => Array<{
    method: string;
    url: string;
    data?: any;
    timestamp: Date;
  }>;
  clear: () => void;
}

export function createMockHttpClient(): MockHttpClient {
  const requests: Array<{
    method: string;
    url: string;
    data?: any;
    timestamp: Date;
  }> = [];

  const createMethodMock = (method: string) => {
    return vi.fn((url: string, data?: any) => {
      requests.push({ method, url, data, timestamp: new Date() });
      return Promise.resolve({ status: 200, data: {} });
    });
  };

  return {
    get: createMethodMock('GET'),
    post: createMethodMock('POST'),
    put: createMethodMock('PUT'),
    patch: createMethodMock('PATCH'),
    delete: createMethodMock('DELETE'),
    getRequests: () => [...requests],
    clear: () => {
      requests.length = 0;
    },
  };
}

/**
 * Mock Date/Time Service
 * Provides consistent date/time for testing
 */
export interface MockDateTimeService {
  now: () => Date;
  setNow: (date: Date) => void;
  advanceBy: (ms: number) => void;
  reset: () => void;
}

export function createMockDateTimeService(initialDate?: Date): MockDateTimeService {
  let currentDate = initialDate || new Date('2024-01-01T00:00:00.000Z');

  return {
    now: () => new Date(currentDate),
    setNow: (date: Date) => {
      currentDate = date;
    },
    advanceBy: (ms: number) => {
      currentDate = new Date(currentDate.getTime() + ms);
    },
    reset: () => {
      currentDate = initialDate || new Date('2024-01-01T00:00:00.000Z');
    },
  };
}

/**
 * Mock tRPC Context
 * Mock implementation of tRPC context for testing
 */
export interface MockTRPCContext {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  db?: any;
  logger?: MockLogger;
  services?: {
    email?: MockEmailService;
    ai?: MockAIService;
    cache?: MockCacheService;
  };
}

export function createMockTRPCContext(overrides?: Partial<MockTRPCContext>): MockTRPCContext {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'USER',
    },
    logger: createMockLogger(),
    services: {
      email: createMockEmailService(),
      ai: createMockAIService(),
      cache: createMockCacheService(),
    },
    ...overrides,
  };
}

/**
 * Utility: Create a complete mock service container
 */
export interface MockServiceContainer {
  logger: MockLogger;
  leadRepository: MockLeadRepository;
  eventPublisher: MockEventPublisher;
  emailService: MockEmailService;
  aiService: MockAIService;
  cacheService: MockCacheService;
  queueService: MockQueueService;
  httpClient: MockHttpClient;
  dateTimeService: MockDateTimeService;
  clearAll: () => void;
}

export function createMockServiceContainer(): MockServiceContainer {
  const logger = createMockLogger();
  const leadRepository = createMockLeadRepository();
  const eventPublisher = createMockEventPublisher();
  const emailService = createMockEmailService();
  const aiService = createMockAIService();
  const cacheService = createMockCacheService();
  const queueService = createMockQueueService();
  const httpClient = createMockHttpClient();
  const dateTimeService = createMockDateTimeService();

  return {
    logger,
    leadRepository,
    eventPublisher,
    emailService,
    aiService,
    cacheService,
    queueService,
    httpClient,
    dateTimeService,
    clearAll: () => {
      logger.clear();
      eventPublisher.clear();
      emailService.clear();
      aiService.clear();
      queueService.clear();
      httpClient.clear();
      dateTimeService.reset();
      vi.clearAllMocks();
    },
  };
}
