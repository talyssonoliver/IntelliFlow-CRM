/**
 * MVP-012 #31 — a stage move leaves an activity entry that names the person who moved the deal,
 * proved on a real Postgres: recordStageMove writes the row, the unified feed reads it back, and
 * the actor is the user's name (not "System"). Skips only when DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaActivityFeedRepository } from '../../packages/adapters/src/repositories/PrismaActivityFeedRepository';
import { recordStageMove } from '../../apps/api/src/modules/opportunity/stage-move-record';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.log('Skipping stage-move-activity integration test: DATABASE_URL not set');

const RUN = `mvp012sm_${Date.now()}`;
const TENANT = `${RUN}_t`;
const USER = `${RUN}_u`;

describeDb('stage move activity (real database)', () => {
  let prisma: PrismaClient;
  let dealId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await prisma.tenant.create({ data: { id: TENANT, name: TENANT, slug: TENANT } });
    await prisma.user.create({
      data: { id: USER, tenantId: TENANT, email: `${RUN}@example.invalid`, name: 'Ada Mover' },
    });
    const account = await prisma.account.create({
      data: { name: 'Acme', tenantId: TENANT, ownerId: USER },
    });
    const deal = await prisma.opportunity.create({
      data: {
        name: 'Big Deal',
        value: 1000,
        stage: 'PROPOSAL',
        tenantId: TENANT,
        ownerId: USER,
        accountId: account.id,
      },
    });
    dealId = deal.id;
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.activityEvent.deleteMany({ where: { tenantId: TENANT } });
    await prisma.opportunity.deleteMany({ where: { tenantId: TENANT } });
    await prisma.account.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.$disconnect();
  });

  it('shows the move in the unified feed under the name of the user who made it', async () => {
    const ctx = { prisma, prismaWithTenant: prisma } as never;
    await recordStageMove(
      ctx,
      { id: { value: dealId }, name: 'Big Deal', stage: 'NEGOTIATION' },
      'PROPOSAL',
      'NEGOTIATION',
      { tenantId: TENANT, userId: USER }
    );

    const items = await new PrismaActivityFeedRepository(prisma as never).searchFeed(
      TENANT,
      'Stage changed',
      20,
      null,
      { entityId: dealId }
    );
    const move = items.find((i) => i.source === 'OPPORTUNITY_EVENT');
    expect(move?.title).toBe('Stage changed: Proposal to Negotiation');
    expect(move?.actor).toEqual({ id: USER, name: 'Ada Mover' });
    expect(move?.metadata).toMatchObject({ stageFrom: 'PROPOSAL', stageTo: 'NEGOTIATION' });
  });
});
