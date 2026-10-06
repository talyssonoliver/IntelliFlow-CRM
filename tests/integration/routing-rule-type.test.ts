/**
 * Routing rule discriminator — real-Database integration test.
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migration `20261004120000_routing_rule_type` on a real Postgres: rows written
 * without a ruleType are LEAD rules (what every pre-existing row becomes), ticket rules are kept
 * apart per tenant and per type, and the enum rejects anything else.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping routing-rule-type integration test: DATABASE_URL not set');
}

const RUN = `rrt_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;

describeDb('RoutingRule.ruleType (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      await prisma.routingRule.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    }
    await prisma.$disconnect();
  });

  const ticketConditions = [{ field: 'ticketCategory', operator: 'equals', value: 'BILLING' }];
  const ticketActions = [{ type: 'assign_to_skill', target: 'billing' }];

  function base(tenantId: string, name: string) {
    return {
      tenantId,
      name,
      conditions: ticketConditions,
      actions: ticketActions,
      createdBy: 'integration-test',
    };
  }

  it('defaults to LEAD, which is what every pre-existing row becomes', async () => {
    const row = await prisma.routingRule.create({ data: base(TENANT_A, 'default-type') });
    expect(row.ruleType).toBe('LEAD');
  });

  it('keeps ticket and lead rules apart per tenant', async () => {
    await prisma.routingRule.create({
      data: { ...base(TENANT_A, 'a-ticket'), ruleType: 'TICKET' },
    });
    await prisma.routingRule.create({ data: { ...base(TENANT_A, 'a-lead'), ruleType: 'LEAD' } });
    await prisma.routingRule.create({
      data: { ...base(TENANT_B, 'b-ticket'), ruleType: 'TICKET' },
    });

    const aTickets = await prisma.routingRule.findMany({
      where: { tenantId: TENANT_A, ruleType: 'TICKET' },
    });
    expect(aTickets.map((r: { name: string }) => r.name)).toEqual(['a-ticket']);

    const aLeads = await prisma.routingRule.findMany({
      where: { tenantId: TENANT_A, ruleType: 'LEAD' },
    });
    expect(aLeads.map((r: { name: string }) => r.name).sort()).toEqual(['a-lead', 'default-type']);
  });

  it('keeps tenant-scoped name uniqueness across rule types', async () => {
    await expect(
      prisma.routingRule.create({ data: { ...base(TENANT_A, 'a-ticket'), ruleType: 'LEAD' } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a rule type outside the enum', async () => {
    await expect(
      prisma.routingRule.create({ data: { ...base(TENANT_A, 'bad-type'), ruleType: 'OTHER' } })
    ).rejects.toThrow();
  });
});
