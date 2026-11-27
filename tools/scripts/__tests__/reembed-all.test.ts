import { describe, it, expect, vi } from 'vitest';
import { argsError, parseArgs, run, TABLES, type EmbedQueue } from '../reembed-all';

const ALL = ['--tables', 'contacts,contact_notes,leads,lead_notes'];

type Store = Record<string, Array<{ id: string; tenantId: string; embedding: number[] | null }>>;

/** A tiny stand-in for the four tables; it reads the tenant only from the bound parameters. */
function fakePrisma(store: Store, blockedNotes: string[] = []) {
  const tableOf = (sql: string) => /^\s*(?:SELECT .*? FROM|UPDATE) (\w+)/s.exec(sql)![1]!;
  const sqls: string[] = [];
  return {
    sqls,
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('processing_restrictions')) {
        return (params[0] as string[])
          .filter((id) => blockedNotes.includes(id))
          .map((id) => ({ id }));
      }
      sqls.push(sql);
      const rows = store[tableOf(sql)]!;
      if (sql.includes('COUNT(*)')) {
        const tenant = params[0] as string | undefined;
        const mine = rows.filter((r) => !tenant || r.tenantId === tenant);
        return [{ total: mine.length, withEmbedding: mine.filter((r) => r.embedding).length }];
      }
      const [after, tenant] = params as [string, string | undefined];
      return rows
        .filter((r) => r.id > after && (!tenant || r.tenantId === tenant))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 500)
        .map(({ id, tenantId }) => ({ id, tenantId }));
    }),
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      sqls.push(sql);
      const [ids, tenant] = params as [string[], string | undefined];
      let n = 0;
      for (const r of store[tableOf(sql)]!) {
        if (ids.includes(r.id) && (!tenant || r.tenantId === tenant) && r.embedding) {
          r.embedding = null;
          n += 1;
        }
      }
      return n;
    }),
  };
}

function fakeQueue() {
  const finished = new Set<string>();
  const remove = vi.fn(async () => undefined);
  const queue = {
    add: vi.fn(async () => undefined),
    getJob: vi.fn(async (id: string) =>
      finished.has(id) ? { getState: async () => 'failed', remove } : undefined
    ),
    waitUntilReady: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } satisfies EmbedQueue;
  return { queue, finished, remove };
}

const vec = [0.1, 0.2];
function seed(): Store {
  return {
    contacts: [
      { id: 'c1', tenantId: 't1', embedding: vec },
      { id: 'c2', tenantId: 't1', embedding: null },
      { id: 'c9', tenantId: 't2', embedding: vec },
    ],
    contact_notes: [
      { id: 'n1', tenantId: 't1', embedding: vec },
      { id: 'n9', tenantId: 't2', embedding: vec },
    ],
    leads: [
      { id: 'l1', tenantId: 't1', embedding: vec },
      { id: 'l9', tenantId: 't2', embedding: vec },
    ],
    lead_notes: [{ id: 'ln1', tenantId: 't1', embedding: vec }],
  };
}

const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => undefined);

describe('reembed-all', () => {
  it('covers the four tables with a vector(2048) column', () => {
    expect(TABLES.map((t) => t.table)).toEqual([
      'contacts',
      'contact_notes',
      'leads',
      'lead_notes',
    ]);
  });

  it('is a dry run unless --apply, and needs --tenant or an explicit --all-tenants', () => {
    expect(parseArgs(['--tenant', 't1']).isApply).toBe(false);
    expect(argsError(parseArgs([]))).toMatch(/--tenant/);
    expect(argsError(parseArgs(['--apply']))).toMatch(/--tenant/);
    expect(argsError(parseArgs(['--tenant', 't1', '--all-tenants']))).toMatch(/exclusive/);
    expect(argsError(parseArgs(['--tenant', 't1', '--tables', 'nope']))).toMatch(/unknown/);
    expect(argsError(parseArgs(['--all-tenants']))).toBeNull();
    expect(parseArgs(['--tenant', 't1', '--tables', 'contacts']).tables).toEqual(['contacts']);
  });

  it('dry run counts per table and changes and queues nothing', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const open = vi.fn();
    const log = quiet();
    const results = await run(prisma as never, parseArgs(['--tenant', 't1', ...ALL]), open);
    log.mockRestore();
    expect(results.map((r) => [r.table, r.total, r.withEmbedding, r.cleared, r.queued])).toEqual([
      ['contacts', 2, 1, 0, 0],
      ['contact_notes', 1, 1, 0, 0],
      ['leads', 1, 1, 0, 0],
      ['lead_notes', 1, 1, 0, 0],
    ]);
    expect(open).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(store.contacts![0]!.embedding).toEqual(vec);
  });

  it('apply nulls the embeddings and queues the existing jobs per table', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const queues = new Map<string, ReturnType<typeof fakeQueue>>();
    const open = vi.fn(async (name: string) => {
      const q = fakeQueue();
      queues.set(name, q);
      return q.queue;
    });
    const log = quiet();
    const results = await run(
      prisma as never,
      parseArgs(['--tenant', 't1', '--apply', ...ALL]),
      open
    );
    log.mockRestore();

    expect(results.map((r) => [r.table, r.cleared, r.queued])).toEqual([
      ['contacts', 1, 2],
      ['contact_notes', 1, 1],
      ['leads', 1, 0],
      ['lead_notes', 1, 0],
    ]);
    expect([...queues.keys()].sort()).toEqual([
      'intelliflow-contact-embed',
      'intelliflow-document-reindex',
    ]);
    const contactAdds = queues.get('intelliflow-contact-embed')!.queue.add.mock
      .calls as unknown[][];
    expect(contactAdds.map((c) => [c[0], c[1], (c[2] as { jobId: string }).jobId])).toEqual([
      ['embed', { contactId: 'c1', tenantId: 't1', reason: 'backfill' }, 'backfill-c1'],
      ['embed', { contactId: 'c2', tenantId: 't1', reason: 'backfill' }, 'backfill-c2'],
    ]);
    const noteAdds = queues.get('intelliflow-document-reindex')!.queue.add.mock
      .calls as unknown[][];
    expect(noteAdds).toHaveLength(1);
    expect(noteAdds[0]![0]).toBe('reindex');
    expect(noteAdds[0]![1]).toMatchObject({ tenantId: 't1', noteIds: ['n1'], indexType: 'notes' });
    for (const q of queues.values()) expect(q.queue.close).toHaveBeenCalled();
    for (const rows of Object.values(store)) {
      for (const r of rows.filter((x) => x.tenantId === 't1')) expect(r.embedding).toBeNull();
    }
  });

  it('clears nothing when the queue is not reachable', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const open = vi.fn(async () => {
      const q = fakeQueue();
      q.queue.waitUntilReady.mockRejectedValue(new Error('redis down'));
      return q.queue;
    });
    const log = quiet();
    await expect(
      run(prisma as never, parseArgs(['--tenant', 't1', '--apply', '--tables', 'contacts']), open)
    ).rejects.toThrow('redis down');
    log.mockRestore();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('never touches or queues another tenant', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const adds: unknown[][] = [];
    const open = vi.fn(async () => {
      const q = fakeQueue();
      q.queue.add.mockImplementation(async (...a: unknown[]) => {
        adds.push(a);
      });
      return q.queue;
    });
    const log = quiet();
    await run(prisma as never, parseArgs(['--tenant', 't1', '--apply', ...ALL]), open);
    log.mockRestore();
    for (const rows of Object.values(store)) {
      for (const r of rows.filter((x) => x.tenantId === 't2')) expect(r.embedding).toEqual(vec);
    }
    expect(JSON.stringify(adds)).not.toMatch(/t2|c9|n9/);
    // every statement filters on the tenant, bound as a parameter
    expect(prisma.sqls.every((s) => s.includes('"tenantId" = $'))).toBe(true);
  });

  it('--all-tenants covers every tenant and queues each row under its own tenantId', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const adds: unknown[][] = [];
    const open = vi.fn(async () => {
      const q = fakeQueue();
      q.queue.add.mockImplementation(async (...a: unknown[]) => {
        adds.push(a);
      });
      return q.queue;
    });
    const log = quiet();
    await run(
      prisma as never,
      parseArgs(['--all-tenants', '--apply', '--tables', 'contacts']),
      open
    );
    log.mockRestore();
    expect(adds.map((a) => (a[1] as { tenantId: string }).tenantId).sort()).toEqual([
      't1',
      't1',
      't2',
    ]);
  });

  it('is idempotent: a second apply clears nothing more and queues the same jobs, and a finished job is removed first', async () => {
    const store = seed();
    const prisma = fakePrisma(store);
    const { queue, finished, remove } = fakeQueue();
    const open = vi.fn(async () => queue);
    const log = quiet();
    const args = parseArgs(['--tenant', 't1', '--apply', '--tables', 'contacts']);
    await run(prisma as never, args, open);
    finished.add('backfill-c1');
    const again = await run(prisma as never, args, open);
    log.mockRestore();
    expect(again[0]).toMatchObject({ cleared: 0, queued: 2 });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(4);
  });

  it('batches by keyset: more rows than one batch are all processed', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      id: `c${String(i).padStart(5, '0')}`,
      tenantId: 't1',
      embedding: vec,
    }));
    const store: Store = { contacts: rows, contact_notes: [], leads: [], lead_notes: [] };
    const { queue } = fakeQueue();
    const log = quiet();
    const results = await run(
      fakePrisma(store) as never,
      parseArgs(['--tenant', 't1', '--apply', '--tables', 'contacts']),
      async () => queue
    );
    log.mockRestore();
    expect(results[0]).toMatchObject({ cleared: 1200, queued: 1200 });
  });

  it('by default touches only contacts; notes, leads and lead_notes need to be named', () => {
    expect(parseArgs(['--tenant', 't1']).tables).toEqual(['contacts']);
  });

  it('queues payloads the workers accept, with their retry settings', async () => {
    const store = seed();
    store.contacts = [
      { id: 'ckabcdefghijklmnopqrstuv1', tenantId: 'ckabcdefghijklmnopqrstuvt', embedding: vec },
    ];
    store.contact_notes = [
      { id: 'ckabcdefghijklmnopqrstuvn', tenantId: 'ckabcdefghijklmnopqrstuvt', embedding: vec },
    ];
    const calls: unknown[][] = [];
    const open = vi.fn(async () => {
      const q = fakeQueue();
      q.queue.add.mockImplementation(async (...a: unknown[]) => {
        calls.push(a);
      });
      return q.queue;
    });
    const log = quiet();
    await run(
      fakePrisma(store) as never,
      parseArgs([
        '--tenant',
        'ckabcdefghijklmnopqrstuvt',
        '--apply',
        '--tables',
        'contacts,contact_notes',
      ]),
      open
    );
    log.mockRestore();
    expect(calls).toHaveLength(2);
    const typed = calls as Array<[string, unknown, Record<string, unknown>]>;
    // Shapes of ContactEmbedJobDataSchema and ReindexJobDataSchema (ai-worker workers); not
    // imported here because those modules pull in the whole ai-worker dependency graph.
    expect(typed.find((c) => c[0] === 'embed')?.[1]).toEqual({
      contactId: 'ckabcdefghijklmnopqrstuv1',
      tenantId: 'ckabcdefghijklmnopqrstuvt',
      reason: 'backfill',
    });
    expect(typed.find((c) => c[0] === 'reindex')?.[1]).toEqual({
      tenantId: 'ckabcdefghijklmnopqrstuvt',
      noteIds: ['ckabcdefghijklmnopqrstuvn'],
      indexType: 'notes',
      reason: 'reembed-all',
    });
    for (const [, , opts] of typed) {
      expect(opts).toMatchObject({ attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      expect(String(opts['jobId'])).not.toContain(':');
    }
  });

  it('splits a tenant notes into jobs of at most 100 ids, with ids that repeat across runs', async () => {
    const notes = Array.from({ length: 250 }, (_, i) => ({
      id: `n${String(i).padStart(4, '0')}`,
      tenantId: 't1',
      embedding: vec,
    }));
    const store: Store = { contacts: [], contact_notes: notes, leads: [], lead_notes: [] };
    const jobs: Array<[string, { noteIds: string[] }, { jobId: string }]> = [];
    const open = vi.fn(async () => {
      const q = fakeQueue();
      q.queue.add.mockImplementation(async (...a: unknown[]) => {
        jobs.push(a as never);
      });
      return q.queue;
    });
    const log = quiet();
    const args = parseArgs(['--tenant', 't1', '--apply', '--tables', 'contact_notes']);
    await run(fakePrisma(store) as never, args, open);
    const first = jobs.map((j) => j[2].jobId);
    jobs.length = 0;
    await run(fakePrisma(store) as never, args, open);
    log.mockRestore();
    expect(jobs.map((j) => j[1].noteIds.length)).toEqual([100, 100, 50]);
    expect(jobs.map((j) => j[2].jobId)).toEqual(first);
  });

  it('does not queue notes of erased or restricted contacts, but still clears them', async () => {
    const store = seed();
    const prisma = fakePrisma(store, ['n1']);
    const { queue } = fakeQueue();
    const log = quiet();
    const results = await run(
      prisma as never,
      parseArgs(['--tenant', 't1', '--apply', '--tables', 'contact_notes']),
      async () => queue
    );
    log.mockRestore();
    expect(results[0]).toMatchObject({ cleared: 1, queued: 0 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('--all-tenants adds no tenant clause to any statement', async () => {
    const prisma = fakePrisma(seed());
    const log = quiet();
    await run(prisma as never, parseArgs(['--all-tenants']), vi.fn());
    log.mockRestore();
    expect(prisma.sqls.some((s) => s.includes('"tenantId" = $'))).toBe(false);
  });
});
