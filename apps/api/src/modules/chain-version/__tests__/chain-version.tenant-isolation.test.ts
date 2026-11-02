/**
 * Chain version tenant isolation (#1075 review, P1).
 *
 * Before #1075 the router's z.uuid() gates rejected every real (cuid) version id, so
 * the id-only procedures below were unreachable. With recordIdSchema they are live,
 * and each one must only ever see the caller's own tenant's versions.
 *
 * Real router and real ChainVersionService. The in-memory repositories filter the
 * way PrismaChainVersionRepository does: by id, and by tenant when one is passed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  ChainVersionService,
  type ChainVersionAuditRecord,
  type ChainVersionAuditRepositoryPort,
  type ChainVersionRecord,
  type ChainVersionRepositoryPort,
} from '@intelliflow/application';
import { chainVersionRouter } from '../chain-version.router';
import { createTRPCRouter } from '../../../trpc';
import { createAdminContext } from '../../../test/setup';

const TENANT_A = 'cmtenantaaaa0000l8086a1b2c';
const TENANT_B = 'cmtenantbbbb0000l8086a1b2c';
const ACTIVE_A = 'cmactiveaaaa0000l8086a1b2c';
const DRAFT_A = 'cmdraftaaaaa0000l8086a1b2c';
const PROMPT = 'You are a careful lead-scoring assistant.';

function version(id: string, status: ChainVersionRecord['status']): ChainVersionRecord {
  const now = new Date('2026-10-01T00:00:00Z');
  return {
    id,
    chainType: 'SCORING',
    status,
    prompt: PROMPT,
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 512,
    additionalParams: null,
    description: null,
    parentVersionId: null,
    rolloutStrategy: 'IMMEDIATE',
    rolloutPercent: null,
    experimentId: null,
    createdBy: 'user-a',
    createdAt: now,
    updatedAt: now,
    tenantId: TENANT_A,
  };
}

class InMemoryVersionRepo implements ChainVersionRepositoryPort {
  rows = new Map<string, ChainVersionRecord>();

  async create(data: Parameters<ChainVersionRepositoryPort['create']>[0]) {
    const row = { ...version(`cmnew${this.rows.size}`, 'DRAFT'), ...data };
    this.rows.set(row.id, row);
    return row;
  }
  async findById(id: string, tenantId?: string) {
    const row = this.rows.get(id);
    if (!row || (tenantId !== undefined && row.tenantId !== tenantId)) return null;
    return row;
  }
  async findByTenantId(tenantId: string) {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId);
  }
  async findByChainType(chainType: string, tenantId: string) {
    return (await this.findByTenantId(tenantId)).filter((r) => r.chainType === chainType);
  }
  async findActive(chainType: string, tenantId: string) {
    return (
      (await this.findByChainType(chainType, tenantId)).find((r) => r.status === 'ACTIVE') ?? null
    );
  }
  async findByStatus(chainType: string, status: string, tenantId: string) {
    return (await this.findByChainType(chainType, tenantId)).filter((r) => r.status === status);
  }
  async update(id: string, data: Partial<ChainVersionRecord>) {
    const row = { ...this.rows.get(id)!, ...data };
    this.rows.set(id, row);
    return row;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

class InMemoryAuditRepo implements ChainVersionAuditRepositoryPort {
  rows: ChainVersionAuditRecord[] = [];

  async create(data: Parameters<ChainVersionAuditRepositoryPort['create']>[0]) {
    const row = { ...data, id: `audit${this.rows.length}`, performedAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async findByVersionId(versionId: string) {
    return this.rows.filter((r) => r.versionId === versionId);
  }
  async findByAction(action: string) {
    return this.rows.filter((r) => r.action === action);
  }
}

const router = createTRPCRouter({ chainVersion: chainVersionRouter });
let versions: InMemoryVersionRepo;
let audits: InMemoryAuditRepo;

function callerFor(tenantId: string) {
  const service = new ChainVersionService(versions, audits, null, { publish: vi.fn() } as never);
  const base = createAdminContext();
  return router.createCaller(
    createAdminContext({
      services: { chainVersion: service } as never,
      user: { ...base.user!, tenantId },
      tenant: { ...base.tenant!, tenantId },
    })
  );
}

type Caller = ReturnType<typeof callerFor>;

/** Every procedure that takes a version id, called on tenant A's versions. */
const ID_PROCEDURES: Array<[string, (c: Caller) => Promise<unknown>]> = [
  ['update', (c) => c.chainVersion.update({ versionId: DRAFT_A, data: { description: 'x' } })],
  ['activate', (c) => c.chainVersion.activate({ versionId: DRAFT_A })],
  ['deprecate', (c) => c.chainVersion.deprecate({ versionId: ACTIVE_A })],
  ['archive', (c) => c.chainVersion.archive({ versionId: DRAFT_A })],
  ['rollback', (c) => c.chainVersion.rollback({ versionId: DRAFT_A, reason: 'bad prompt' })],
  ['getById', (c) => c.chainVersion.getById({ versionId: ACTIVE_A })],
  ['getAuditLog', (c) => c.chainVersion.getAuditLog({ versionId: ACTIVE_A })],
  ['compare', (c) => c.chainVersion.compare({ versionIdA: ACTIVE_A, versionIdB: DRAFT_A })],
];

beforeEach(() => {
  versions = new InMemoryVersionRepo();
  audits = new InMemoryAuditRepo();
  versions.rows.set(ACTIVE_A, version(ACTIVE_A, 'ACTIVE'));
  versions.rows.set(DRAFT_A, version(DRAFT_A, 'DRAFT'));
  audits.rows.push({
    id: 'audit-a',
    versionId: ACTIVE_A,
    action: 'ACTIVATED',
    previousState: null,
    newState: { prompt: PROMPT },
    performedBy: 'user-a',
    performedAt: new Date(),
    reason: null,
  });
});

describe('chain version procedures are tenant-scoped', () => {
  it.each(ID_PROCEDURES)(
    "%s: another tenant gets NOT_FOUND for tenant A's version",
    async (_name, call) => {
      const before = structuredClone([...versions.rows.values()]);

      const error = await call(callerFor(TENANT_B)).then(
        () => null,
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('NOT_FOUND');
      // Nothing of tenant A's leaked into the message, and nothing changed.
      expect((error as TRPCError).message).not.toContain(PROMPT);
      expect([...versions.rows.values()]).toEqual(before);
    }
  );

  it.each(ID_PROCEDURES)('%s: still works for the owning tenant', async (_name, call) => {
    await expect(call(callerFor(TENANT_A))).resolves.toBeDefined();
  });

  it("compare refuses when only one of the two versions is another tenant's", async () => {
    const foreign = { ...version('cmforeign000000l8086a1b2c', 'DRAFT'), tenantId: TENANT_B };
    versions.rows.set(foreign.id, foreign);

    for (const [versionIdA, versionIdB] of [
      [ACTIVE_A, foreign.id],
      [foreign.id, ACTIVE_A],
    ]) {
      await expect(
        callerFor(TENANT_A).chainVersion.compare({ versionIdA, versionIdB })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('getById is NOT_FOUND for an id that does not exist at all', async () => {
    await expect(
      callerFor(TENANT_A).chainVersion.getById({ versionId: 'cmmissing00000l8086a1b2c' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
