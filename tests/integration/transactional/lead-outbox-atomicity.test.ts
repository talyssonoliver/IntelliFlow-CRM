/**
 * DDD-002 — Lead creation + domain-event outbox atomicity against the REAL DB.
 *
 * Proves the aggregate save and the outbox write share ONE transaction:
 *  - success: the lead row AND its LeadCreated outbox row are both committed;
 *  - outbox-write failure: the lead is rolled back too (no dual-write, no
 *    persisted lead without its event — ADR-011 zero-lost-events).
 *
 * Skips automatically when no integration DB is available.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIsolatedTestPrismaClient } from '../setup';
// Relative source imports (see lead-conversion-atomicity.test.ts for why).
import { PrismaLeadRepository } from '../../../packages/adapters/src/repositories/PrismaLeadRepository';
import { OutboxEventBusAdapter } from '../../../packages/adapters/src/events/OutboxEventBusAdapter';
import { PrismaTransactionManager } from '../../../packages/adapters/src/persistence/PrismaTransactionManager';
import { CreateLeadUseCase } from '../../../packages/application/src/usecases/leads/CreateLeadUseCase';
import type { EventBusPort } from '../../../packages/application/src/ports/external/EventBusPort';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const TAG = `ddd002_${Date.now()}`;

describeDb('DDD-002 — Lead + outbox atomicity (real DB)', () => {
  let prisma: any;
  let tenantId = '';
  let ownerId = '';

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    const tenant = await prisma.tenant.create({ data: { name: `${TAG}-t`, slug: `${TAG}-t` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({ data: { email: `${TAG}@example.com`, tenantId } });
    ownerId = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.domainEvent.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect?.();
  });

  it('commits the lead and its LeadCreated event in the same transaction', async () => {
    if (!prisma) return;
    const useCase = new CreateLeadUseCase(
      new PrismaLeadRepository(prisma),
      new OutboxEventBusAdapter({ prisma, defaultTenantId: tenantId }),
      new PrismaTransactionManager()
    );

    const result = await useCase.execute({
      email: `${TAG}-ok@example.com`,
      ownerId,
      tenantId,
    });

    expect(result.isSuccess).toBe(true);
    const leadId = result.value.id;

    // Lead persisted...
    expect(await prisma.lead.count({ where: { id: leadId } })).toBe(1);
    // ...and its domain event landed in the outbox atomically.
    const events = await prisma.domainEvent.findMany({ where: { aggregateId: leadId } });
    expect(events.length).toBeGreaterThan(0);
  });

  it('rolls the lead back when the outbox write fails (no dual-write)', async () => {
    if (!prisma) return;
    const email = `${TAG}-fail@example.com`;

    // Event bus that fails inside the transaction (simulates an outbox outage).
    const failingBus = {
      publish: async () => {},
      publishAll: async () => {
        throw new Error('injected outbox failure');
      },
      subscribe: async () => {},
    } as unknown as EventBusPort;

    const useCase = new CreateLeadUseCase(
      new PrismaLeadRepository(prisma),
      failingBus,
      new PrismaTransactionManager()
    );

    const result = await useCase.execute({ email, ownerId, tenantId });

    expect(result.isFailure).toBe(true);
    // The aggregate save was rolled back with the failed event write.
    expect(await prisma.lead.count({ where: { email } })).toBe(0);
  });
});
