/**
 * PG-203 #1002 (owner ruling 2026-10-23: "Stop both, in PR 2") — AI insights and predictions
 * stop for a person who is erased or under a processing restriction. Q22 ("All AI paths, in
 * PR 2") extends that to contact enrichment, tag suggestions and reply drafts.
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
  /** Opportunity id -> its contact id (null: a deal with no contact). */
  deals: new Map<string, string | null>(),
  /** Addresses whose erasure request completed (no restriction is left behind for them). */
  erasedSubjects: new Set<string>(),
  /** Opportunity id -> its current name (default: `<id> renewal`). */
  dealNames: new Map<string, string>(),
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
const mockQualify = vi.hoisted(() => vi.fn());
const mockEnrich = vi.hoisted(() => vi.fn());
const mockContactUpdate = vi.hoisted(() => vi.fn());
const mockSuggestTags = vi.hoisted(() => vi.fn());
const mockDraftReply = vi.hoisted(() => vi.fn());
const mockReplyDraftCreate = vi.hoisted(() => vi.fn());

vi.mock('../../shared/enrichment-adapter', () => ({
  getEnrichmentAdapter: () => ({ enrichContact: mockEnrich }),
}));
vi.mock('../../contact-tag-suggestion.chain', () => ({ suggestContactTags: mockSuggestTags }));
vi.mock('../../contact-reply-draft.chain', () => ({ draftContactReply: mockDraftReply }));
vi.mock('../../agents/qualification.agent', () => ({
  createQualificationTask: vi.fn(() => ({})),
  qualificationAgent: { execute: mockQualify },
}));

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
    contact: {
      ...table(db.contacts),
      // The enrichment chain reads the whole row; company and title are empty, so filled in.
      findUnique: vi.fn(async ({ where }: { where: { tenantId_id: { id: string } } }) => {
        const id = where.tenantId_id.id;
        return db.contacts.has(id) ? { id, email: db.contacts.get(id), company: null } : null;
      }),
      update: mockContactUpdate,
    },
    contactAutomationSetting: {
      findUnique: vi.fn().mockResolvedValue({
        aiEnrichment: true,
        aiTagSuggestions: true,
        aiAutoReplyDrafting: true,
        aiInsightGeneration: true,
      }),
    },
    contactReplyDraft: { create: mockReplyDraftCreate },
    dsarRequest: {
      findFirst: vi.fn(async ({ where }: { where: { subjectEmail: string } }) =>
        db.erasedSubjects.has(where.subjectEmail) ? { id: 'dsar-1' } : null
      ),
    },
    opportunity: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => db.deals.has(id))
          .map((id) => ({
            id,
            contactId: db.deals.get(id) ?? null,
            name: db.dealNames.get(id) ?? `${id} renewal`,
          }))
      ),
    },
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
import { processEntityInsightJob } from '../entity-insight.job';
import { processEnrichmentJob } from '../enrichment.job';
import { enrichContact } from '../../contact-enrichment.chain';
import { processTagSuggestionJob } from '../tag-suggestion.job';
import { processReplyDraftJob } from '../reply-draft.job';

const TENANT = '00000000-0000-4000-a000-000000000001';
const LEAD = '00000000-0000-4000-a000-0000000000a1';
const OTHER_LEAD = '00000000-0000-4000-a000-0000000000a2';
const CONTACT = '00000000-0000-4000-a000-0000000000c1';
const DEAL = '00000000-0000-4000-a000-0000000000d1';
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

const churnJob = (entityType: 'lead' | 'contact' | 'opportunity' | 'account', entityId: string) =>
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
  db.deals.clear();
  db.dealNames.clear();
  db.erasedSubjects.clear();
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

  it('returns nothing about the person when the locked re-check cannot run (fails closed, codex)', async () => {
    const { prisma } = (await import('@intelliflow/db')) as any;
    db.leads.set(LEAD, ADA);
    prisma.$transaction.mockRejectedValueOnce(new Error('lock timeout'));

    await expect(processPredictionJob(churnJob('lead', LEAD))).resolves.toEqual({
      skipped: true,
      reason: 'eligibility-unverified',
    });
    expect(mockPredictChurnRisk).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("never sends a queued context that names an address other than the person's current one (codex)", async () => {
    // Queued for Ada's old address; the lead has since moved to Bob's (unrestricted).
    db.leads.set(LEAD, BOB);
    const queued = churnJob('lead', LEAD);
    queued.data.context = { userId: 'user-1', email: ' Ada@Example.invalid ', name: 'Ada' };

    await expect(processPredictionJob(queued)).resolves.toMatchObject({
      skipped: true,
      reason: 'data-subject-request',
    });
    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
  });

  it('checks a queued address even when the deal no longer has a contact (codex)', async () => {
    // Queued while Ada was the deal's contact; the contact was removed since, and Ada restricted.
    db.deals.set(DEAL, null);
    db.restricted.add(ADA);
    const queued = churnJob('opportunity', DEAL);
    queued.data.context = { userId: 'user-1', email: ADA, name: 'Ada' };

    await expect(processPredictionJob(queued)).resolves.toMatchObject({
      skipped: true,
      reason: 'data-subject-request',
    });
    expect(mockPredictChurnRisk).not.toHaveBeenCalled();
  });

  describe('a deal with no contact whose queued context names a person (codex HIGH)', () => {
    const unlinkedJob = () => {
      db.deals.set(DEAL, null);
      const queued = churnJob('opportunity', DEAL);
      queued.data.context = { userId: 'user-1', email: ' Ada@Example.invalid ', name: 'Ada' };
      return queued;
    };

    it.each([
      ['restricted', () => db.restricted.add(ADA)],
      ['erased', () => db.erasedSubjects.add(ADA)],
    ])('keeps nothing and sends no alert when %s during the model call', async (_label, change) => {
      const queued = unlinkedJob();
      mockPredictChurnRisk.mockImplementation(async () => {
        change();
        return HIGH_CHURN;
      });

      const result = await processPredictionJob(queued);

      expect(result).toEqual({ skipped: true, reason: 'data-subject-request' });
      expect(JSON.stringify(result)).not.toContain('Call them');
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('keeps the result and alerts while the address is clear, under its address lock', async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      const queued = unlinkedJob();

      const result = await processPredictionJob(queued);

      expect(result).not.toHaveProperty('skipped');
      expect(mockNotificationCreate).toHaveBeenCalledOnce();
      const locks = prisma.$queryRaw.mock.calls.filter(([sql]: [TemplateStringsArray]) =>
        sql.join('?').includes('dsar_subject_lock(')
      );
      expect(locks.length).toBeGreaterThan(0);
      expect(locks.every((call: unknown[]) => call[2] === ADA)).toBe(true);
    });

    it('sends no alert when the address is restricted after the result was re-checked', async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      const queued = unlinkedJob();
      prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        const value = await fn(prisma);
        db.restricted.add(ADA); // commits between the result re-check and the alert
        return value;
      });

      await processPredictionJob(queued);

      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });
  });

  it('applies the same guard to a contact', async () => {
    db.contacts.set(CONTACT, ADA);
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

  it('does not consult data requests for an account or a deal with no contact', async () => {
    const { prisma } = (await import('@intelliflow/db')) as any;
    await processPredictionJob(churnJob('account', '00000000-0000-4000-a000-0000000000e1'));
    db.deals.set(DEAL, null);
    await processPredictionJob(churnJob('opportunity', DEAL));
    expect(mockPredictChurnRisk).toHaveBeenCalledTimes(2);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.processingRestriction.findFirst).not.toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
  });

  describe('a deal follows its contact (Q22, codex)', () => {
    it.each([
      ['restricted', () => db.restricted.add(ADA)],
      ['erased', () => db.contacts.set(CONTACT, erased(CONTACT))],
    ])('skips a deal whose contact is %s, before the model call', async (_label, setUp) => {
      db.deals.set(DEAL, CONTACT);
      db.contacts.set(CONTACT, ADA);
      setUp();

      await expect(processPredictionJob(churnJob('opportunity', DEAL))).resolves.toMatchObject({
        skipped: true,
        reason: 'data-subject-request',
      });
      expect(mockPredictChurnRisk).not.toHaveBeenCalled();
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it('fails closed for a deal that no longer exists', async () => {
      await expect(processPredictionJob(churnJob('opportunity', DEAL))).resolves.toMatchObject({
        skipped: true,
      });
      expect(mockPredictChurnRisk).not.toHaveBeenCalled();
    });

    it('keeps nothing and sends no alert when the contact is restricted during the model call', async () => {
      db.deals.set(DEAL, CONTACT);
      db.contacts.set(CONTACT, ADA);
      mockPredictChurnRisk.mockImplementation(async () => {
        db.restricted.add(ADA);
        return HIGH_CHURN;
      });

      await expect(processPredictionJob(churnJob('opportunity', DEAL))).resolves.toMatchObject({
        skipped: true,
        reason: 'data-subject-request',
      });
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("alerts on an eligible contact's deal under the contact's locks", async () => {
      const { prisma } = (await import('@intelliflow/db')) as any;
      db.deals.set(DEAL, CONTACT);
      db.contacts.set(CONTACT, ADA);

      await expect(processPredictionJob(churnJob('opportunity', DEAL))).resolves.toMatchObject({
        entityType: 'opportunity',
        entityId: DEAL,
      });
      expect(mockNotificationCreate).toHaveBeenCalledOnce();
      // No insight table for deals: nothing is upserted for the contact.
      expect(mockContactAIInsightUpsert).not.toHaveBeenCalled();
      const lockedReads = prisma.$queryRaw.mock.calls.filter((c: [string[]]) =>
        c[0].join('?').includes('FROM contacts')
      );
      expect(lockedReads.length).toBeGreaterThan(0);
    });
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

  it('writes the audit entry after the locked write commits, not inside it (codex: pool)', async () => {
    const { prisma } = (await import('@intelliflow/db')) as any;
    const { logAIAgentAction } = (await import('../../utils/audit-log')) as any;
    let open = 0;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      open += 1;
      try {
        return await fn(prisma);
      } finally {
        open -= 1;
      }
    });
    const openAtAudit: number[] = [];
    logAIAgentAction.mockImplementation(async () => {
      openAtAudit.push(open);
    });
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [about('lead', LEAD)],
      source: 'llm',
    });
    mockAIInsightCreate.mockResolvedValue({ id: 'ins-1' });

    await expect(processInsightJob(insightJob())).resolves.toMatchObject({ insightsCreated: 1 });
    expect(logAIAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'AIInsight', resourceId: 'ins-1' })
    );
    expect(openAtAudit[0]).toBe(0);
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

describe('every prediction type (reviewer should-fix 1)', () => {
  it.each(['NEXT_BEST_ACTION', 'QUALIFICATION'] as const)(
    '%s: a restricted lead is never sent to the model',
    async (predictionType) => {
      db.leads.set(LEAD, ADA);
      db.restricted.add(ADA);
      const job = bullJob({
        entityType: 'lead',
        entityId: LEAD,
        predictionType,
        tenantId: TENANT,
        priority: 5,
      });

      await expect(processPredictionJob(job)).resolves.toEqual({
        skipped: true,
        reason: 'data-subject-request',
      });
      expect(mockNBAExecute).not.toHaveBeenCalled();
      expect(mockQualify).not.toHaveBeenCalled();
      expect(mockLeadAIInsightUpsert).not.toHaveBeenCalled();
    }
  );
});

describe('entity insight job (reviewer should-fix 2)', () => {
  it('runs the contact chain, which refuses a restricted contact before the model', async () => {
    db.contacts.set(CONTACT, ADA);
    db.restricted.add(ADA);

    await expect(
      processEntityInsightJob(
        bullJob({ entityType: 'contact', entityId: CONTACT, tenantId: TENANT })
      )
    ).resolves.toEqual({ result: { success: false, reason: 'data-subject-request' } });
    expect(mockCreateLLMForTenant).not.toHaveBeenCalled();
  });
});

describe('Q22: contact enrichment', () => {
  const job = () => bullJob({ entityType: 'contact', entityId: CONTACT, tenantId: TENANT });

  beforeEach(() => {
    mockEnrich.mockResolvedValue({ company: 'Engines Ltd', modelVersion: 'm1', source: 'llm' });
  });

  it('never sends a restricted contact to the model', async () => {
    db.contacts.set(CONTACT, ADA);
    db.restricted.add(ADA);
    await processEnrichmentJob(job());
    expect(mockEnrich).not.toHaveBeenCalled();
    expect(mockContactUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing back onto a contact erased during the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    mockEnrich.mockImplementation(async () => {
      db.lockedEmail.set(CONTACT, erased(CONTACT));
      return { company: 'Engines Ltd', modelVersion: 'm1', source: 'llm' };
    });
    await expect(processEnrichmentJob(job())).resolves.toEqual({
      enrichment: { success: false, reason: 'data-subject-request' },
    });
    expect(mockContactUpdate).not.toHaveBeenCalled();
  });

  it('never sends a seed whose address is not the contact checked (codex)', async () => {
    // The contact moved from Ada's address to Bob's; Ada's address is restricted. A seed still
    // carrying Ada's address must not reach the provider, nor fill Bob's record.
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(ADA);
    await expect(
      enrichContact({
        contactId: CONTACT,
        tenantId: TENANT,
        seed: { email: ' Ada@Example.invalid ', firstName: 'Ada', lastName: 'Lovelace' },
      })
    ).resolves.toEqual({ success: false, reason: 'data-subject-request' });
    expect(mockEnrich).not.toHaveBeenCalled();
    expect(mockContactUpdate).not.toHaveBeenCalled();
  });

  it('fills the empty fields of an eligible contact', async () => {
    db.contacts.set(CONTACT, ADA);
    await processEnrichmentJob(job());
    expect(mockContactUpdate).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: TENANT, id: CONTACT } },
      data: { company: 'Engines Ltd' },
    });
  });
});

describe('Q22: contact tag suggestions', () => {
  const job = () =>
    bullJob({
      entityType: 'contact',
      entityId: CONTACT,
      tenantId: TENANT,
      profileSnapshot: { firstName: 'Ada', bio: 'Met at the fair' },
    });

  it('suggests nothing and sends nothing for a restricted contact', async () => {
    db.contacts.set(CONTACT, ADA);
    db.restricted.add(ADA);
    await expect(processTagSuggestionJob(job())).resolves.toEqual({
      suggestions: [],
      modelVersion: 'data-subject-request',
    });
    expect(mockSuggestTags).not.toHaveBeenCalled();
  });

  it('asks the model for an eligible contact', async () => {
    db.contacts.set(CONTACT, ADA);
    mockSuggestTags.mockResolvedValue({ suggestions: [], modelVersion: 'm1' });
    await processTagSuggestionJob(job());
    expect(mockSuggestTags).toHaveBeenCalledOnce();
    // The profile is read from the row now; the queued snapshot (which may predate an
    // erasure) is never sent (codex).
    expect(JSON.stringify(mockSuggestTags.mock.calls[0])).not.toContain('Met at the fair');
  });
});

describe('Q22: contact reply drafts', () => {
  const job = () =>
    bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: ADA, body: 'Can we meet?', at: '2026-10-23T09:00:00Z' }],
    });
  const draft = {
    success: true,
    draft: { draftSubject: 'Re: meeting', draftBody: 'Yes', confidence: 0.8, modelVersion: 'm1' },
  };

  it('never sends the thread of a restricted contact to the model', async () => {
    db.contacts.set(CONTACT, ADA);
    db.restricted.add(ADA);
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(mockDraftReply).not.toHaveBeenCalled();
    expect(mockReplyDraftCreate).not.toHaveBeenCalled();
  });

  it('never sends a queued thread that names a restricted address (codex)', async () => {
    // Queued for Ada's old address; the contact is now Bob's, and Ada is restricted.
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(ADA);
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [
        {
          from: 'Ada Lovelace <Ada@Example.invalid>',
          body: 'Can we meet?',
          at: '2026-10-23T09:00:00Z',
        },
      ],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ skipped: true });
    expect(mockDraftReply).not.toHaveBeenCalled();
  });

  it.each([
    ['a comment form', `John (${'Ada@Example.invalid'})`],
    ['a mailto: prefix', 'mailto:ada@example.invalid'],
    ['a trailing full stop', 'ada@example.invalid.'],
    ['single quotes around it', "'ada@example.invalid'"],
  ])('finds a restricted address written in %s (codex)', async (_label, header) => {
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(ADA);
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: header, body: 'Hello', at: '2026-10-23T09:00:00Z' }],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ skipped: true });
    expect(mockDraftReply).not.toHaveBeenCalled();
  });

  it("keeps an apostrophe in an address: o'neil@ is checked as written (codex)", async () => {
    const oneil = "o'neil@example.invalid";
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(oneil);
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: `Siobhan O'Neil <${oneil}>`, body: 'Hi', at: '2026-10-23T09:00:00Z' }],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ skipped: true });
    expect(mockDraftReply).not.toHaveBeenCalled();
  });

  it('never sends a queued thread from a person whose erasure completed (codex)', async () => {
    db.contacts.set(CONTACT, BOB);
    db.erasedSubjects.add(ADA);
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: ADA, to: BOB, body: 'Can we meet?', at: '2026-10-23T09:00:00Z' }],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ skipped: true });
    expect(mockDraftReply).not.toHaveBeenCalled();
  });

  it('stores no draft when another person in the thread is restricted during the model call (codex)', async () => {
    db.contacts.set(CONTACT, ADA);
    mockDraftReply.mockImplementation(async () => {
      db.restricted.add(BOB);
      return draft;
    });
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: ADA, to: BOB, body: 'Bob asked too', at: '2026-10-23T09:00:00Z' }],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ skipped: true });
    expect(mockReplyDraftCreate).not.toHaveBeenCalled();
  });

  it('locks every thread address in one sorted order, so drafts on one thread cannot deadlock (codex)', async () => {
    const { prisma } = (await import('@intelliflow/db')) as any;
    db.contacts.set(CONTACT, BOB);
    mockDraftReply.mockResolvedValue(draft);
    mockReplyDraftCreate.mockResolvedValue({ id: 'draft-1' });
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: ADA, to: BOB, body: 'Both of us', at: '2026-10-23T09:00:00Z' }],
    });
    await processReplyDraftJob(queued);
    const locked = prisma.$queryRaw.mock.calls
      .filter((c: [string[]]) => c[0].join('?').includes('dsar_subject_lock('))
      .map((c: unknown[]) => c[2]);
    // The contact is Bob, yet ada@ is locked first: one sorted order for every job.
    expect(locked).toEqual([ADA, BOB]);
    expect(mockReplyDraftCreate).toHaveBeenCalledOnce();
  });

  it('drafts for a person who came back after an old erasure: their own address is checked as a contact (codex)', async () => {
    db.contacts.set(CONTACT, ADA);
    db.erasedSubjects.add(ADA);
    mockDraftReply.mockResolvedValue(draft);
    mockReplyDraftCreate.mockResolvedValue({ id: 'draft-2' });
    const queued = bullJob({
      contactId: CONTACT,
      tenantId: TENANT,
      emailThread: [{ from: ADA, body: 'I am back', at: '2026-10-23T09:00:00Z' }],
    });
    await expect(processReplyDraftJob(queued)).resolves.toEqual({ draftId: 'draft-2' });
  });

  it('stores no draft for a contact restricted during the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    mockDraftReply.mockImplementation(async () => {
      db.restricted.add(ADA);
      return draft;
    });
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(mockReplyDraftCreate).not.toHaveBeenCalled();
  });

  it('stores the draft for an eligible contact', async () => {
    db.contacts.set(CONTACT, ADA);
    mockDraftReply.mockResolvedValue(draft);
    mockReplyDraftCreate.mockResolvedValue({ id: 'draft-1' });
    await expect(processReplyDraftJob(job())).resolves.toEqual({ draftId: 'draft-1' });
  });
});

describe('deals at risk follow their contact (reviewer must-fix 3)', () => {
  const DEAL_HELD = 'deal-held';
  const DEAL_OPEN = 'deal-no-contact';
  const DEAL_KEPT = 'deal-kept';
  const dealJob = (ids: string[]) =>
    bullJob({
      tenantId: TENANT,
      userId: 'user-1',
      dealsAtRisk: ids.map((id) => ({ id, name: `${id} renewal`, daysSinceUpdate: 30 })),
      overdueTasksCount: 0,
      hotLeads: [],
      staleContacts: [],
    });
  const aboutDeal = (id: string) => ({
    entityId: id,
    entityType: 'opportunity',
    type: 'warning',
    title: `About ${id}`,
    description: 'Gone quiet.',
    suggestedActions: ['Call'],
    confidence: 0.8,
    priority: 'medium',
    reasoning: 'Inactivity',
  });

  it('drops a deal whose contact is restricted; keeps a deal with no contact', async () => {
    db.contacts.set(CONTACT, BOB);
    db.restricted.add(BOB);
    db.deals.set(DEAL_HELD, CONTACT);
    db.deals.set(DEAL_OPEN, null);

    await processInsightJob(dealJob([DEAL_HELD, DEAL_OPEN]));

    const [input] = mockGenerateInsightsWithMeta.mock.calls[0]!;
    expect(input.dealsAtRisk.map((d: { id: string }) => d.id)).toEqual([DEAL_OPEN]);
  });

  it('sends the deal as it is now, never the queued name (codex: contact replaced since)', async () => {
    // Queued as "Ada's renewal" while Ada was its contact; the deal now belongs to Bob.
    db.contacts.set(CONTACT, BOB);
    db.deals.set(DEAL_KEPT, CONTACT);
    db.dealNames.set(DEAL_KEPT, 'Engines renewal');
    const queued = dealJob([DEAL_KEPT]);
    queued.data.dealsAtRisk[0].name = "Ada Lovelace's renewal";

    await processInsightJob(queued);

    const [input] = mockGenerateInsightsWithMeta.mock.calls[0]!;
    expect(input.dealsAtRisk.map((d: { name: string }) => d.name)).toEqual(['Engines renewal']);
    expect(JSON.stringify(input)).not.toContain('Ada Lovelace');
  });

  it('writes no insight about a kept deal whose contact is restricted during the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    db.deals.set(DEAL_KEPT, CONTACT);
    mockGenerateInsightsWithMeta.mockImplementation(async () => {
      db.restricted.add(ADA);
      return { insights: [aboutDeal(DEAL_KEPT)], source: 'llm' };
    });

    await expect(processInsightJob(dealJob([DEAL_KEPT]))).resolves.toMatchObject({
      insightsCreated: 0,
    });
    expect(mockAIInsightCreate).not.toHaveBeenCalled();
  });

  it('writes the insight about a deal with no contact as before', async () => {
    db.deals.set(DEAL_OPEN, null);
    mockGenerateInsightsWithMeta.mockResolvedValue({
      insights: [aboutDeal(DEAL_OPEN)],
      source: 'llm',
    });
    mockAIInsightCreate.mockResolvedValue({ id: 'ins-1' });

    await expect(processInsightJob(dealJob([DEAL_OPEN]))).resolves.toMatchObject({
      insightsCreated: 1,
    });
  });
});

describe('Q22: tag suggestions made while the person is restricted (codex)', () => {
  it('returns none when the contact is restricted during the model call', async () => {
    db.contacts.set(CONTACT, ADA);
    mockSuggestTags.mockImplementation(async () => {
      db.restricted.add(ADA);
      return {
        suggestions: [{ label: 'vip', confidence: 0.9, reason: 'Ada is a VIP' }],
        modelVersion: 'm1',
      };
    });

    await expect(
      processTagSuggestionJob(
        bullJob({
          entityType: 'contact',
          entityId: CONTACT,
          tenantId: TENANT,
          profileSnapshot: { firstName: 'Ada' },
        })
      )
    ).resolves.toEqual({ suggestions: [], modelVersion: 'data-subject-request' });
  });
});
