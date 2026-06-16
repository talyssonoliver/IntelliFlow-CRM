import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryCache } from '@intelliflow/adapters';
import { InMemoryEventBus } from '@intelliflow/adapters';
import {
  HomeCacheService,
  HOME_SUMMARY_TTL_SECONDS,
  HOME_SUMMARY_KEY_PREFIX,
  HOME_CACHE_SUBSCRIBED_EVENT_TYPES,
  buildHomeSummaryKey,
} from '../home.cache';

// Minimal DomainEvent-like stub that matches the runtime shape used by the extractor.
class FakeEvent {
  readonly eventId = 'evt-' + Math.random();
  readonly occurredAt = new Date();
  constructor(
    public readonly eventType: string,
    props: Record<string, unknown>
  ) {
    Object.assign(this, props);
  }
  toPayload(): Record<string, unknown> {
    return {};
  }
}

describe('home.cache constants', () => {
  it('TTL is 300 seconds (5 minutes)', () => {
    expect(HOME_SUMMARY_TTL_SECONDS).toBe(300);
  });

  it('key prefix is stable', () => {
    expect(HOME_SUMMARY_KEY_PREFIX).toBe('home:summary');
  });

  it('buildHomeSummaryKey formats correctly', () => {
    expect(buildHomeSummaryKey('user-123')).toBe('home:summary:user-123');
  });

  it('subscribes to at least 19 event types (lead+opp+task)', () => {
    expect(HOME_CACHE_SUBSCRIBED_EVENT_TYPES.length).toBeGreaterThanOrEqual(19);
    expect(HOME_CACHE_SUBSCRIBED_EVENT_TYPES).toContain('lead.created');
    expect(HOME_CACHE_SUBSCRIBED_EVENT_TYPES).toContain('opportunity.won');
    expect(HOME_CACHE_SUBSCRIBED_EVENT_TYPES).toContain('task.created');
  });
});

describe('HomeCacheService.getWelcomeSummary', () => {
  let cache: InMemoryCache;
  let eventBus: InMemoryEventBus;
  let service: HomeCacheService;
  let compute: ReturnType<typeof vi.fn<() => Promise<{ greeting: string }>>>;

  beforeEach(() => {
    cache = new InMemoryCache();
    eventBus = new InMemoryEventBus();
    service = new HomeCacheService(cache, eventBus);
    compute = vi.fn<() => Promise<{ greeting: string }>>().mockResolvedValue({ greeting: 'hi' });
  });

  it('miss path: calls compute once, stores in cache, returns value', async () => {
    const result = await service.getWelcomeSummary('t1', 'u1', compute);
    expect(result).toEqual({ greeting: 'hi' });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(service.getMetrics().misses).toBe(1);
    expect(await cache.get(buildHomeSummaryKey('u1'))).toEqual({ greeting: 'hi' });
  });

  it('hit path: second call returns cached without calling compute', async () => {
    await service.getWelcomeSummary('t1', 'u1', compute);
    compute.mockClear();

    const result = await service.getWelcomeSummary('t1', 'u1', compute);
    expect(result).toEqual({ greeting: 'hi' });
    expect(compute).not.toHaveBeenCalled();
    expect(service.getMetrics().hits).toBe(1);
  });

  it("no cross-tenant cache leak: distinct users never read each other's summary (#263)", async () => {
    // #263 trust model: the key is the userId alone. User IDs are globally
    // unique CUIDs and each User has exactly one tenant (User.tenantId scalar
    // FK; session tenantId is derived from the user record, not selectable),
    // so a key cannot collide across tenants. This locks that invariant: two
    // users in different tenants must get their OWN computed summary, never a
    // cache hit on the other's entry.
    const computeA = vi.fn<() => Promise<{ greeting: string }>>().mockResolvedValue({
      greeting: 'tenant-A-data',
    });
    const computeB = vi.fn<() => Promise<{ greeting: string }>>().mockResolvedValue({
      greeting: 'tenant-B-data',
    });

    // Tenant A's user warms the cache.
    const a1 = await service.getWelcomeSummary(
      'tenant-A',
      'user-aaaaaaaaaaaaaaaaaaaaaaaa',
      computeA
    );
    // Tenant B's user (different userId) must miss and compute its own data.
    const b1 = await service.getWelcomeSummary(
      'tenant-B',
      'user-bbbbbbbbbbbbbbbbbbbbbbbb',
      computeB
    );
    // Tenant A's user again — hits its own entry, not B's.
    const a2 = await service.getWelcomeSummary(
      'tenant-A',
      'user-aaaaaaaaaaaaaaaaaaaaaaaa',
      computeA
    );

    expect(a1).toEqual({ greeting: 'tenant-A-data' });
    expect(b1).toEqual({ greeting: 'tenant-B-data' });
    expect(a2).toEqual({ greeting: 'tenant-A-data' });
    expect(computeA).toHaveBeenCalledTimes(1);
    expect(computeB).toHaveBeenCalledTimes(1);
    expect(buildHomeSummaryKey('user-aaaaaaaaaaaaaaaaaaaaaaaa')).not.toBe(
      buildHomeSummaryKey('user-bbbbbbbbbbbbbbbbbbbbbbbb')
    );
  });

  it('invalidation is per-user (#263): dropping one user does not evict another', async () => {
    await service.getWelcomeSummary('tenant-A', 'user-a', compute);
    await service.getWelcomeSummary('tenant-B', 'user-b', compute);
    compute.mockClear();

    // Event for user-a invalidates only user-a's entry.
    await service.invalidate('user-a');

    await service.getWelcomeSummary('tenant-A', 'user-a', compute); // miss → recompute
    await service.getWelcomeSummary('tenant-B', 'user-b', compute); // still cached
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('cache.get throws: compute still called, metrics.errors incremented', async () => {
    const brokenCache = {
      get: vi.fn().mockRejectedValue(new Error('redis down')),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new HomeCacheService(brokenCache as any, eventBus);

    const result = await svc.getWelcomeSummary('t1', 'u1', compute);
    expect(result).toEqual({ greeting: 'hi' });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(svc.getMetrics().errors).toBeGreaterThanOrEqual(1);
  });

  it('cache.set throws: value still returned, no bubbled error', async () => {
    const halfBrokenCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error('oom')),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new HomeCacheService(halfBrokenCache as any, eventBus);

    await expect(svc.getWelcomeSummary('t1', 'u1', compute)).resolves.toEqual({ greeting: 'hi' });
    expect(svc.getMetrics().errors).toBeGreaterThanOrEqual(1);
  });

  it('DISABLE_HOME_CACHE: always calls compute, never touches cache', async () => {
    const spiedCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      clear: vi.fn(),
    };
    const svc = new HomeCacheService(spiedCache as any, eventBus, { disabled: true });

    await svc.getWelcomeSummary('t1', 'u1', compute);
    await svc.getWelcomeSummary('t1', 'u1', compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(spiedCache.get).not.toHaveBeenCalled();
    expect(spiedCache.set).not.toHaveBeenCalled();
  });

  it('TTL is passed through to cache.set', async () => {
    const spiedCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new HomeCacheService(spiedCache as any, eventBus);

    await svc.getWelcomeSummary('t1', 'u1', compute);

    expect(spiedCache.set).toHaveBeenCalledWith(
      buildHomeSummaryKey('u1'),
      { greeting: 'hi' },
      HOME_SUMMARY_TTL_SECONDS
    );
  });

  it('getMetrics returns snapshot (mutating snapshot does not affect internal state)', async () => {
    await service.getWelcomeSummary('t1', 'u1', compute);
    const snap = service.getMetrics();
    (snap as any).misses = 999;
    expect(service.getMetrics().misses).toBe(1);
  });
});

describe('HomeCacheService.invalidate', () => {
  it('deletes the correct key and increments invalidations', async () => {
    const cache = new InMemoryCache();
    const service = new HomeCacheService(cache, new InMemoryEventBus());

    await service.getWelcomeSummary('t1', 'u1', () => Promise.resolve({ x: 1 }));
    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeTruthy();

    await service.invalidate('u1');
    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeNull();
    expect(service.getMetrics().invalidations).toBe(1);
  });

  it('swallows cache.delete errors', async () => {
    const brokenCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockRejectedValue(new Error('down')),
      exists: vi.fn(),
      clear: vi.fn(),
    };
    const service = new HomeCacheService(brokenCache as any, new InMemoryEventBus());
    await expect(service.invalidate('u1')).resolves.toBeUndefined();
    expect(service.getMetrics().errors).toBeGreaterThanOrEqual(1);
  });
});

describe('HomeCacheService.registerInvalidationHandlers', () => {
  let cache: InMemoryCache;
  let eventBus: InMemoryEventBus;
  let service: HomeCacheService;

  beforeEach(async () => {
    cache = new InMemoryCache();
    eventBus = new InMemoryEventBus();
    service = new HomeCacheService(cache, eventBus);
    await service.registerInvalidationHandlers();
  });

  async function seedCache(userId: string) {
    await service.getWelcomeSummary('t1', userId, () => Promise.resolve({ userName: userId }));
  }

  it('LeadCreatedEvent invalidates the owner key', async () => {
    await seedCache('u1');
    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeTruthy();

    await eventBus.publish(new FakeEvent('lead.created', { ownerId: 'u1' }) as any);

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeNull();
    expect(service.getMetrics().invalidations).toBe(1);
  });

  it('OpportunityWonEvent invalidates both ownerId and closedBy when different', async () => {
    await seedCache('u1');
    await seedCache('u2');

    await eventBus.publish(
      new FakeEvent('opportunity.won', { ownerId: 'u1', closedBy: 'u2' }) as any
    );

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeNull();
    expect(await cache.get(buildHomeSummaryKey('u2'))).toBeNull();
    expect(service.getMetrics().invalidations).toBe(2);
  });

  it('TaskAssignedEvent invalidates assigneeId, previousAssigneeId, and assignedBy', async () => {
    await seedCache('u1');
    await seedCache('u2');
    await seedCache('u3');

    await eventBus.publish(
      new FakeEvent('task.assigned', {
        assigneeId: 'u1',
        previousAssigneeId: 'u2',
        assignedBy: 'u3',
      }) as any
    );

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeNull();
    expect(await cache.get(buildHomeSummaryKey('u2'))).toBeNull();
    expect(await cache.get(buildHomeSummaryKey('u3'))).toBeNull();
  });

  it('TaskLinkedToEntityEvent invalidates linkedBy', async () => {
    await seedCache('u1');

    await eventBus.publish(
      new FakeEvent('task.linked_to_entity', {
        entityType: 'lead',
        entityId: 'lead-1',
        linkedBy: 'u1',
      }) as any
    );

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeNull();
  });

  it('malformed event (no userId fields) does not throw and does not invalidate', async () => {
    await seedCache('u1');

    await eventBus.publish(new FakeEvent('lead.created', {}) as any);

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeTruthy();
    expect(service.getMetrics().invalidations).toBe(0);
  });

  it('Event for a different user does not invalidate u1', async () => {
    await seedCache('u1');

    await eventBus.publish(new FakeEvent('lead.created', { ownerId: 'u2' }) as any);

    expect(await cache.get(buildHomeSummaryKey('u1'))).toBeTruthy();
  });

  it('registerInvalidationHandlers is idempotent', async () => {
    // Call again
    await service.registerInvalidationHandlers();

    await seedCache('u1');
    await eventBus.publish(new FakeEvent('lead.created', { ownerId: 'u1' }) as any);

    // If double-subscribed, invalidations would be 2 per event
    expect(service.getMetrics().invalidations).toBe(1);
  });

  it('All subscribed event types trigger invalidation for matching owner', async () => {
    // Payload carries every user-id field the various extractors look at so
    // each event type can resolve 'u1' regardless of which actor field it
    // subscribes to (ownerId, assigneeId, linkedBy, etc.).
    const payload = {
      ownerId: 'u1',
      assigneeId: 'u1',
      previousAssigneeId: 'u1',
      linkedBy: 'u1',
    };

    for (const eventType of HOME_CACHE_SUBSCRIBED_EVENT_TYPES) {
      service._resetForTest();
      const freshBus = new InMemoryEventBus();
      const freshCache = new InMemoryCache();
      const freshSvc = new HomeCacheService(freshCache, freshBus);
      await freshSvc.registerInvalidationHandlers();

      await freshSvc.getWelcomeSummary('t1', 'u1', () => Promise.resolve({ x: 1 }));
      await freshBus.publish(new FakeEvent(eventType, payload) as any);

      expect(
        await freshCache.get(buildHomeSummaryKey('u1')),
        `${eventType} should invalidate`
      ).toBeNull();
    }
  });
});
