/**
 * PG-203 #1002 (owner ruling 2026-10-23: "Stop both, in PR 2") — AI insights and predictions
 * stop for a person who is erased or under a processing restriction.
 *
 * Runs the real data-request guard against a fake database: an ineligible person is never
 * sent to the model, and one erased or restricted while the model ran gets nothing written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  leads: new Map<string, string>(),
  contacts: new Map<string, string | null>(),
  /** Overrides what the FOR UPDATE re-read sees (the row changed during the model call). */
  lockedEmail: new Map<string, string>(),
  restricted: new Set<string>(),
}));
const mockPredictChurnRisk = vi.hoisted(() => vi.fn());
const mockNBAExecute = vi.hoisted(() => vi.fn());
const mockGenerateInsightsWithMeta = vi.hoisted(() => vi.fn());
const mockContactInvoke = vi.hoisted(() => vi.fn());
const mockCreateLLMForTenant = vi.hoisted(() => vi.fn());
const mockLeadAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockContactAIInsightUpsert = vi.hoisted(() => vi.fn());
const mockAIInsightCreate = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());

vi.mock('../../lib/llm-factory', () => ({
  getLLMBreaker: () => ({ execute: <T>(fn: () => Promise<T>) => fn() }),
  resolveFallbackProvider: () => null,
  createLLMForTenant: mockCreateLLMForTenant,
  createLLM: vi.fn(),
  createEmbeddings: vi.fn(() => ({
    embedQuery: vi.fn().mockResolvedValue([]),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../chains/churn-risk.chain', () => {
  class ChurnRiskChain {
    predictChurnRisk = mockPredictChurnRisk;
  }
  return { ChurnRiskChain, getChurnRiskChain: () => new ChurnRiskChain() };
});

vi.mock('../../agents/next-best-action.agent', () => ({
  createNBAAgent: () => ({ execute: mockNBAExecute }),
}));

vi.mock('../../chains/insight-generation.chain', () => ({
  getInsightGenerationChain: () => ({
    generateInsightsWithMeta: mockGenerateInsightsWithMeta,
    generateFallbackInsights: () => [],
  }),
}));

vi.mock('../../utils/audit-log', () => ({
  logAIAgentAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/conversation-record-logger', () => ({ logConversationRecord: vi.fn() }));
vi.mock('../../monitoring/hallucination-checker', () => ({
  hallucinationChecker: {
    checkOutput: vi
      .fn()
      .mockResolvedValue({ hallucinated: false, score: 0, hallucinationTypes: [] }),
  },
}));

vi.mock('@intelliflow/db', () => {
  const table = (rows: Map<string, string | null>) => ({
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      rows.has(where.id) ? { email: rows.get(where.id) ?? null } : null
    ),
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.filter((id) => rows.has(id)).map((id) => ({ id, email: rows.get(id) ?? null }))
    ),
  });
  const prisma: Record<string, unknown> = {
    lead: table(db.leads),
    contact: table(db.contacts),
    processingRestriction: {
      findFirst: vi.fn(async ({ where }: { where: { subjectEmail: string } }) =>
        db.restricted.has(where.subjectEmail) ? { id: 'r1' } : null
      ),
      findMany: vi.fn(async () => [...db.restricted].map((subjectEmail) => ({ subjectEmail }))),
    },
    $queryRaw: vi.fn(async (sql: TemplateStringsArray, ...values: string[]) => {
      const text = sql.join('?');
      if (text.includes('dsar_subject_lock(')) return [{ locked: 1 }];
      const rows = text.includes('FROM contacts') ? db.contacts : db.leads;
      const id = values[0]!;
      if (!rows.has(id)) return [];
      return [{ email: db.lockedEmail.get(id) ?? rows.get(id) ?? '' }];
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    leadAIInsight: { upsert: mockLeadAIInsightUpsert },
    contactAIInsight: { upsert: mockContactAIInsightUpsert },
    aIInsight: { findFirst: vi.fn().mockResolvedValue(null), create: mockAIInsightCreate },
    notification: { create: mockNotificationCreate, findFirst: vi.fn().mockResolvedValue(null) },
    leadActivity: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    contactActivity: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    task: { create: vi.fn() },
  };
  return { prisma };
});

import { processPredictionJob } from '../prediction.job';
import { processInsightJob } from '../insight-generation.job';
import { generateContactInsight } from '../../contact-insight.chain';

const TENANT = '00000000-0000-4000-a000-000000000001';
const LEAD = '00000000-0000-4000-a000-0000000000a1';
const OTHER_LEAD = '00000000-0000-4000-a000-0000000000a2';
const CONTACT = '00000000-0000-4000-a000-0000000000c1';
const ADA = 'ada@example.invalid';
const BOB = 'bob@example.invalid';
const erased = (id: string) => `erased-${id}@erased.invalid`;

function bullJob<T>(data: T) {
  return {
    id: 'job-1',
    data,
    token: 'lock-token',
    updateProgress: vi.fn(),
    extendLock: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const churnJob = (entityType: 'lead' | 'contact' | 'opportunity', entityId: string) =>
  bullJob({
    entityType,
    entityId,
    predictionType: 'CHURN_RISK',
    tenantId: TENANT,
    priority: 5,
    // The high-churn alert goes to this user, so "no alert" below is a real assertion.
    context: { userId: 'user-1' },
  });

const HIGH_CHURN = {
  riskScore: 0.9,
  riskLevel: 'HIGH',
  confidence: 0.9,
  topRiskFactors: [],
  explanation: 'High risk',
  recommendations: ['Call them'],
  primaryAction: 'Call them',
  slaHours: 24,
  executionTimeMs: 5,
  modelVersion: 'test:v1',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.leads.clear();
  db.contacts.clear();
  db.lockedEmail.clear();
  db.restricted.clear();
  mockPredictChurnRisk.mockResolvedValue(HIGH_CHURN);
  mockGenerateInsightsWithMeta.mockResolvedValue({ insights: [], source: 'llm' });
  mockCreateLLMForTenant.mockResolvedValue({
    withStructuredOutput: () => ({ invoke: mockContactInvoke }),
  });
  mockContactInvoke.mockResolvedValue({
    conversionProbability: 40,
    lifetimeValue: 1000,
    churnRisk: 'LOW',
    engagementScore: 60,
  });
});

describe('prediction job', () => {
  it.each([
    ['restricted', () => db.restricted.add(ADA)],
    ['erased', () => db.leads.set(LEAD, erased(LEAD))],
    ['missing', () => db.leads.delete(LEAD)],
  ])('skips the lead when %s, before the model call, and writes nothing', async (_label, setUp) => {
    db.leads.set(LEAD, ' Ada@Example.invalid ');
    setUp();

    await expect(processPredictionJob(churnJob('lead', LEAD))).resolves.toMatchObject({
      skipped: true,
      reason: 'data-subject-request',
    });
    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
    expect(mockLeadAIInsightUpsert).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('writes and notifies for an eligible lead, under its locks', async () => {
    db.leads.set(LEAD, ADA);

    await processPredictionJob(churnJob('lead', LEAD));

    expect(mockPredictChurnRisk).toHaveBeenCalledOnce();
    expect(mockLeadAIInsightUpsert).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledOnce();
  });

  it.each([
    ['erased', () => db.lockedEmail.set(LEAD, erased(LEAD))],
    ['restricted', () => db.restricted.add(ADA)],
  ])('writes nothing and sends no alert when %s during the model call', async (_label, change) => {
    db.leads.set(LEAD, ADA);
    mockPredictChurnRisk.mockImplementation(async () => {
      change();
      return HIGH_CHURN;
    });

    const result = await processPredictionJob(churnJob('lead', LEAD));

    // The job result is kept in Redis after completion: it carries no prediction either.
    expect(result).toEqual({ skipped: true, reason: 'data-subject-request' });
    expect(JSON.stringify(result)).not.toContain('Call them');
    expect(mockLeadAIInsightUpsert).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('sends no alert when the person is erased right after the prediction is stored', async () => {
    db.leads.set(LEAD, ADA);
    mockLeadAIInsightUpsert.mockImplementation(async () => {
      // The erasure commits between the prediction write and the alert.
      db.lockedEmail.set(LEAD, erased(LEAD));
      return {};
    });

    await processPredictionJob(churnJob('lead', LEAD));

    expect(mockLeadAIInsightUpsert).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('applies the same guard to a contact, which may have no email at all', async () => {
    db.contacts.set(CONTACT, null);
    await processPredictionJob(churnJob('contact', CONTACT));
    expect(mockContactAIInsightUpsert).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mockPredictChurnRisk.mockResolvedValue(HIGH_CHURN);
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(BOB);
    await expect(processPredictionJob(churnJob('contact', CONTACT))).resolves.toMatchObject({
      skipped: true,
    });
    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
  });

  it('does not consult data requests for an entity that is not a person', async () => {
    const { prisma } = (await import('@intelliflow/db')) as any;
    await processPredictionJob(churnJob('opportunity', LEAD));
    expect(mockPredictChurnRisk).toHaveBeenCalledOnce();
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.processingRestriction.findFirst).not.toHaveBeenCalled();
  });
});

describe('insight generation job', () => {
  const insightJob = () =>
    bullJob({
      tenantId: TENANT,
      userId: 'user-1',
      dealsAtRisk: [],
      overdueTasksCount: 0,
      hotLeads: [
        { id: LEAD, name: 'Kept lead', score: 80 },
        { id: OTHER_LEAD, name: 'Restricted lead', score: 90 },
      ],
      staleContacts: [{ id: CONTACT, name: 'Erased contact', daysSinceContact: 40 }],
    });

  const about = (entityType: 'lead' | 'contact', entityId: string) => ({
    entityId,
    entityType,
    type: 'opportunity',
    title: `About ${entityId}`,
    description: 'Worth a call.',
    suggestedActions: ['Call'],
    confidence: 0.8,
    priority: 'medium',
    reasoning: 'Score',
  });

  beforeEach(() => {
    db.leads.set(LEAD, ADA);
    db.leads.set(OTHER_LEAD, BOB);
    db.restricted.add(BOB);
    db.contacts.set(CONTACT, erased(CONTACT));
  });

  it('never sends an erased or restricted person to the model', async () => {
    await processInsightJob(insightJob());

    const [input] = mockGenerateInsightsWithMeta.mock.calls[0]!;
    expect(input.hotLeads.map((l: { id: string }) => l.id)).toEqual([LEAD]);
    expect(input.staleContacts).toEqual([]);
  });

  it('writes entity insights and insight records only for the people it kept', async () => {
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [about('lead', LEAD), about('lead', OTHER_LEAD), about('contact', CONTACT)],
      source: 'llm',
    });
    mockAIInsightCreate.mockResolvedValue({ id: 'ins-1' });

    await expect(processInsightJob(insightJob())).resolves.toMatchObject({ insightsCreated: 1 });

    expect(mockAIInsightCreate).toHaveBeenCalledOnce();
    expect(mockAIInsightCreate.mock.calls[0]![0].data.entityId).toBe(LEAD);
    expect(mockLeadAIInsightUpsert).toHaveBeenCalledOnce();
    expect(mockLeadAIInsightUpsert.mock.calls[0]![0].where.leadId_tenantId.leadId).toBe(LEAD);
    expect(mockContactAIInsightUpsert).not.toHaveBeenCalled();
  });

  it('writes nothing about a kept person restricted while the model ran', async () => {
    mockGenerateInsightsWithMeta.mockImplementation(async () => {
      db.restricted.add(ADA);
      return { insights: [about('lead', LEAD)], source: 'llm' };
    });

    await expect(processInsightJob(insightJob())).resolves.toMatchObject({ insightsCreated: 0 });
    expect(mockAIInsightCreate).not.toHaveBeenCalled();
    expect(mockLeadAIInsightUpsert).not.toHaveBeenCalled();
  });

  describe('high-priority side effects (activity, notification, task)', () => {
    const critical = () => ({ ...about('lead', LEAD), priority: 'critical' });

    it('writes them for a kept person', async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      mockGenerateInsightsWithMeta.mockResolvedValue({ insights: [critical()], source: 'llm' });
      mockAIInsightCreate.mockResolvedValue({ id: 'ins-1' });

      await processInsightJob(insightJob());

      expect(prisma.leadActivity.create).toHaveBeenCalledOnce();
      expect(mockNotificationCreate).toHaveBeenCalledOnce();
      expect(prisma.task.create).toHaveBeenCalledOnce();
    });

    it('writes none of them when the person is erased after the insight record', async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      mockGenerateInsightsWithMeta.mockResolvedValue({ insights: [critical()], source: 'llm' });
      mockAIInsightCreate.mockImplementation(async () => {
        // The erasure commits between the record write and the side effects.
        db.lockedEmail.set(LEAD, erased(LEAD));
        return { id: 'ins-1' };
      });

      await expect(processInsightJob(insightJob())).resolves.toMatchObject({ insightsCreated: 1 });

      expect(prisma.leadActivity.create).not.toHaveBeenCalled();
      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('keeps the insight when a side effect fails', async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      mockGenerateInsightsWithMeta.mockResolvedValue({ insights: [critical()], source: 'llm' });
      mockAIInsightCreate.mockResolvedValue({ id: 'ins-1' });
      prisma.$transaction
        .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
        .mockImplementationOnce(async () => {
          throw new Error('current transaction is aborted');
        });

      await expect(processInsightJob(insightJob())).resolves.toMatchObject({ insightsCreated: 1 });
    });
  });
});

describe('contact insight chain', () => {
  const input = { contactId: CONTACT, tenantId: TENANT, context: { activities: [], emails: [] } };

  it('skips a restricted contact before the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    db.restricted.add(ADA);

    await expect(generateContactInsight(input)).resolves.toEqual({
      success: false,
      reason: 'data-subject-request',
    });
    expect(mockCreateLLMForTenant).not.toHaveBeenCalled();
    expect(mockContactAIInsightUpsert).not.toHaveBeenCalled();
  });

  it('writes nothing when the contact is erased during the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    mockContactInvoke.mockImplementation(async () => {
      db.lockedEmail.set(CONTACT, erased(CONTACT));
      return { conversionProbability: 40, lifetimeValue: 0, churnRisk: 'LOW', engagementScore: 5 };
    });

    await expect(generateContactInsight(input)).resolves.toEqual({
      success: false,
      reason: 'data-subject-request',
    });
    expect(mockContactAIInsightUpsert).not.toHaveBeenCalled();
  });

  it('writes the insight for an eligible contact', async () => {
    db.contacts.set(CONTACT, ADA);
    await expect(generateContactInsight(input)).resolves.toMatchObject({ success: true });
    expect(mockContactAIInsightUpsert).toHaveBeenCalledOnce();
  });
});
