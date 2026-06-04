/**
 * Regression test: QueueAIService must NOT evaluate getBullMQConnectionOptions()
 * (and therefore must NOT call requiredProdEnv('REDIS_HOST')) at construction
 * time when no connection option is provided.
 *
 * Context: The web tier (Vercel) imports @intelliflow/api/context which
 * constructs the full DI container including QueueAIService.  The web host has
 * no REDIS_HOST env var.  Before the fix in this PR, `new QueueAIService({})`
 * called `getBullMQConnectionOptions()` eagerly in the constructor, which
 * called `requiredProdEnv('REDIS_HOST', undefined, 'localhost')`, which threw
 * in production (NODE_ENV=production, NEXT_PHASE unset) — causing every route
 * on the Vercel-deployed frontend to 500.
 *
 * After the fix: the connection factory is stored as a reference and only
 * invoked inside `ensureInit()`.  A QueueAIService instance may be constructed
 * safely without REDIS_HOST present; only when an actual `scoreLead()` call is
 * made (which the web tier never makes) does the factory execute.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock bullmq so no real network connection is attempted
// ============================================================================
vi.mock('bullmq', () => ({
  Queue: class {
    constructor() {}
    add = vi.fn().mockResolvedValue({ id: 'j1', waitUntilFinished: vi.fn() });
    close = vi.fn().mockResolvedValue(undefined);
  },
  QueueEvents: class {
    constructor() {}
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

// ============================================================================
// Capture whether getBullMQConnectionOptions was called
// ============================================================================
const connectionFactoryCalled = { value: false };

vi.mock('@intelliflow/platform/queues', () => ({
  QUEUE_NAMES: { AI_SCORING: 'ai-scoring' },
  getBullMQConnectionOptions: () => {
    connectionFactoryCalled.value = true;
    return { host: 'test-redis', port: 6379 };
  },
}));

import { QueueAIService } from '../QueueAIService';

describe('QueueAIService production-safety: no eager env-var reads', () => {
  let originalNodeEnv: string | undefined;
  let originalNextPhase: string | undefined;
  let originalRedisHost: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalNextPhase = process.env.NEXT_PHASE;
    originalRedisHost = process.env.REDIS_HOST;

    // Simulate: production runtime, no build phase, no Redis
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    delete process.env.REDIS_HOST;

    connectionFactoryCalled.value = false;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalNextPhase !== undefined) {
      process.env.NEXT_PHASE = originalNextPhase;
    } else {
      delete process.env.NEXT_PHASE;
    }
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    } else {
      delete process.env.REDIS_HOST;
    }
  });

  // --------------------------------------------------------------------------
  // Case P-1 (regression): construction must not throw even without REDIS_HOST
  // --------------------------------------------------------------------------
  it('case P-1: constructing QueueAIService without REDIS_HOST does not throw in production', () => {
    // Before the fix, this would throw:
    //   Error: [config] REDIS_HOST must be set in production — refusing to fall back to "localhost"
    expect(() => {
      const svc = new QueueAIService({
        defaultTenantId: 'default',
        eagerInit: false, // eagerInit:false to also avoid the init race
      });
      // Silence unused variable warning
      void svc;
    }).not.toThrow();
  });

  // --------------------------------------------------------------------------
  // Case P-2: the connection factory must NOT be called during construction
  // --------------------------------------------------------------------------
  it('case P-2: getBullMQConnectionOptions is NOT invoked during construction (only on first job)', () => {
    connectionFactoryCalled.value = false;

    new QueueAIService({
      defaultTenantId: 'default',
      eagerInit: false,
    });

    expect(connectionFactoryCalled.value).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Case P-3: eagerInit:true with missing REDIS_HOST does not throw synchronously
  // (The fire-and-forget promise may reject, but the constructor must not throw)
  // --------------------------------------------------------------------------
  it('case P-3: eagerInit:true does not throw synchronously even without REDIS_HOST', () => {
    // Note: the mock getBullMQConnectionOptions returns a valid object so no
    // actual connection error will occur here — we just verify the constructor
    // is non-throwing.
    expect(() => {
      const svc = new QueueAIService({
        defaultTenantId: 'default',
        eagerInit: true,
      });
      void svc;
    }).not.toThrow();
  });

  // --------------------------------------------------------------------------
  // Case P-4: the connection factory IS called when a job is actually enqueued
  // --------------------------------------------------------------------------
  it('case P-4: getBullMQConnectionOptions IS invoked when scoreLead() is called', async () => {
    const svc = new QueueAIService({
      defaultTenantId: 'default',
      eagerInit: false,
    });

    connectionFactoryCalled.value = false;

    // scoreLead will call ensureInit → connectionFactory
    await svc.scoreLead({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      source: 'WEBSITE',
    });

    expect(connectionFactoryCalled.value).toBe(true);

    await svc.close();
  });

  // --------------------------------------------------------------------------
  // Case P-5: explicit ConnectionOptions object still works (backwards compat)
  // --------------------------------------------------------------------------
  it('case P-5: explicit ConnectionOptions object bypasses the default factory', async () => {
    const explicitConnection = { host: 'explicit-host', port: 6380 };

    const svc = new QueueAIService({
      connection: explicitConnection,
      defaultTenantId: 'default',
      eagerInit: false,
    });

    connectionFactoryCalled.value = false;

    await svc.scoreLead({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      source: 'WEBSITE',
    });

    // When an explicit connection is provided, the default getBullMQConnectionOptions
    // is NOT called.
    expect(connectionFactoryCalled.value).toBe(false);

    await svc.close();
  });

  // --------------------------------------------------------------------------
  // Case P-6: factory form of connection option is supported
  // --------------------------------------------------------------------------
  it('case P-6: factory connection option is invoked lazily on first job', async () => {
    let factoryCalled = false;
    const factoryFn = () => {
      factoryCalled = true;
      return { host: 'factory-host', port: 6379 };
    };

    const svc = new QueueAIService({
      connection: factoryFn,
      defaultTenantId: 'default',
      eagerInit: false,
    });

    expect(factoryCalled).toBe(false); // not called yet

    await svc.scoreLead({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      source: 'WEBSITE',
    });

    expect(factoryCalled).toBe(true); // called on first use

    await svc.close();
  });
});
