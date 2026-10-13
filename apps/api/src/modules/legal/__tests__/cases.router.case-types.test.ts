/**
 * cases.create / cases.getById with case types — PG-204 (ADR-076).
 *
 * Exercises the real router through createCaller (the legacy cases.router.test.ts
 * calls the Prisma mock directly). Owner ruling: explicit input first, then the
 * case type, then the PG-190 module defaults; the checklist is seeded as tasks
 * in the same transaction as the case.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { casesRouter } from '../cases.router';
import { CASE_TASK_ORDER } from '../../../lib/case-task-order';
import { prismaMock, createTestContext, generateTestUUID, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const CALLER = TEST_UUIDS.user1;
const CLIENT = generateTestUUID('client-1');
const OTHER_USER = generateTestUUID('assignee-2');
const TYPE = generateTestUUID('case-type-1');
const CASE_ID = generateTestUUID('case-1');
const NOW = new Date('2026-10-13T09:30:00Z');

const LITIGATION = {
  id: TYPE,
  defaultPriority: 'HIGH',
  defaultSlaDays: 14,
  requiredFields: [] as string[],
  checklist: [{ title: 'Conflict check' }, { title: 'Engagement letter' }],
};

function txMock() {
  return {
    case: {
      create: vi.fn().mockResolvedValue({ id: CASE_ID }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: CASE_ID, tasks: [] }),
    },
    caseTask: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

function useTx(tx = txMock()) {
  (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(tx));
  return tx;
}

function setup(
  options: {
    caseType?: unknown;
    client?: unknown;
    assignee?: unknown;
    settings?: unknown;
    requiredRows?: unknown[];
  } = {}
) {
  (prismaMock.caseType.findFirst as any).mockResolvedValue(options.caseType ?? null);
  (prismaMock.account.findFirst as any).mockResolvedValue(
    'client' in options ? options.client : { id: CLIENT }
  );
  (prismaMock.user.findFirst as any).mockResolvedValue(
    'assignee' in options ? options.assignee : { id: OTHER_USER }
  );
  (prismaMock.caseSettings.findUnique as any).mockResolvedValue(options.settings ?? null);
  (prismaMock.caseRequiredField.findMany as any).mockResolvedValue(options.requiredRows ?? []);
}

const base = { title: 'Smith v Jones', clientId: CLIENT };

describe('cases.create with case types (PG-204)', () => {
  let caller: ReturnType<typeof casesRouter.createCaller>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    caller = casesRouter.createCaller(createTestContext());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('priority precedence', () => {
    it('keeps an explicit priority over the type and module defaults', async () => {
      setup({ caseType: LITIGATION, settings: { defaultPriority: 'URGENT' } });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE, priority: 'LOW' });
      expect(tx.case.create.mock.calls[0][0].data.priority).toBe('LOW');
    });

    it('uses the type default when no priority is given', async () => {
      setup({ caseType: LITIGATION, settings: { defaultPriority: 'URGENT' } });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE });
      expect(tx.case.create.mock.calls[0][0].data.priority).toBe('HIGH');
    });

    it('uses the PG-190 module default when no type is picked', async () => {
      setup({ settings: { defaultPriority: 'URGENT' } });
      const tx = useTx();
      await caller.create(base);
      expect(tx.case.create.mock.calls[0][0].data.priority).toBe('URGENT');
      expect(prismaMock.caseType.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to MEDIUM with no type and no settings', async () => {
      setup();
      const tx = useTx();
      await caller.create(base);
      expect(tx.case.create.mock.calls[0][0].data).toMatchObject({
        priority: 'MEDIUM',
        caseTypeId: null,
        deadline: undefined,
      });
    });
  });

  describe('deadline', () => {
    it('derives 23:59:59.999 local on today + SLA days when blank', async () => {
      setup({ caseType: LITIGATION });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE });
      const data = tx.case.create.mock.calls[0][0].data;
      expect(data.deadline.toISOString()).toBe('2026-10-27T23:59:59.999Z');
      expect(data.timezone).toBeNull();
    });

    it('computes the SLA deadline in the case timezone', async () => {
      setup({ caseType: LITIGATION });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE, timezone: 'America/New_York' });
      const data = tx.case.create.mock.calls[0][0].data;
      // 2026-10-27 23:59:59.999 EDT = 2026-10-28 03:59:59.999Z
      expect(data.deadline.toISOString()).toBe('2026-10-28T03:59:59.999Z');
      expect(data.timezone).toBe('America/New_York');
    });

    it('keeps an explicit deadline', async () => {
      setup({ caseType: LITIGATION });
      const tx = useTx();
      const deadline = new Date('2026-12-01T12:00:00Z');
      await caller.create({ ...base, caseTypeId: TYPE, deadline });
      expect(tx.case.create.mock.calls[0][0].data.deadline).toEqual(deadline);
    });

    it('leaves the deadline empty when the type has no SLA', async () => {
      setup({ caseType: { ...LITIGATION, defaultSlaDays: null } });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE });
      expect(tx.case.create.mock.calls[0][0].data.deadline).toBeUndefined();
    });
  });

  describe('required fields', () => {
    it("enforces the type's required fields before writing", async () => {
      setup({ caseType: { ...LITIGATION, requiredFields: ['jurisdiction', 'description'] } });
      await expect(caller.create({ ...base, caseTypeId: TYPE })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Required fields missing: Description, Jurisdiction',
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('enforces the tenant required fields when no type is picked', async () => {
      setup({ requiredRows: [{ fieldKey: 'description', isRequired: true }] });
      await expect(caller.create({ ...base, description: '   ' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Required fields missing: Description',
      });
    });

    it('uses the PG-190 defaults when the tenant has no rows (title, client, assignee)', async () => {
      setup({ requiredRows: [] });
      useTx();
      await expect(caller.create(base)).resolves.toBeDefined();
    });

    it('lets an SLA-derived deadline satisfy a required deadline', async () => {
      setup({ caseType: { ...LITIGATION, requiredFields: ['deadline'] } });
      useTx();
      await expect(caller.create({ ...base, caseTypeId: TYPE })).resolves.toBeDefined();
    });
  });

  describe('checklist seeding', () => {
    it('creates the checklist as PENDING tasks on the transaction, in order', async () => {
      setup({ caseType: LITIGATION });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE });
      expect(tx.case.create.mock.calls[0][0].data.caseTypeId).toBe(TYPE);
      expect(tx.caseTask.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenantId,
            caseId: CASE_ID,
            title: 'Conflict check',
            status: 'PENDING',
            assignee: CALLER,
            dueDate: null,
            position: 0,
          },
          {
            tenantId,
            caseId: CASE_ID,
            title: 'Engagement letter',
            status: 'PENDING',
            assignee: CALLER,
            dueDate: null,
            position: 1,
          },
        ],
      });
      expect(tx.case.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CASE_ID, tenantId },
          include: expect.objectContaining({ tasks: { orderBy: CASE_TASK_ORDER } }),
        })
      );
    });

    it('skips task creation for a type without a checklist', async () => {
      setup({ caseType: { ...LITIGATION, checklist: [] } });
      const tx = useTx();
      await caller.create({ ...base, caseTypeId: TYPE });
      expect(tx.caseTask.createMany).not.toHaveBeenCalled();
    });

    it('propagates a seeding failure (the transaction rolls the case back)', async () => {
      setup({ caseType: LITIGATION });
      const tx = txMock();
      tx.caseTask.createMany.mockRejectedValueOnce(new Error('seed failed'));
      useTx(tx);
      await expect(caller.create({ ...base, caseTypeId: TYPE })).rejects.toThrow('seed failed');
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('tenant preflight', () => {
    it('rejects an inactive, missing or foreign case type before writing', async () => {
      setup({ caseType: null });
      await expect(caller.create({ ...base, caseTypeId: TYPE })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Case type not found',
      });
      expect(prismaMock.caseType.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TYPE, tenantId, isActive: true } })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a client of another tenant', async () => {
      setup({ client: null });
      await expect(caller.create(base)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Client not found',
      });
      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { id: CLIENT, tenantId },
        select: { id: true },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an explicit assignee outside the tenant', async () => {
      setup({ assignee: null });
      await expect(caller.create({ ...base, assignedTo: OTHER_USER })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Assignee not found',
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('assigns an explicit tenant user', async () => {
      setup();
      const tx = useTx();
      await caller.create({ ...base, assignedTo: OTHER_USER });
      expect(tx.case.create.mock.calls[0][0].data.assignedTo).toBe(OTHER_USER);
    });

    it('assigns the caller when assignedTo is omitted ("Assign to me")', async () => {
      setup();
      const tx = useTx();
      await caller.create(base);
      expect(tx.case.create.mock.calls[0][0].data.assignedTo).toBe(CALLER);
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });
  });
});

describe('cases.getById case type (PG-204)', () => {
  const caseRow = {
    id: CASE_ID,
    title: 'Smith v Jones',
    description: null,
    status: 'OPEN',
    priority: 'HIGH',
    deadline: null,
    clientId: CLIENT,
    assignedTo: CALLER,
    parties: null,
    client: { id: CLIENT, name: 'Acme' },
    assignee: null,
    tasks: [],
    resolution: null,
    appointments: [],
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: null,
  };

  it('returns the case type looked up within the tenant', async () => {
    (prismaMock.case.findFirst as any).mockResolvedValueOnce({ ...caseRow, caseTypeId: TYPE });
    (prismaMock.caseType.findFirst as any).mockResolvedValueOnce({
      id: TYPE,
      name: 'Litigation',
      colorToken: 'blue',
    });
    const result = await casesRouter.createCaller(createTestContext()).getById({ id: CASE_ID });
    expect(prismaMock.caseType.findFirst).toHaveBeenCalledWith({
      where: { id: TYPE, tenantId },
      select: { id: true, name: true, colorToken: true },
    });
    expect(result.caseType).toEqual({ id: TYPE, name: 'Litigation', colorToken: 'blue' });
  });

  it('reads tasks in checklist order (position, nulls last, then due date)', async () => {
    (prismaMock.case.findFirst as any).mockResolvedValueOnce({ ...caseRow, caseTypeId: null });
    await casesRouter.createCaller(createTestContext()).getById({ id: CASE_ID });
    expect(prismaMock.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ tasks: { orderBy: CASE_TASK_ORDER } }),
      })
    );
  });

  it('returns null without a case type', async () => {
    (prismaMock.case.findFirst as any).mockResolvedValueOnce({ ...caseRow, caseTypeId: null });
    const result = await casesRouter.createCaller(createTestContext()).getById({ id: CASE_ID });
    expect(prismaMock.caseType.findFirst).not.toHaveBeenCalled();
    expect(result.caseType).toBeNull();
  });
});

describe('cases.update never changes the case type (PG-204)', () => {
  it('drops caseTypeId from the update payload', async () => {
    (prismaMock.case.findFirst as any).mockResolvedValueOnce({ id: CASE_ID, tenantId });
    (prismaMock.case.update as any).mockResolvedValueOnce({ id: CASE_ID });
    await casesRouter
      .createCaller(createTestContext())
      .update({ id: CASE_ID, title: 'Renamed', caseTypeId: TYPE } as { id: string; title: string });
    const data = (prismaMock.case.update as any).mock.calls[0][0].data;
    expect(data).toEqual({ title: 'Renamed' });
  });
});

describe('cases.list task order (PG-204)', () => {
  it("reads each case's tasks in checklist order", async () => {
    (prismaMock.case.findMany as any).mockResolvedValueOnce([]);
    (prismaMock.case.count as any).mockResolvedValueOnce(0);
    await casesRouter.createCaller(createTestContext()).list({});
    expect(prismaMock.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ tasks: { orderBy: CASE_TASK_ORDER } }),
      })
    );
  });
});

describe('CASE_TASK_ORDER', () => {
  it('orders by position (nulls last), then due date', () => {
    expect(CASE_TASK_ORDER).toEqual([
      { position: { sort: 'asc', nulls: 'last' } },
      { dueDate: 'asc' },
    ]);
  });
});
