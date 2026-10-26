/**
 * AI security audit - real-database integration test.
 *
 * DurableAuditLogAdapter wrote columns `security_events` does not have and AI
 * event types its enum does not allow, so every AI security event in production
 * failed with a PrismaClientValidationError and was lost. It now writes only
 * `audit_log_entries`. A mocked Prisma client cannot prove that a row lands, so
 * these assertions run against the real schema, through both production callers:
 * the API's GuardrailsAIService and ai-worker's logAIAgentAction.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { DurableAuditLogAdapter } from '../../packages/adapters/src/audit/DurableAuditLogAdapter';
import { GuardrailsAIService } from '../../packages/adapters/src/external/GuardrailsAIService';
import { logAIAgentAction, setAuditLogAdapter } from '../../apps/ai-worker/src/utils/audit-log';
import { Result, resetRateLimit } from '../../packages/domain/src';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('⏭️  Skipping ai-security-audit integration test: DATABASE_URL not set');
}

const TAG = `aiaudit_${Date.now()}`;
const SIGNING_KEY = Buffer.from(`${TAG}-signing`, 'utf-8');

describeDb('AI security audit persistence', () => {
  let prisma: any;
  let tenantId: string;
  let adapter: DurableAuditLogAdapter;
  let dbReady = false;

  const rows = (where: Record<string, unknown> = {}) =>
    prisma.auditLogEntry.findMany({ where: { tenantId, ...where }, orderBy: { timestamp: 'asc' } });

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
    resetRateLimit();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const tenant = await prisma.tenant.create({ data: { name: TAG, slug: TAG } });
    tenantId = tenant.id;
    adapter = new DurableAuditLogAdapter(prisma, SIGNING_KEY, { encryptPII: false });
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) await prisma.tenant.deleteMany({ where: { slug: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it('persists a guardrails failure from the API path under the lead tenant', async () => {
    const inner = {
      scoreLead: vi.fn().mockRejectedValue(new Error('provider down')),
      qualifyLead: vi.fn(),
      generateEmail: vi.fn(),
    };
    // apps/api/src/container.ts config, DEFAULT_TENANT_ID unset.
    const service = new GuardrailsAIService(inner as any, adapter, {
      userId: 'system',
      tenantId: 'default',
      enableBiasDetection: true,
      enableLogging: true,
    });

    const leadId = `${TAG}_lead`;
    const result = await service.scoreLead(
      { email: 'jane@acme.example.invalid', company: 'Acme', title: 'CTO' } as any,
      { tenantId, leadId }
    );
    expect(result.isFailure).toBe(true);

    const [row] = await rows({ resourceId: leadId });
    expect(row).toMatchObject({
      tenantId,
      eventType: 'AI_CHAIN_FAILURE',
      action: 'AI_SCORE',
      actionResult: 'FAILURE',
      actorType: 'SYSTEM',
      actorId: null,
      resourceType: 'lead',
      resourceId: leadId,
    });
    expect(row.metadata.audit.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.metadata.audit.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(row.metadata.details).toMatchObject({ errorCode: 'AI_GUARDRAILS_ERROR' });

    await expect(adapter.verifyLogIntegrity(row.eventId)).resolves.toMatchObject({ valid: true });
  });

  it('persists an ai-worker agent write (utils/audit-log) as an AI_AGENT row', async () => {
    setAuditLogAdapter(adapter);
    const resourceId = `${TAG}_insight`;

    await logAIAgentAction({
      tenantId,
      agentName: 'lead-insight-agent',
      resourceType: 'LeadAIInsight',
      resourceId,
      action: 'UPSERT',
    });

    const [row] = await rows({ resourceId });
    expect(row).toMatchObject({
      eventType: 'AI_GUARDRAIL_TRIGGERED',
      action: 'UPDATE',
      actionResult: 'SUCCESS',
      actorType: 'AI_AGENT',
      actorId: null,
      resourceType: 'LeadAIInsight',
    });
    expect(row.metadata.modelId).toBe('lead-insight-agent');
    await expect(adapter.verifyLogIntegrity(row.eventId)).resolves.toMatchObject({ valid: true });
  });

  it('chains consecutive rows through previousHash', async () => {
    const event = (resourceId: string) => ({
      eventType: 'AI_PII_EXPOSURE_BLOCKED' as const,
      severity: 'MEDIUM' as const,
      tenantId,
      userId: 'system',
      resourceId,
      description: 'chain test',
      metadata: {
        modelId: 'm',
        modelVersion: '1',
        guardrailId: 'g',
        guardrailVersion: '1',
        processingPurpose: 'test',
        legalBasis: 'test',
      },
    });
    const first = await adapter.logSecurityEvent(event(`${TAG}_c1`), { tenantId });
    const second = await adapter.logSecurityEvent(event(`${TAG}_c2`), { tenantId });

    const [row] = await rows({ resourceId: `${TAG}_c2` });
    expect(first.status).toBe('PERSISTED');
    expect(second.status).toBe('PERSISTED');
    expect(row.metadata.audit.previousHash).toBe(first.integrityHash);
  });

  it('detects a tampered row', async () => {
    const resourceId = `${TAG}_tamper`;
    await logAIAgentAction({
      tenantId,
      agentName: 'tag-agent',
      resourceType: 'AIInsight',
      resourceId,
      action: 'CREATE',
    });
    const [row] = await rows({ resourceId });
    await prisma.auditLogEntry.update({
      where: { id: row.id },
      data: { metadata: { ...row.metadata, modelId: 'forged' } },
    });

    await expect(adapter.verifyLogIntegrity(row.eventId)).resolves.toMatchObject({
      valid: false,
      reason: 'HASH_MISMATCH',
    });
  });

  it('detects a tampered column, not only tampered metadata', async () => {
    const resourceId = `${TAG}_tamper_col`;
    await adapter.logSecurityEvent(
      {
        eventType: 'AI_PROMPT_INJECTION_DETECTED',
        severity: 'CRITICAL',
        tenantId,
        userId: 'system',
        resourceId,
        description: 'blocked',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'test',
          legalBasis: 'test',
        },
      },
      { tenantId }
    );
    const [row] = await rows({ resourceId });
    expect(row.actionResult).toBe('DENIED');
    await prisma.auditLogEntry.update({ where: { id: row.id }, data: { actionResult: 'SUCCESS' } });

    await expect(adapter.verifyLogIntegrity(row.eventId)).resolves.toMatchObject({
      valid: false,
      reason: 'SIGNATURE_INVALID',
    });
  });

  it('commits a batch as one chained unit, and rolls the whole batch back on a failed insert', async () => {
    const event = (resourceId: string, userId = 'system') => ({
      eventType: 'AI_GUARDRAIL_TRIGGERED' as const,
      severity: 'LOW' as const,
      tenantId,
      userId,
      resourceId,
      description: 'batch',
      metadata: {
        modelId: 'm',
        modelVersion: '1',
        guardrailId: 'g',
        guardrailVersion: '1',
        processingPurpose: 'test',
        legalBasis: 'test',
      },
    });

    const ok = await adapter.logBatchEvents([event(`${TAG}_b1`), event(`${TAG}_b2`)], { tenantId });
    expect(ok).toMatchObject({ successCount: 2, failureCount: 0 });
    const [b2] = await rows({ resourceId: `${TAG}_b2` });
    expect(b2.metadata.audit.previousHash).toBe(ok.results[0].integrityHash);

    // A userId with no users row fails the actorId FK and aborts the transaction:
    // the event before it must not be reported, or stored, as persisted.
    const bad = await adapter.logBatchEvents(
      [event(`${TAG}_b3`), event(`${TAG}_b4`, `${TAG}nouser`)],
      { tenantId }
    );
    expect(bad).toMatchObject({ successCount: 0, failureCount: 2 });
    expect(await rows({ resourceId: `${TAG}_b3` })).toHaveLength(0);

    // The chain continues from the last committed row.
    const next = await adapter.logSecurityEvent(event(`${TAG}_b5`), { tenantId });
    const [b5] = await rows({ resourceId: `${TAG}_b5` });
    expect(next.status).toBe('PERSISTED');
    expect(b5.metadata.audit.previousHash).toBe(ok.results[1].integrityHash);
  });

  it("skips the write for the 'default' fallback tenant instead of failing", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = await prisma.auditLogEntry.count();

    const result = await adapter.logSecurityEvent(
      {
        eventType: 'AI_CHAIN_FAILURE',
        severity: 'HIGH',
        tenantId: 'default',
        userId: 'system',
        description: 'no tenant',
        metadata: {
          modelId: 'm',
          modelVersion: '1',
          guardrailId: 'g',
          guardrailVersion: '1',
          processingPurpose: 'test',
          legalBasis: 'test',
        },
      },
      { tenantId: 'default' }
    );

    expect(result.status).toBe('SKIPPED');
    expect(await prisma.auditLogEntry.count()).toBe(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps scoring a lead end to end when the inner service succeeds', async () => {
    const inner = {
      scoreLead: vi
        .fn()
        .mockResolvedValue(Result.ok({ score: 64, confidence: 0.7, modelVersion: 'm1' })),
      qualifyLead: vi.fn(),
      generateEmail: vi.fn(),
    };
    const service = new GuardrailsAIService(inner as any, adapter, {
      userId: 'system',
      tenantId: 'default',
    });

    const result = await service.scoreLead(
      { email: 'sam@acme.example.invalid', company: 'Acme' } as any,
      { tenantId, leadId: `${TAG}_ok` }
    );

    expect(result.isSuccess).toBe(true);
    expect(result.value.score).toBe(64);
  });
});
