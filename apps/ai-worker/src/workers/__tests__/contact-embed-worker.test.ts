import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock bullmq so the Queue/Worker/QueueEvents constructors are inspectable
// without a live Redis. Define the class factories inline so vitest hoists the
// module-mock correctly.
const constructorCalls: {
  Queue: unknown[];
  Worker: unknown[];
  QueueEvents: unknown[];
  workerOn: Array<[string, unknown]>;
  addBulk: unknown[][];
  closed: { worker: number; events: number; queue: number };
  /** Jobs the queue still holds, by id, as BullMQ keeps them after they finish. */
  retained: Map<string, { failed: boolean; removed: boolean }>;
} = {
  Queue: [],
  Worker: [],
  QueueEvents: [],
  workerOn: [],
  addBulk: [],
  closed: { worker: 0, events: 0, queue: 0 },
  retained: new Map(),
};

vi.mock('bullmq', () => {
  class MockQueue {
    constructor(...args: unknown[]) {
      constructorCalls.Queue.push(args);
    }
    async close() {
      constructorCalls.closed.queue++;
    }
    async add() {
      return { id: 'job-1' };
    }
    async addBulk(jobs: unknown[]) {
      constructorCalls.addBulk.push(jobs);
      return jobs;
    }
    async getJob(id: string) {
      const held = constructorCalls.retained.get(id);
      if (!held || held.removed) return undefined;
      return {
        isFailed: async () => held.failed,
        remove: async () => {
          held.removed = true;
        },
      };
    }
  }
  class MockWorker {
    constructor(...args: unknown[]) {
      constructorCalls.Worker.push(args);
    }
    on(event: string, handler: unknown) {
      constructorCalls.workerOn.push([event, handler]);
    }
    async close() {
      constructorCalls.closed.worker++;
    }
  }
  class MockQueueEvents {
    constructor(...args: unknown[]) {
      constructorCalls.QueueEvents.push(args);
    }
    async close() {
      constructorCalls.closed.events++;
    }
  }
  // PG-199: ceiling-blocked jobs are moved to delayed with BullMQ's DelayedError.
  class DelayedError extends Error {
    constructor(message = 'bullmq:movedToDelayed') {
      super(message);
      this.name = 'DelayedError';
    }
  }
  return { Queue: MockQueue, Worker: MockWorker, QueueEvents: MockQueueEvents, DelayedError };
});

import {
  contactToEmbeddableText,
  ContactEmbedJobDataSchema,
  ContactEmbedWorker,
  createContactEmbedWorker,
  CONTACT_EMBED_QUEUE_NAME,
  BACKFILL_SPACING_MS,
} from '../contact-embed-worker';
import type { Job } from 'bullmq';

beforeEach(() => {
  constructorCalls.Queue.length = 0;
  constructorCalls.Worker.length = 0;
  constructorCalls.QueueEvents.length = 0;
  constructorCalls.workerOn.length = 0;
  constructorCalls.addBulk.length = 0;
  constructorCalls.closed.worker = 0;
  constructorCalls.closed.events = 0;
  constructorCalls.closed.queue = 0;
  constructorCalls.retained.clear();
});

function buildPrisma(
  overrides?: Partial<{
    contact: unknown | null;
    restriction: { id: string } | null;
    /** The email the locked re-read sees (default: the contact's own). */
    lockedEmail: string | null;
  }>
): any {
  const contactEmail =
    overrides && 'contact' in overrides
      ? ((overrides.contact as { email?: string } | null)?.email ?? null)
      : 'ada@analytical.com';
  const lockedEmail =
    overrides && 'lockedEmail' in overrides ? overrides.lockedEmail : contactEmail;
  const prisma: Record<string, any> = {
    // PG-203: the locked re-read before the embedding write (SELECT email ... FOR UPDATE).
    $queryRaw: vi.fn(async () => (lockedEmail ? [{ email: lockedEmail }] : [])),
    // PG-203: nobody is restricted unless a test says so.
    processingRestriction: {
      findFirst: vi.fn(async () => overrides?.restriction ?? null),
    },
    contact: {
      findFirst: async () =>
        overrides && 'contact' in overrides
          ? (overrides.contact as any)
          : {
              id: 'c-1',
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: 'ada@analytical.com',
              company: 'Analytical',
            },
    },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

function buildJob(data: unknown): Job<any, any, string> {
  return {
    id: '1',
    name: 'embed',
    data,
    attemptsMade: 0,
  } as unknown as Job<any, any, string>;
}

describe('contactToEmbeddableText', () => {
  it('joins all non-empty fields with spaces', () => {
    expect(
      contactToEmbeddableText({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@a.com',
        company: 'Analytical',
      })
    ).toBe('Ada Lovelace ada@a.com Analytical');
  });

  it('skips null / empty fields', () => {
    expect(
      contactToEmbeddableText({
        firstName: 'Ada',
        lastName: null,
        email: null,
        company: null,
      })
    ).toBe('Ada');
  });
});

describe('ContactEmbedJobDataSchema', () => {
  it('accepts valid job payload', () => {
    const parsed = ContactEmbedJobDataSchema.parse({
      contactId: 'c-1',
      tenantId: 't-1',
      reason: 'create',
    });
    expect(parsed.reason).toBe('create');
  });

  it('rejects invalid reason enum', () => {
    expect(() =>
      ContactEmbedJobDataSchema.parse({
        contactId: 'c-1',
        tenantId: 't-1',
        reason: 'unknown',
      })
    ).toThrow();
  });
});

describe('ContactEmbedWorker.process', () => {
  it('fetches contact, builds text, calls embeddingChain + updateContactEmbedding', async () => {
    const embeddingChain = {
      generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
    };
    const updateEmbed = vi.fn(async () => {});
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      embeddingChain,
      updateEmbed
    );

    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' })
    );
    expect(embeddingChain.generateEmbedding).toHaveBeenCalled();
    expect(updateEmbed).toHaveBeenCalledWith(expect.anything(), 'c-1', 't-1', [0.1, 0.2, 0.3]);
    expect(result.embedded).toBe(true);
    expect(result.contactId).toBe('c-1');
  });

  it.each([
    ['restricted', { restriction: { id: 'r-1' } }],
    [
      'erased',
      {
        contact: {
          id: 'c-1',
          firstName: 'Erased',
          lastName: 'Erased',
          email: 'erased-c-1@erased.invalid',
          company: null,
        },
      },
    ],
  ])(
    'never sends a %s person to the embedding model (PG-203, owner Q18)',
    async (_label, overrides) => {
      const generate = vi.fn(async () => [0.1]);
      const updateEmbed = vi.fn(async () => {});
      const prisma = buildPrisma(overrides);
      const worker = new ContactEmbedWorker(
        prisma,
        { host: 'localhost', port: 6379 },
        { generateEmbedding: generate },
        updateEmbed
      );
      const result = await worker.process(
        buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'update' })
      );
      expect(result.embedded).toBe(false);
      expect(generate).not.toHaveBeenCalled();
      expect(updateEmbed).not.toHaveBeenCalled();
    }
  );

  it('discards the embedding when the contact is erased during the embedding call (codex)', async () => {
    const generate = vi.fn(async () => [0.1, 0.2]);
    const updateEmbed = vi.fn(async () => {});
    const prisma = buildPrisma({ lockedEmail: 'erased-c-1@erased.invalid' });
    const worker = new ContactEmbedWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      { generateEmbedding: generate },
      updateEmbed
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'update' })
    );
    expect(generate).toHaveBeenCalled();
    expect(updateEmbed).not.toHaveBeenCalled();
    expect(result.embedded).toBe(false);
    expect((prisma.$queryRaw.mock.calls[0][0] as string[]).join('?')).toContain('FOR UPDATE');
  });

  it('writes through the locked transaction, not the base client', async () => {
    const updateEmbed = vi.fn(async () => {});
    const prisma = buildPrisma();
    const worker = new ContactEmbedWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      { generateEmbedding: vi.fn(async () => [0.1]) },
      updateEmbed
    );
    await worker.process(buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(updateEmbed).toHaveBeenCalledWith(prisma, 'c-1', 't-1', [0.1]);
  });

  it('checks the restriction in the job tenant by normalised email', async () => {
    const prisma = buildPrisma();
    const worker = new ContactEmbedWorker(
      prisma,
      { host: 'localhost', port: 6379 },
      { generateEmbedding: vi.fn(async () => [0.1]) },
      vi.fn(async () => {})
    );
    await worker.process(buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }));
    expect(prisma.processingRestriction.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't-1', subjectEmail: 'ada@analytical.com', liftedAt: null },
      select: { id: true },
    });
  });

  it('returns embedded=false when contact is missing (no LLM call)', async () => {
    const generate = vi.fn(async () => [0.1]);
    const worker = new ContactEmbedWorker(
      buildPrisma({ contact: null }),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: generate },
      vi.fn(async () => {})
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-missing', tenantId: 't-1', reason: 'create' })
    );
    expect(result.embedded).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns embedded=false when text is empty (early return, no LLM call)', async () => {
    const generate = vi.fn(async () => [0.1]);
    const worker = new ContactEmbedWorker(
      buildPrisma({
        contact: { id: 'c-1', firstName: null, lastName: null, email: null, company: null },
      }),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: generate },
      vi.fn(async () => {})
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' })
    );
    expect(result.embedded).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns embedded=false when embeddingChain returns null', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => null },
      vi.fn(async () => {})
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' })
    );
    expect(result.embedded).toBe(false);
  });

  it('propagates embeddingChain failure so BullMQ can retry', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      {
        generateEmbedding: async () => {
          throw new Error('LiteLLM down');
        },
      },
      vi.fn(async () => {})
    );
    await expect(
      worker.process(buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }))
    ).rejects.toThrow(/LiteLLM down/);
  });
});

describe('ContactEmbedWorker — lifecycle (start/stop/listeners)', () => {
  it('start() constructs Queue, QueueEvents, and Worker on the correct queue name', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    await worker.start();
    expect(constructorCalls.Queue).toHaveLength(1);
    expect(constructorCalls.QueueEvents).toHaveLength(1);
    expect(constructorCalls.Worker).toHaveLength(1);
    // First constructor arg is the queue name on all three.
    expect((constructorCalls.Queue[0] as unknown[])[0]).toBe(CONTACT_EMBED_QUEUE_NAME);
    expect((constructorCalls.QueueEvents[0] as unknown[])[0]).toBe(CONTACT_EMBED_QUEUE_NAME);
    expect((constructorCalls.Worker[0] as unknown[])[0]).toBe(CONTACT_EMBED_QUEUE_NAME);
  });

  it('start() registers a failed-job listener on the Worker', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    await worker.start();
    expect(constructorCalls.workerOn.some(([evt]) => evt === 'failed')).toBe(true);
  });

  it('failed-job listener logs a warning without throwing', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    await worker.start();
    const [, handler] = constructorCalls.workerOn.find(([evt]) => evt === 'failed') ?? [];
    expect(typeof handler).toBe('function');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (handler as (job: unknown, err: Error) => void)({ id: 'failed-job' }, new Error('boom'));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('stop() closes Worker, QueueEvents, and Queue in order', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    await worker.start();
    await worker.stop();
    expect(constructorCalls.closed.worker).toBe(1);
    expect(constructorCalls.closed.events).toBe(1);
    expect(constructorCalls.closed.queue).toBe(1);
  });

  it('stop() is a no-op when start() was never called', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    // Should not throw — all three private fields are null.
    await expect(worker.stop()).resolves.toBeUndefined();
  });

  it('createContactEmbedWorker factory returns an instance wired with same deps', () => {
    const instance = createContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1] },
      vi.fn(async () => {})
    );
    expect(instance).toBeInstanceOf(ContactEmbedWorker);
  });

  it('Worker job-processor delegates to process() — coverage for the inline arrow', async () => {
    const updateEmbed = vi.fn(async () => {});
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => [0.1, 0.2] },
      updateEmbed
    );
    await worker.start();
    // The Worker ctor was called with (queueName, jobHandler, opts) — pull the
    // handler and invoke it so the inline `async (job) => this.process(job)`
    // arrow is exercised.
    const workerCtorArgs = constructorCalls.Worker[0] as unknown[];
    const handler = workerCtorArgs[1] as (job: unknown) => Promise<unknown>;
    const result = (await handler(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' })
    )) as { embedded: boolean };
    expect(result.embedded).toBe(true);
    expect(updateEmbed).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PG-199 (owner Q8): embeddings are metered for the job tenant and a reached rag
// ceiling delays the job instead of dead-lettering it.
// ---------------------------------------------------------------------------

describe('ContactEmbedWorker.process — tenant scope and rag ceiling (PG-199)', () => {
  it('runs the embedding inside the job tenant context (so it is metered and capped)', async () => {
    const { tenantContextStore } = await import('../../tracing/tenant-context');
    let seenTenant: string | undefined;
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      {
        generateEmbedding: vi.fn(async () => {
          seenTenant = tenantContextStore.getStore()?.tenantId;
          return [0.1];
        }),
      },
      vi.fn(async () => {})
    );

    await worker.process(buildJob({ contactId: 'c-1', tenantId: 't-42', reason: 'create' }));

    expect(seenTenant).toBe('t-42');
  });

  it('moves the job to delayed (15 min) when the rag ceiling is reached, never failing it', async () => {
    const ceiling = Object.assign(new Error('monthly AI ceiling reached for rag'), {
      code: 'PURPOSE_CEILING_REACHED',
    });
    const updateEmbed = vi.fn(async () => {});
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      {
        generateEmbedding: vi.fn(async () => {
          throw new Error('Failed to generate embedding: monthly AI ceiling reached for rag', {
            cause: ceiling,
          });
        }),
      },
      updateEmbed
    );
    const job = buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'update' }) as unknown as {
      moveToDelayed: ReturnType<typeof vi.fn>;
    };
    job.moveToDelayed = vi.fn(async () => {});
    const before = Date.now();

    const err = await worker.process(job as never, 'lock-token').catch((e: unknown) => e);

    expect((err as Error).name).toBe('DelayedError');
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    const [until, token] = job.moveToDelayed.mock.calls[0] as [number, string];
    expect(token).toBe('lock-token');
    expect(until).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(updateEmbed).not.toHaveBeenCalled();
  });

  it('rethrows other embedding errors unchanged (normal BullMQ retries)', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      {
        generateEmbedding: vi.fn(async () => {
          throw new Error('provider 503');
        }),
      },
      vi.fn(async () => {})
    );
    const job = buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'update' }) as unknown as {
      moveToDelayed: ReturnType<typeof vi.fn>;
    };
    job.moveToDelayed = vi.fn();

    await expect(worker.process(job as never, 'lock-token')).rejects.toThrow('provider 503');
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });
});

describe('ContactEmbedWorker.enqueueMissingEmbeddings (backfill after the vector(2048) migration)', () => {
  const redis = { host: 'localhost', port: 6379 };

  it('accepts backfill as a job reason', () => {
    expect(
      ContactEmbedJobDataSchema.parse({ contactId: 'c-1', tenantId: 't-1', reason: 'backfill' })
        .reason
    ).toBe('backfill');
  });

  it('queues every contact whose embedding is NULL, page by page, deduped and spaced', async () => {
    const pages = [
      [
        { id: 'c-1', tenantId: 't-1' },
        { id: 'c-2', tenantId: 't-2' },
      ],
      [{ id: 'c-3', tenantId: 't-1' }],
    ];
    const prisma = { $queryRaw: vi.fn(async () => pages.shift() ?? []) };
    const worker = new ContactEmbedWorker(
      prisma as any,
      redis,
      { generateEmbedding: vi.fn() },
      vi.fn()
    );
    await worker.start();

    await expect(worker.enqueueMissingEmbeddings(2)).resolves.toBe(3);

    const job = (contactId: string, tenantId: string, index: number) => ({
      name: 'embed',
      data: { contactId, tenantId, reason: 'backfill' },
      opts: { jobId: `backfill-${contactId}`, delay: index * BACKFILL_SPACING_MS },
    });
    expect(constructorCalls.addBulk.flat()).toEqual([
      job('c-1', 't-1', 0),
      job('c-2', 't-2', 1),
      job('c-3', 't-1', 2),
    ]);
    // Only NULL embeddings are read, and the second page resumes after the last id.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const [sql, ...values] = prisma.$queryRaw.mock.calls[1] as unknown as [string[], ...unknown[]];
    expect(sql.join('?')).toMatch(/FROM contacts\s+WHERE embedding IS NULL AND id > \?/);
    expect(values).toEqual(['c-2', 2]);
  });

  it('re-queues a contact whose earlier backfill job failed, so an outage is recovered at the next boot', async () => {
    // A provider outage used up c-1's retries; BullMQ keeps that failed job for a week, and
    // adding the same job id again would be deduplicated against it.
    constructorCalls.retained.set('backfill-c-1', { failed: true, removed: false });
    const prisma = { $queryRaw: vi.fn(async () => [{ id: 'c-1', tenantId: 't-1' }]) };
    const worker = new ContactEmbedWorker(
      prisma as any,
      redis,
      { generateEmbedding: vi.fn() },
      vi.fn()
    );
    await worker.start();

    await expect(worker.enqueueMissingEmbeddings()).resolves.toBe(1);

    expect(constructorCalls.retained.get('backfill-c-1')?.removed).toBe(true);
    expect(constructorCalls.addBulk.flat()).toHaveLength(1);
  });

  it('leaves a backfill job that is still waiting in place, so the id still dedupes it', async () => {
    constructorCalls.retained.set('backfill-c-1', { failed: false, removed: false });
    const prisma = { $queryRaw: vi.fn(async () => [{ id: 'c-1', tenantId: 't-1' }]) };
    const worker = new ContactEmbedWorker(
      prisma as any,
      redis,
      { generateEmbedding: vi.fn() },
      vi.fn()
    );
    await worker.start();

    await worker.enqueueMissingEmbeddings();

    expect(constructorCalls.retained.get('backfill-c-1')?.removed).toBe(false);
  });

  it('queues nothing when every contact already has an embedding', async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) };
    const worker = new ContactEmbedWorker(
      prisma as any,
      redis,
      { generateEmbedding: vi.fn() },
      vi.fn()
    );
    await worker.start();

    await expect(worker.enqueueMissingEmbeddings()).resolves.toBe(0);
    expect(constructorCalls.addBulk).toEqual([]);
  });

  it('refuses to run before start()', async () => {
    const worker = new ContactEmbedWorker(
      {} as any,
      redis,
      { generateEmbedding: vi.fn() },
      vi.fn()
    );

    await expect(worker.enqueueMissingEmbeddings()).rejects.toThrow(/not started/);
  });
});
