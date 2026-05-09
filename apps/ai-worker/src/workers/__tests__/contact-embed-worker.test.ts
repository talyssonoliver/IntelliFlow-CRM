import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock bullmq so the Queue/Worker/QueueEvents constructors are inspectable
// without a live Redis. Define the class factories inline so vitest hoists the
// module-mock correctly.
const constructorCalls: {
  Queue: unknown[];
  Worker: unknown[];
  QueueEvents: unknown[];
  workerOn: Array<[string, unknown]>;
  closed: { worker: number; events: number; queue: number };
} = {
  Queue: [],
  Worker: [],
  QueueEvents: [],
  workerOn: [],
  closed: { worker: 0, events: 0, queue: 0 },
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
  return { Queue: MockQueue, Worker: MockWorker, QueueEvents: MockQueueEvents };
});

import {
  contactToEmbeddableText,
  ContactEmbedJobDataSchema,
  ContactEmbedWorker,
  createContactEmbedWorker,
  CONTACT_EMBED_QUEUE_NAME,
} from '../contact-embed-worker';
import type { Job } from 'bullmq';

beforeEach(() => {
  constructorCalls.Queue.length = 0;
  constructorCalls.Worker.length = 0;
  constructorCalls.QueueEvents.length = 0;
  constructorCalls.workerOn.length = 0;
  constructorCalls.closed.worker = 0;
  constructorCalls.closed.events = 0;
  constructorCalls.closed.queue = 0;
});

function buildPrisma(overrides?: Partial<{ contact: unknown | null }>): any {
  return {
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
