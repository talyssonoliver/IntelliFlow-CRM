/**
 * IFC-151 — outbox consumer framework against the REAL database.
 *
 * Proves the SQL the unit tests can only mock:
 *  - recordHandled appends to domain_events.metadata.handledBy atomically and
 *    is a no-op for a handler already recorded;
 *  - the next fetch maps handledBy back, so a retry skips that handler;
 *  - dead letters are listed without payloads and only a DEAD_LETTER row can be
 *    requeued.
 *
 * Skips automatically when no integration DB is available.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIsolatedTestPrismaClient } from '../setup';
// Relative source imports (see lead-conversion-atomicity.test.ts for why).
import { PrismaOutboxRepository } from '../../../packages/adapters/src/repositories/PrismaOutboxRepository';
import {
  EventDispatcher,
  PoisonMessageError,
} from '../../../apps/workers/events-worker/src/outbox/event-dispatcher';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const TAG = `ifc151_${Date.now()}`;
// pino does not resolve from tests/integration; the dispatcher only calls these methods.
const silent = (): any => {
  const noop = () => {};
  const log: any = { debug: noop, info: noop, warn: noop, error: noop };
  log.child = () => log;
  return log;
};

describeDb('IFC-151 — outbox consumer framework (real DB)', () => {
  let prisma: any;
  let repo: PrismaOutboxRepository;
  let tenantId = '';

  const newEvent = async (eventType = 'lead.created') =>
    repo.createEvent({
      eventType,
      aggregateType: 'Lead',
      aggregateId: `${TAG}-lead`,
      payload: {},
      metadata: { correlationId: `${TAG}-c`, version: '1.0' },
      tenantId,
    });

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    repo = new PrismaOutboxRepository(prisma);
    const tenant = await prisma.tenant.create({ data: { name: `${TAG}-t`, slug: `${TAG}-t` } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.domainEvent.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect?.();
  });

  it('records each successful handler once and a retry skips it', async () => {
    if (!prisma) return;
    const created = await newEvent();
    const dispatcher = new EventDispatcher(silent());
    let okRuns = 0;
    let flakyDown = true;
    dispatcher.register('lead.created', async () => void okRuns++, 'ok');
    dispatcher.register(
      'lead.created',
      async () => {
        if (flakyDown) throw new Error('down');
      },
      'flaky'
    );
    const dispatch = async () => {
      const event = (await repo.getEventById(created.id))!;
      return dispatcher.dispatch(event, {
        alreadyHandled: new Set(event.metadata.handledBy ?? []),
        onHandled: (name) => repo.recordHandled(created.id, name),
      });
    };

    await expect(dispatch()).rejects.toThrow('down');
    expect((await repo.getEventById(created.id))!.metadata.handledBy).toEqual(['ok']);

    // Recording the same handler again changes nothing.
    await repo.recordHandled(created.id, 'ok');
    expect((await repo.getEventById(created.id))!.metadata.handledBy).toEqual(['ok']);

    flakyDown = false;
    await expect(dispatch()).resolves.toEqual({ ran: ['flaky'], skipped: ['ok'] });
    expect(okRuns).toBe(1);
    expect((await repo.getEventById(created.id))!.metadata.handledBy).toEqual(['ok', 'flaky']);

    // The rest of the metadata is untouched.
    const row = await prisma.domainEvent.findUnique({ where: { id: created.id } });
    expect(row.metadata).toMatchObject({ correlationId: `${TAG}-c`, version: '1.0' });
  });

  it('concurrent records of different handlers both land', async () => {
    if (!prisma) return;
    const created = await newEvent();
    await Promise.all(['a', 'b', 'c'].map((name) => repo.recordHandled(created.id, name)));
    expect((await repo.getEventById(created.id))!.metadata.handledBy?.sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('lists dead letters without payloads and requeues only a dead letter', async () => {
    if (!prisma) return;
    const poisoned = await newEvent('task.created');
    const pending = await newEvent('task.created');
    await repo.recordHandled(poisoned.id, 'audit-logger');
    await repo.moveToDeadLetter(
      poisoned.id,
      `poison: ${new PoisonMessageError('no taskId').message}`
    );

    const letters = await repo.listDeadLetters({ tenantId, eventType: 'task.created' });
    expect(letters.map((l) => [l.id, l.lastError])).toEqual([[poisoned.id, 'poison: no taskId']]);
    expect(letters[0]).not.toHaveProperty('payload');

    expect(await repo.requeueDeadLetter(pending.id)).toBe(false);
    expect(await repo.requeueDeadLetter(poisoned.id)).toBe(true);
    expect(await repo.requeueDeadLetter(poisoned.id)).toBe(false);

    const replayed = (await repo.getEventById(poisoned.id))!;
    expect(replayed.status).toBe('pending');
    expect(replayed.retryCount).toBe(0);
    // A replay keeps the record, so it re-runs only the handlers that never succeeded.
    expect(replayed.metadata.handledBy).toEqual(['audit-logger']);
    expect(await repo.listDeadLetters({ tenantId })).toEqual([]);
  });
});
