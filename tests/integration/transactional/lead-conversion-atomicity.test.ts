/**
 * DDD-001 — Lead→Deal conversion atomicity against the REAL database.
 *
 * Proves that ConvertLeadToDealUseCase commits Account + Contact + Opportunity +
 * Lead in a single transaction: on success all four exist and the Lead is
 * CONVERTED; on a mid-conversion failure the WHOLE thing rolls back — no
 * orphaned Account/Contact/Opportunity and the Lead is still QUALIFIED.
 *
 * Skips automatically when no integration DB is available (mirrors the other
 * DB-backed suites in this folder).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIsolatedTestPrismaClient } from '../setup';
// Relative source imports: the `integration` vitest project has no workspace
// alias and @intelliflow/adapters isn't symlinked, so we import the sources
// directly (same pattern as the application-package integration test).
import { PrismaLeadRepository } from '../../../packages/adapters/src/repositories/PrismaLeadRepository';
import { PrismaAccountRepository } from '../../../packages/adapters/src/repositories/PrismaAccountRepository';
import { PrismaContactRepository } from '../../../packages/adapters/src/repositories/PrismaContactRepository';
import { PrismaOpportunityRepository } from '../../../packages/adapters/src/repositories/PrismaOpportunityRepository';
import { PrismaTransactionManager } from '../../../packages/adapters/src/persistence/PrismaTransactionManager';
import { InMemoryEventBus } from '../../../packages/adapters/src/external/InMemoryEventBus';
import { ConvertLeadToDealUseCase } from '../../../packages/application/src/usecases/leads/ConvertLeadToDealUseCase';
import { Lead } from '../../../packages/domain/src/crm/lead/Lead';
import type { OpportunityRepository } from '../../../packages/domain/src/crm/opportunity/OpportunityRepository';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const TAG = `ddd001_${Date.now()}`;

describeDb('DDD-001 — Lead→Deal conversion atomicity (real DB)', () => {
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
    await prisma.opportunity.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.contact.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
    await prisma.$disconnect?.();
  });

  async function seedQualifiedLead(slug: string): Promise<string> {
    const created = Lead.create({
      email: `${TAG}-${slug}@example.com`,
      company: `${TAG}-${slug}-co`,
      ownerId,
      tenantId,
    });
    if (created.isFailure) throw new Error(created.error.message);
    const lead = created.value;
    const q = lead.qualify('qa', 'ready for conversion');
    if (q.isFailure) throw new Error(q.error.message);
    await new PrismaLeadRepository(prisma).save(lead);
    return lead.id.value;
  }

  function buildUseCase(opportunityRepo: OpportunityRepository) {
    return new ConvertLeadToDealUseCase(
      new PrismaLeadRepository(prisma),
      new PrismaContactRepository(prisma),
      new PrismaAccountRepository(prisma),
      opportunityRepo,
      new InMemoryEventBus(),
      new PrismaTransactionManager()
    );
  }

  it('commits Account + Contact + Opportunity + Lead together on success', async () => {
    if (!prisma) return;
    const leadId = await seedQualifiedLead('win');
    const dealName = `${TAG}-win-deal`;
    const accountName = `${TAG}-win-acct`;

    const result = await buildUseCase(new PrismaOpportunityRepository(prisma)).execute({
      leadId,
      dealName,
      dealValue: 1000,
      convertedBy: ownerId,
      accountName,
    });

    expect(result.isSuccess).toBe(true);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead.status).toBe('CONVERTED');
    expect(await prisma.account.count({ where: { name: accountName } })).toBe(1);
    expect(await prisma.contact.count({ where: { leadId } })).toBe(1);
    expect(await prisma.opportunity.count({ where: { name: dealName } })).toBe(1);
  });

  it('rolls back EVERYTHING when a mid-conversion write fails (no orphans)', async () => {
    if (!prisma) return;
    const leadId = await seedQualifiedLead('fail');
    const accountName = `${TAG}-fail-acct`;

    // Real repos except opportunity, which throws INSIDE the transaction after
    // Account + Contact have already been written to the tx.
    const failingOpportunityRepo = {
      save: async () => {
        throw new Error('injected opportunity save failure');
      },
    } as unknown as OpportunityRepository;

    const result = await buildUseCase(failingOpportunityRepo).execute({
      leadId,
      dealName: `${TAG}-fail-deal`,
      dealValue: 1000,
      convertedBy: ownerId,
      accountName,
    });

    expect(result.isFailure).toBe(true);

    // Nothing partial survived the rollback.
    expect(await prisma.account.count({ where: { name: accountName } })).toBe(0);
    expect(await prisma.contact.count({ where: { leadId } })).toBe(0);
    expect(await prisma.opportunity.count({ where: { name: `${TAG}-fail-deal` } })).toBe(0);

    // The source lead was never flipped to CONVERTED.
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead.status).toBe('QUALIFIED');
  });
});
