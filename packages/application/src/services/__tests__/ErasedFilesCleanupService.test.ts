import { describe, expect, it, vi } from 'vitest';
import { ErasedFilesCleanupService } from '../ErasedFilesCleanupService';
import type {
  PendingStoredObject,
  StoredObjectOutboxPort,
  StoredObjectSettlement,
} from '../../ports/repositories/StoredObjectOutboxPort';
import type {
  StoredObjectDeleteFailure,
  StoredObjectDeletionPort,
} from '../../ports/external/StorageServicePort';

const NOW = new Date('2026-11-27T10:00:00Z');
const T = 'tenant-a';
const R = 'request-1';

/** The outbox as a Map: PENDING rows are deleted, failures raise `attempts`. */
class FakeOutbox implements StoredObjectOutboxPort {
  rows = new Map<string, PendingStoredObject & { state: 'PENDING' | 'MANUAL' | 'DELETED' }>();
  constructor(paths: string[], manual = 0) {
    paths.forEach((path, i) =>
      this.rows.set(`o${i}`, {
        id: `o${i}`,
        source: i % 2 === 0 ? 'EMAIL_ATTACHMENT' : 'LEAD_FILE',
        bucket: 'crm-files',
        path,
        attempts: 0,
        state: 'PENDING',
      })
    );
    for (let i = 0; i < manual; i += 1) {
      this.rows.set(`m${i}`, {
        id: `m${i}`,
        source: 'CHAT_ATTACHMENT',
        bucket: '',
        path: 'https://files.example.invalid/x',
        attempts: 0,
        state: 'MANUAL',
      });
    }
  }
  async pending(_t: string, _r: string, limit: number) {
    return [...this.rows.values()].filter((r) => r.state === 'PENDING').slice(0, limit);
  }
  async settle(_t: string, _r: string, results: StoredObjectSettlement[]) {
    for (const res of results) {
      const row = this.rows.get(res.id);
      if (!row || row.state !== 'PENDING') continue;
      if (res.deleted) row.state = 'DELETED';
      else row.attempts += 1;
    }
  }
  async leftFor(_t: string, requestIds: string[]) {
    if (!requestIds.includes(R) || this.rows.size === 0) return {};
    const all = [...this.rows.values()];
    return {
      [R]: {
        queued: all.filter((r) => r.state === 'PENDING').length,
        manual: all.filter((r) => r.state === 'MANUAL').length,
      },
    };
  }
  async manual() {
    return [...this.rows.values()]
      .filter((r) => r.state === 'MANUAL')
      .map((r) => ({ id: r.id, source: r.source, locator: r.path }));
  }
  async markHandled(_t: string, _r: string, ids: string[]) {
    let n = 0;
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row?.state === 'MANUAL') {
        row.state = 'DELETED';
        n += 1;
      }
    }
    return n;
  }
  async remaining() {
    const keys = {
      EMAIL_ATTACHMENT: 'storedEmailAttachments',
      LEAD_FILE: 'storedLeadFiles',
      CHAT_ATTACHMENT: 'storedChatAttachments',
      TICKET_ATTACHMENT: 'storedTicketAttachments',
    } as const;
    const counts: Record<string, number> = {};
    for (const r of this.rows.values()) {
      if (r.state !== 'DELETED') counts[keys[r.source]] = (counts[keys[r.source]] ?? 0) + 1;
    }
    return counts;
  }
}

function storage(fail: (path: string, call: number) => StoredObjectDeleteFailure | null) {
  let call = 0;
  const calls: string[][] = [];
  const port: StoredObjectDeletionPort = {
    async deleteStoredObjects(_tenant, objects) {
      call += 1;
      calls.push(objects.map((o) => o.path));
      const failed = objects.flatMap((o) => {
        const code = fail(o.path, call);
        return code ? [{ id: o.id, code }] : [];
      });
      return { failed };
    },
  };
  return { port, calls };
}

const service = (outbox: FakeOutbox, port: StoredObjectDeletionPort | null, extra = {}) =>
  new ErasedFilesCleanupService(outbox, port, { sleep: async () => undefined, ...extra });

describe('ErasedFilesCleanupService (IFC-316)', () => {
  it('deletes every queued object and leaves nothing on the checklist', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b', 't/c']);
    const { port } = storage(() => null);
    expect(await service(outbox, port).purge(T, R, NOW)).toEqual({ deleted: 3, remaining: {} });
  });

  it('retries only what failed, a bounded number of times, then leaves it listed by source', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b']);
    const { port, calls } = storage((path) => (path === 't/b' ? 'STORAGE_ERROR' : null));
    const result = await service(outbox, port, { attempts: 3 }).purge(T, R, NOW);
    expect(result).toEqual({ deleted: 1, remaining: { storedLeadFiles: 1 } });
    // Pass 1 sent both; passes 2 and 3 only the one that failed.
    expect(calls).toEqual([['t/a', 't/b'], ['t/b'], ['t/b']]);
    expect(outbox.rows.get('o1')!.attempts).toBe(3);
  });

  it('succeeds on a later pass when storage recovers', async () => {
    const outbox = new FakeOutbox(['t/a']);
    const { port } = storage((_p, call) => (call < 2 ? 'STORAGE_ERROR' : null));
    expect(await service(outbox, port).purge(T, R, NOW)).toEqual({ deleted: 1, remaining: {} });
  });

  it('pauses between passes with growing waits', async () => {
    const outbox = new FakeOutbox(['t/a']);
    const { port } = storage(() => 'STORAGE_ERROR');
    const sleep = vi.fn(async () => undefined);
    await new ErasedFilesCleanupService(outbox, port, { attempts: 3, sleep }).purge(T, R, NOW);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 1000]);
  });

  it('never retries an object the storage port refuses (outside the tenant or the buckets)', async () => {
    const outbox = new FakeOutbox(['t/a']);
    const { port, calls } = storage(() => 'REFUSED');
    const result = await service(outbox, port).purge(T, R, NOW);
    expect(calls).toHaveLength(1);
    expect(result.remaining).toEqual({ storedEmailAttachments: 1 });
  });

  it('treats a storage call that throws as a failed batch, not a failed erasure', async () => {
    const outbox = new FakeOutbox(['t/a']);
    const port: StoredObjectDeletionPort = {
      deleteStoredObjects: vi.fn().mockRejectedValue(new Error('network')),
    };
    await expect(service(outbox, port, { attempts: 2 }).purge(T, R, NOW)).resolves.toEqual({
      deleted: 0,
      remaining: { storedEmailAttachments: 1 },
    });
  });

  it('is safe to run again: a second run finds nothing pending and deletes nothing', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b']);
    const { port, calls } = storage(() => null);
    const cleanup = service(outbox, port);
    await cleanup.purge(T, R, NOW);
    expect(await cleanup.purge(T, R, NOW)).toEqual({ deleted: 0, remaining: {} });
    expect(calls).toHaveLength(1);
  });

  it('a retry after a failure deletes what is left, and counts manual files until the admin clears them', async () => {
    const outbox = new FakeOutbox(['t/a'], 1);
    let down = true;
    const port: StoredObjectDeletionPort = {
      async deleteStoredObjects(_t, objects) {
        return {
          failed: down ? objects.map((o) => ({ id: o.id, code: 'STORAGE_ERROR' as const })) : [],
        };
      },
    };
    const cleanup = service(outbox, port, { attempts: 1 });
    expect((await cleanup.purge(T, R, NOW)).remaining).toEqual({
      storedEmailAttachments: 1,
      storedChatAttachments: 1,
    });
    down = false;
    expect(await cleanup.purge(T, R, NOW)).toEqual({
      deleted: 1,
      remaining: { storedChatAttachments: 1 },
    });
  });

  it('sends storage calls in batches', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b', 't/c']);
    const { port, calls } = storage(() => null);
    await service(outbox, port, { batchSize: 2 }).purge(T, R, NOW);
    expect(calls).toEqual([['t/a', 't/b'], ['t/c']]);
  });

  it('takes on at most maxObjects per run and leaves the rest queued', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b', 't/c']);
    const { port } = storage(() => null);
    const cleanup = service(outbox, port, { maxObjects: 2 });
    expect((await cleanup.purge(T, R, NOW)).remaining).toEqual({ storedEmailAttachments: 1 });
    expect(await cleanup.purge(T, R, NOW)).toEqual({ deleted: 1, remaining: {} });
  });

  it('without storage nothing is deleted and everything stays on the checklist', async () => {
    const outbox = new FakeOutbox(['t/a', 't/b']);
    expect(await service(outbox, null).purge(T, R, NOW)).toEqual({
      deleted: 0,
      remaining: { storedEmailAttachments: 1, storedLeadFiles: 1 },
    });
  });

  it('never throws when the queue itself is unreadable', async () => {
    const outbox = new FakeOutbox([]);
    vi.spyOn(outbox, 'pending').mockRejectedValue(new Error('db down'));
    const { port } = storage(() => null);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(service(outbox, port).purge(T, R, NOW)).resolves.toEqual({
      deleted: 0,
      remaining: {},
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('db down');
    error.mockRestore();
  });

  it('reports what is left for a list of requests, split into queued and manual', async () => {
    const outbox = new FakeOutbox(['t/a'], 2);
    expect(await service(outbox, null).leftFor(T, [R])).toEqual({ [R]: { queued: 1, manual: 2 } });
    // A request that never queued a file is absent: no claim is made for it.
    expect(await service(new FakeOutbox([]), null).leftFor(T, [R])).toEqual({});
  });

  it('lists the files left for the admin and records the ones the admin deleted by hand', async () => {
    const outbox = new FakeOutbox(['t/a'], 2);
    const cleanup = service(outbox, null);
    const files = await cleanup.manualFiles(T, R);
    expect(files).toEqual([
      { id: 'm0', source: 'CHAT_ATTACHMENT', locator: 'https://files.example.invalid/x' },
      { id: 'm1', source: 'CHAT_ATTACHMENT', locator: 'https://files.example.invalid/x' },
    ]);
    // A queued object is not the admin's to confirm: only manual files change.
    expect(await cleanup.confirmManual(T, R, ['m0', 'o0'], NOW)).toBe(1);
    expect((await cleanup.purge(T, R, NOW)).remaining).toEqual({
      storedEmailAttachments: 1,
      storedChatAttachments: 1,
    });
  });
});
