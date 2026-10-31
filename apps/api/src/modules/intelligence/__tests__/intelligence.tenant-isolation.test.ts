/**
 * Intelligence procedures are tenant-scoped (#1075 review).
 *
 * Before #1075 their z.uuid() id gates rejected every real (cuid) lead and contact id.
 * With recordIdSchema the lookups below are live, and `prismaWithTenant` adds no
 * tenant filter of its own (its session SET is not the tenant boundary, see
 * security/tenant-context.ts), so each lookup must filter on the caller's tenant.
 *
 * The fake database answers findUnique by id alone, as an unfiltered query would, and
 * findFirst by its where clause, so a lookup without the tenant leaks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intelligenceRouter } from '../intelligence.router';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { underQuota } from '../../../test/quota';

const mockQueueAdd = vi.hoisted(() => vi.fn());

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const OTHER_TENANT = 'cmothertenant000l8086a1b2c';
const FOREIGN_LEAD = 'cmforeignlead000l8086a1b2c';
const FOREIGN_CONTACT = 'cmforeigncontact0l8086a1b2';
const SECRET = 'FOREIGN-TENANT-ACTION';

function insight(tenantId: string, extra: Record<string, unknown>) {
  return {
    id: `insight-${tenantId}`,
    tenantId,
    churnRisk: 'HIGH',
    conversionProbability: 10,
    estimatedValue: 900000,
    lifetimeValue: 900000,
    engagementScore: 5,
    sentiment: 'NEGATIVE',
    sentimentTrend: 'DECLINING',
    lastEngagementDays: 40,
    nextBestAction: tenantId === OTHER_TENANT ? SECRET : 'Schedule Demo',
    recommendations: [],
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-02'),
    ...extra,
  };
}

const leads = [
  {
    id: TEST_UUIDS.lead1,
    tenantId: TEST_UUIDS.tenant,
    aiInsights: [insight(TEST_UUIDS.tenant, { leadId: TEST_UUIDS.lead1 })],
  },
  {
    id: FOREIGN_LEAD,
    tenantId: OTHER_TENANT,
    aiInsights: [insight(OTHER_TENANT, { leadId: FOREIGN_LEAD })],
  },
];
const contacts = [
  {
    id: TEST_UUIDS.contact1,
    tenantId: TEST_UUIDS.tenant,
    aiInsight: insight(TEST_UUIDS.tenant, { contactId: TEST_UUIDS.contact1 }),
  },
  {
    id: FOREIGN_CONTACT,
    tenantId: OTHER_TENANT,
    aiInsight: insight(OTHER_TENANT, { contactId: FOREIGN_CONTACT }),
  },
];

type Where = { where: { id: string; tenantId?: string } };
const byId =
  <T extends { id: string }>(rows: T[]) =>
  async ({ where }: Where) =>
    rows.find((r) => r.id === where.id) ?? null;
const byWhere =
  <T extends { id: string; tenantId: string }>(rows: T[]) =>
  async ({ where }: Where) =>
    rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null;

function caller() {
  return intelligenceRouter.createCaller(
    createTestContext({ services: { ...mockServices, quota: underQuota() as never } })
  );
}

beforeEach(() => {
  mockQueueAdd.mockReset();
  mockQueueAdd.mockResolvedValue({ id: 'job-1' });
  prismaMock.lead.findUnique.mockImplementation(byId(leads) as never);
  prismaMock.lead.findFirst.mockImplementation(byWhere(leads) as never);
  prismaMock.contact.findUnique.mockImplementation(byId(contacts) as never);
  prismaMock.contact.findFirst.mockImplementation(byWhere(contacts) as never);
  prismaMock.leadAIInsight.upsert.mockResolvedValue(leads[0].aiInsights[0] as never);
  prismaMock.contactAIInsight.upsert.mockResolvedValue(contacts[0].aiInsight as never);
});

/** Procedure calls on another tenant's lead or contact. */
const FOREIGN_CALLS: Array<[string, (c: ReturnType<typeof caller>) => Promise<unknown>]> = [
  ['getLeadInsights', (c) => c.getLeadInsights({ leadId: FOREIGN_LEAD })],
  ['getContactInsights', (c) => c.getContactInsights({ contactId: FOREIGN_CONTACT })],
  [
    'triggerPrediction (lead)',
    (c) =>
      c.triggerPrediction({
        entityType: 'lead',
        entityId: FOREIGN_LEAD,
        predictionType: 'CHURN_RISK',
      }),
  ],
  [
    'triggerPrediction (contact)',
    (c) =>
      c.triggerPrediction({
        entityType: 'contact',
        entityId: FOREIGN_CONTACT,
        predictionType: 'CHURN_RISK',
      }),
  ],
  ['updateLeadInsights', (c) => c.updateLeadInsights({ leadId: FOREIGN_LEAD, churnRisk: 'LOW' })],
  [
    'updateContactInsights',
    (c) => c.updateContactInsights({ contactId: FOREIGN_CONTACT, churnRisk: 'LOW' }),
  ],
];

describe('intelligence procedures are tenant-scoped', () => {
  it.each(FOREIGN_CALLS)(
    "%s: another tenant's record is NOT_FOUND and nothing is written or queued",
    async (_name, call) => {
      await expect(call(caller())).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(prismaMock.leadAIInsight.upsert).not.toHaveBeenCalled();
      expect(prismaMock.contactAIInsight.upsert).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['lead', FOREIGN_LEAD],
    ['contact', FOREIGN_CONTACT],
  ] as const)("getInsightsSummary returns nothing for another tenant's %s", async (type, id) => {
    await expect(
      caller().getInsightsSummary({ entityType: type, entityId: id })
    ).resolves.toBeNull();
  });

  it('still serves and updates the owning tenant', async () => {
    const c = caller();

    expect((await c.getLeadInsights({ leadId: TEST_UUIDS.lead1 }))?.nextBestAction).toBe(
      'Schedule Demo'
    );
    expect((await c.getContactInsights({ contactId: TEST_UUIDS.contact1 }))?.entityId).toBe(
      TEST_UUIDS.contact1
    );
    expect(
      await c.getInsightsSummary({ entityType: 'lead', entityId: TEST_UUIDS.lead1 })
    ).not.toBeNull();
    await c.updateLeadInsights({ leadId: TEST_UUIDS.lead1, churnRisk: 'LOW' });
    await c.updateContactInsights({ contactId: TEST_UUIDS.contact1, churnRisk: 'LOW' });
    await c.triggerPrediction({
      entityType: 'lead',
      entityId: TEST_UUIDS.lead1,
      predictionType: 'CHURN_RISK',
    });

    expect(prismaMock.leadAIInsight.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.contactAIInsight.upsert).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('reads only insight rows written in the caller tenant', async () => {
    await caller().getLeadInsights({ leadId: TEST_UUIDS.lead1 });

    expect(prismaMock.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEST_UUIDS.lead1, tenantId: TEST_UUIDS.tenant },
        include: { aiInsights: { where: { tenantId: TEST_UUIDS.tenant }, take: 1 } },
      })
    );
  });
});
