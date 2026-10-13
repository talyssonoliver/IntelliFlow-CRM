/**
 * Scheduled Reports Router Tests — PG-201
 *
 * analytics.scheduledReports over the existing report_schedules table:
 * - list/get (tenant-scoped; private template names hidden from other users)
 * - create/update/setActive/delete (manager roles only; $transaction on writes)
 * - preset -> cron derivation, custom cron validation, minimum interval, active cap
 * - template visibility, tag existence, cross-tenant negatives, error mapping
 * - tags sub-router (rename/delete rewrite schedule tag arrays in one transaction)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { scheduledReportsRouter } from '../scheduled-reports.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

const logAction = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction }),
}));

const tenantId = TEST_UUIDS.tenant;
const adminId = TEST_UUIDS.admin1;
const TEMPLATE_ID = 'clh3x2k8a0000qz8l1v2r3s4t';
const SCHEDULE_ID = 'clh3x2k8a0001qz8l1v2r3s4t';
const FOREIGN_ID = 'clh3x2k8a0009qz8l1v2r3s4t';
const NOW = new Date('2026-10-13T10:00:00Z');
const created = new Date('2026-10-01T00:00:00Z');

function scheduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    tenantId,
    reportId: null,
    templateId: TEMPLATE_ID,
    name: 'Weekly pipeline',
    description: null,
    frequency: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: null,
    timeOfDay: '09:00',
    cronExpression: '0 9 * * 1',
    timezone: 'Europe/London',
    recipients: ['lead@example.invalid'],
    format: 'pdf',
    colorToken: 'slate',
    tags: [] as string[],
    createdBy: adminId,
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-10-19T08:00:00Z'),
    createdAt: created,
    updatedAt: created,
    template: { id: TEMPLATE_ID, name: 'Pipeline', createdBy: adminId, sharingScope: 'private' },
    ...overrides,
  };
}

function tagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    tenantId,
    name: 'Finance',
    colorToken: 'blue',
    description: null,
    sortOrder: 0,
    isActive: true,
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

const createInput = {
  name: 'Weekly pipeline',
  templateId: TEMPLATE_ID,
  cadence: 'weekly' as const,
  dayOfWeek: 1,
  timeOfDay: '09:00',
  timezone: 'Europe/London',
  recipients: ['lead@example.invalid'],
  format: 'pdf' as const,
};

/**
 * Every write runs inside $transaction; the transaction client is prismaMock itself
 * (installed in beforeEach), so tx.* and prismaMock.* are the same mocks.
 */
function useTx(): any {
  return prismaMock;
}

function prismaError(code: string) {
  return Object.assign(new Error(code), { code });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

function visibleTemplate() {
  (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce({ id: TEMPLATE_ID });
}

describe('scheduledReportsRouter (PG-201)', () => {
  let admin: ReturnType<typeof scheduledReportsRouter.createCaller>;
  let user: ReturnType<typeof scheduledReportsRouter.createCaller>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    logAction.mockReset().mockResolvedValue('audit-1');
    // create runs in a transaction: by default the transaction client is prismaMock
    // itself; update/setActive/delete tests install their own tx with useTx().
    (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(prismaMock));
    admin = scheduledReportsRouter.createCaller(createAdminContext());
    user = scheduledReportsRouter.createCaller(createTestContext());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = scheduledReportsRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  // ─── list / get ──────────────────────────────────────────────────────────

  describe('list', () => {
    it('lists the tenant schedules ordered by name, capped, with template names', async () => {
      (prismaMock.reportSchedule.findMany as any).mockResolvedValueOnce([scheduleRow()]);
      const result = await admin.list();
      expect(prismaMock.reportSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          orderBy: [{ name: 'asc' }],
          take: 500,
        })
      );
      expect(result[0]).toMatchObject({
        id: SCHEDULE_ID,
        templateName: 'Pipeline',
        cadence: 'weekly',
      });
    });

    it('is readable by a regular user but hides another user private template name', async () => {
      (prismaMock.reportSchedule.findMany as any).mockResolvedValueOnce([scheduleRow()]);
      const [view] = await user.list();
      expect(view.templateName).toBeNull();
      expect(view.templateHidden).toBe(true);
    });
  });

  describe('get', () => {
    it('returns a tenant schedule', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const view = await admin.get({ id: SCHEDULE_ID });
      expect(prismaMock.reportSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SCHEDULE_ID, tenantId } })
      );
      expect(view.id).toBe(SCHEDULE_ID);
    });

    it('returns NOT_FOUND for a missing or foreign-tenant id', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.get({ id: FOREIGN_ID }), 'NOT_FOUND');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('derives the cron from the preset, ignores a client cron and stores the next run', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow({ ...data, id: SCHEDULE_ID })
      );

      await admin.create({ ...createInput, cronExpression: '* * * * *' });

      const { data } = (prismaMock.reportSchedule.create as any).mock.calls[0][0];
      expect(data).toMatchObject({
        tenantId,
        createdBy: adminId,
        templateId: TEMPLATE_ID,
        frequency: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: null,
        timeOfDay: '09:00',
        cronExpression: '0 9 * * 1',
        timezone: 'Europe/London',
        recipients: ['lead@example.invalid'],
        format: 'pdf',
        colorToken: 'slate',
        tags: [],
        isActive: true,
      });
      expect(data.nextRunAt.toISOString()).toBe('2026-10-19T08:00:00.000Z');
    });

    it('accepts a valid custom cron', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow(data)
      );
      await admin.create({ ...createInput, cadence: 'custom', cronExpression: '0 9 * * 1-5' });
      const { data } = (prismaMock.reportSchedule.create as any).mock.calls[0][0];
      expect(data).toMatchObject({
        frequency: 'custom',
        cronExpression: '0 9 * * 1-5',
        timeOfDay: null,
      });
    });

    it('rejects a custom cron that cron-parser cannot read', async () => {
      visibleTemplate();
      await expectCode(
        admin.create({ ...createInput, cadence: 'custom', cronExpression: '99 9 * * *' }),
        'BAD_REQUEST'
      );
      expect(prismaMock.reportSchedule.create).not.toHaveBeenCalled();
    });

    it('rejects a schedule that fires more often than hourly', async () => {
      visibleTemplate();
      await expectCode(
        admin.create({ ...createInput, cadence: 'custom', cronExpression: '*/5 * * * *' }),
        'BAD_REQUEST'
      );
    });

    it('rejects a template the caller cannot see (another user private, or another tenant)', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.create(createInput), 'NOT_FOUND');
      expect(prismaMock.reportTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: TEMPLATE_ID,
            tenantId,
            OR: [{ createdBy: adminId }, { sharingScope: { not: 'private' } }],
          },
        })
      );
    });

    it('rejects a tag that is not an active tag of this tenant', async () => {
      visibleTemplate();
      (prismaMock.reportScheduleTag.findMany as any).mockResolvedValueOnce([{ name: 'Finance' }]);
      await expectCode(admin.create({ ...createInput, tags: ['Finance', 'Ghost'] }), 'BAD_REQUEST');
      expect(prismaMock.reportScheduleTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, isActive: true, name: { in: ['Finance', 'Ghost'] } },
        })
      );
    });

    it('enforces the per-tenant active schedule cap', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(100);
      await expectCode(admin.create(createInput), 'BAD_REQUEST');
    });

    it('takes the per-tenant activation lock before counting active schedules', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow(data)
      );
      await admin.create(createInput);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings, lockKey] = (prismaMock.$executeRaw as any).mock.calls[0];
      expect(strings.join('?')).toContain('pg_advisory_xact_lock');
      expect(lockKey).toBe(`report_schedules:${tenantId}`);
    });

    it('skips the cap and the next run for an inactive schedule', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow(data)
      );
      await admin.create({ ...createInput, isActive: false });
      expect(prismaMock.reportSchedule.count).not.toHaveBeenCalled();
      expect((prismaMock.reportSchedule.create as any).mock.calls[0][0].data.nextRunAt).toBeNull();
    });

    it('maps a duplicate name (P2002) to CONFLICT', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.create(createInput), 'CONFLICT');
    });

    it('maps a template deleted mid-request (P2003) to NOT_FOUND', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockRejectedValueOnce(prismaError('P2003'));
      await expectCode(admin.create(createInput), 'NOT_FOUND');
    });

    it('rethrows unknown database errors', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockRejectedValueOnce(new Error('connection lost'));
      await expect(admin.create(createInput)).rejects.toThrow('connection lost');
    });

    it('is FORBIDDEN for a regular user', async () => {
      await expectCode(user.create(createInput), 'FORBIDDEN');
      expect(prismaMock.reportSchedule.create).not.toHaveBeenCalled();
    });

    it('audits the recipient count and never the addresses', async () => {
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow(data)
      );
      await admin.create(createInput);
      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'report_schedule',
        SCHEDULE_ID,
        tenantId,
        expect.objectContaining({
          actorId: adminId,
          afterState: { recipientCount: 1, format: 'pdf', isActive: true },
        })
      );
      expect(JSON.stringify(logAction.mock.calls[0])).not.toContain('lead@example.invalid');
    });

    it('does not fail the request when the audit write fails', async () => {
      logAction.mockRejectedValueOnce(new Error('audit down'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      visibleTemplate();
      (prismaMock.reportSchedule.count as any).mockResolvedValueOnce(0);
      (prismaMock.reportSchedule.create as any).mockImplementationOnce(async ({ data }: any) =>
        scheduleRow(data)
      );
      await expect(admin.create(createInput)).resolves.toMatchObject({ id: SCHEDULE_ID });
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
      errorSpy.mockRestore();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates inside a tenant-scoped transaction', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockResolvedValueOnce(scheduleRow({ name: 'Renamed' }));
      const view = await admin.update({ id: SCHEDULE_ID, name: 'Renamed' });
      expect(prismaMock.reportSchedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SCHEDULE_ID, tenantId } })
      );
      expect(tx.reportSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SCHEDULE_ID, tenantId } })
      );
      expect(view.name).toBe('Renamed');
    });

    it('returns NOT_FOUND for a foreign-tenant id without writing', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ id: FOREIGN_ID, name: 'x' }), 'NOT_FOUND');
      expect(prismaMock.reportSchedule.update).not.toHaveBeenCalled();
    });

    it('maps P2025 thrown inside the transaction to NOT_FOUND', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockRejectedValueOnce(prismaError('P2025'));
      await expectCode(admin.update({ id: SCHEDULE_ID, name: 'x' }), 'NOT_FOUND');
    });

    it('maps a duplicate rename (P2002) to CONFLICT', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.update({ id: SCHEDULE_ID, name: 'Taken' }), 'CONFLICT');
    });

    it('re-derives the legacy columns when switching custom -> preset', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({
          frequency: 'custom',
          cronExpression: '0 9 * * 1-5',
          timeOfDay: null,
          dayOfWeek: null,
        })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, cadence: 'daily', timeOfDay: '07:30' });
      const { data } = tx.reportSchedule.update.mock.calls[0][0];
      expect(data).toMatchObject({
        frequency: 'daily',
        dayOfWeek: null,
        dayOfMonth: null,
        timeOfDay: '07:30',
        cronExpression: '30 7 * * *',
      });
      expect(data.nextRunAt.toISOString()).toBe('2026-10-14T06:30:00.000Z');
    });

    it('recomputes the next run when only the timezone changes', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({
        id: SCHEDULE_ID,
        cadence: 'weekly',
        dayOfWeek: 1,
        timeOfDay: '09:00',
        timezone: 'America/New_York',
      });
      const { data } = tx.reportSchedule.update.mock.calls[0][0];
      expect(data.nextRunAt.toISOString()).toBe('2026-10-19T13:00:00.000Z');
    });

    it('rejects activating a schedule that references nothing', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ templateId: null, template: null, isActive: false })
      );
      await expectCode(admin.update({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
    });

    it('checks the template visibility when a template is chosen', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ id: SCHEDULE_ID, templateId: FOREIGN_ID }), 'NOT_FOUND');
    });

    it('lets an unreferenced (migrated) row be activated once a template is chosen', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ id: 'rs-migrated-t1', templateId: null, template: null, isActive: false })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.count.mockResolvedValueOnce(3);
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: 'rs-migrated-t1', templateId: TEMPLATE_ID, isActive: true });
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.reportSchedule.count).toHaveBeenCalledWith({
        where: { tenantId, isActive: true, NOT: { id: 'rs-migrated-t1' } },
      });
      const { data } = tx.reportSchedule.update.mock.calls[0][0];
      expect(data).toMatchObject({ templateId: TEMPLATE_ID, isActive: true });
      expect(data.nextRunAt).toBeInstanceOf(Date);
    });

    it('allows metadata edits on a schedule whose private template the caller cannot see', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({
          template: {
            id: TEMPLATE_ID,
            name: 'Pipeline',
            createdBy: 'someone-else',
            sharingScope: 'private',
          },
        })
      );
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, templateId: TEMPLATE_ID, name: 'Renamed' });
      expect(prismaMock.reportTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('forbids changing recipients when the caller cannot see the schedule template', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({
          template: {
            id: TEMPLATE_ID,
            name: 'Pipeline',
            createdBy: 'someone-else',
            sharingScope: 'private',
          },
        })
      );
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(
        admin.update({ id: SCHEDULE_ID, recipients: ['outside@example.invalid'] }),
        'FORBIDDEN'
      );
      expect(prismaMock.reportSchedule.update).not.toHaveBeenCalled();
    });

    it('forbids changing the format when the caller cannot see the schedule template', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ id: SCHEDULE_ID, format: 'csv' }), 'FORBIDDEN');
    });

    it('does not treat re-sent identical recipients and format as a delivery change', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, recipients: ['lead@example.invalid'], format: 'pdf' });
      expect(prismaMock.reportTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('pauses a legacy schedule that has no cron without validating it', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ templateId: null, template: null, reportId: 'rep-1', cronExpression: null })
      );
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, isActive: false });
      expect(tx.reportSchedule.update.mock.calls[0][0].data).toEqual({
        isActive: false,
        nextRunAt: null,
      });
    });

    it('keeps an inactive tag already on the schedule and only checks newly added tags', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ tags: ['Retired'] })
      );
      (prismaMock.reportScheduleTag.findMany as any).mockResolvedValueOnce([{ name: 'Finance' }]);
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, tags: ['Retired', 'Finance'] });
      expect(prismaMock.reportScheduleTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, isActive: true, name: { in: ['Finance'] } } })
      );
    });

    it('reads the schedule only after taking the tenant lock', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, name: 'Renamed' });
      const lockOrder = (prismaMock.$executeRaw as any).mock.invocationCallOrder[0];
      const readOrder = (prismaMock.reportSchedule.findFirst as any).mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });

    it('enforces the active cap when an update activates a schedule', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ isActive: false })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.count.mockResolvedValueOnce(100);
      await expectCode(admin.update({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
      expect(tx.reportSchedule.update).not.toHaveBeenCalled();
    });

    it('audits a recipient change by count only', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({
        id: SCHEDULE_ID,
        recipients: ['a@example.invalid', 'b@example.invalid'],
      });
      expect(logAction).toHaveBeenCalledWith(
        'UPDATE',
        'report_schedule',
        SCHEDULE_ID,
        tenantId,
        expect.objectContaining({ afterState: expect.objectContaining({ recipientCount: 2 }) })
      );
    });

    it('does not audit when the recipients are unchanged', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.update({ id: SCHEDULE_ID, recipients: ['lead@example.invalid'], tags: [] });
      expect(logAction).not.toHaveBeenCalled();
    });

    it('is FORBIDDEN for a regular user', async () => {
      await expectCode(user.update({ id: SCHEDULE_ID, name: 'x' }), 'FORBIDDEN');
    });
  });

  // ─── setActive ───────────────────────────────────────────────────────────

  describe('setActive', () => {
    it('pausing clears the next run inside a transaction', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(scheduleRow());
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      const view = await admin.setActive({ id: SCHEDULE_ID, isActive: false });
      expect(tx.reportSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SCHEDULE_ID, tenantId },
          data: { isActive: false, nextRunAt: null },
        })
      );
      expect(view.isActive).toBe(false);
    });

    it('re-reads the row under the lock, so a stale pre-read cannot skip the cap', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ isActive: false })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.count.mockResolvedValueOnce(100);
      await expectCode(admin.setActive({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
      const lockOrder = (prismaMock.$executeRaw as any).mock.invocationCallOrder[0];
      const readOrder = (prismaMock.reportSchedule.findFirst as any).mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });

    it('activating recomputes the next run after the visibility and cap checks', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ isActive: false, nextRunAt: null })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.count.mockResolvedValueOnce(5);
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.setActive({ id: SCHEDULE_ID, isActive: true });
      expect(tx.$executeRaw).toHaveBeenCalled();
      const { data } = tx.reportSchedule.update.mock.calls[0][0];
      expect(data.isActive).toBe(true);
      expect(data.nextRunAt.toISOString()).toBe('2026-10-19T08:00:00.000Z');
    });

    it('refuses to activate an unreferenced schedule', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ templateId: null, template: null, isActive: false })
      );
      await expectCode(admin.setActive({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
    });

    it('refuses to activate a schedule with no cron', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ cronExpression: null, isActive: false })
      );
      visibleTemplate();
      await expectCode(admin.setActive({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
    });

    it('refuses to activate when the template is no longer visible', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ isActive: false })
      );
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setActive({ id: SCHEDULE_ID, isActive: true }), 'FORBIDDEN');
    });

    it('enforces the active cap when activating', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ isActive: false })
      );
      visibleTemplate();
      const tx = useTx();
      tx.reportSchedule.count.mockResolvedValueOnce(100);
      await expectCode(admin.setActive({ id: SCHEDULE_ID, isActive: true }), 'BAD_REQUEST');
      expect(tx.reportSchedule.count).toHaveBeenCalledWith({
        where: { tenantId, isActive: true, NOT: { id: SCHEDULE_ID } },
      });
      expect(tx.reportSchedule.update).not.toHaveBeenCalled();
    });

    it('activates a legacy report-definition schedule without a template check', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(
        scheduleRow({ templateId: null, template: null, reportId: 'rep-1', isActive: false })
      );
      const tx = useTx();
      tx.reportSchedule.update.mockImplementationOnce(async ({ data }: any) => scheduleRow(data));
      await admin.setActive({ id: SCHEDULE_ID, isActive: true });
      expect(prismaMock.reportTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for a foreign-tenant id', async () => {
      (prismaMock.reportSchedule.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setActive({ id: FOREIGN_ID, isActive: false }), 'NOT_FOUND');
    });

    it('is FORBIDDEN for a regular user', async () => {
      await expectCode(user.setActive({ id: SCHEDULE_ID, isActive: false }), 'FORBIDDEN');
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes inside a tenant-scoped transaction and audits it', async () => {
      const tx = useTx();
      tx.reportSchedule.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(admin.delete({ id: SCHEDULE_ID })).resolves.toEqual({ deleted: true });
      expect(tx.reportSchedule.deleteMany).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID, tenantId },
      });
      expect(logAction).toHaveBeenCalledWith(
        'DELETE',
        'report_schedule',
        SCHEDULE_ID,
        tenantId,
        expect.objectContaining({ actorId: adminId })
      );
    });

    it('returns NOT_FOUND when nothing in this tenant matched (foreign id)', async () => {
      const tx = useTx();
      tx.reportSchedule.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.delete({ id: FOREIGN_ID }), 'NOT_FOUND');
    });

    it('is FORBIDDEN for a regular user', async () => {
      await expectCode(user.delete({ id: SCHEDULE_ID }), 'FORBIDDEN');
    });
  });

  // ─── tags ────────────────────────────────────────────────────────────────

  describe('tags', () => {
    it('lists the tenant tags in display order', async () => {
      (prismaMock.reportScheduleTag.findMany as any).mockResolvedValueOnce([tagRow()]);
      const result = await user.tags.list();
      expect(prismaMock.reportScheduleTag.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toEqual([
        {
          id: 'tag-1',
          name: 'Finance',
          colorToken: 'blue',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
      ]);
    });

    it('creates a tag at the end of the list', async () => {
      (prismaMock.reportScheduleTag.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: 4 },
      });
      (prismaMock.reportScheduleTag.create as any).mockResolvedValueOnce(tagRow({ sortOrder: 5 }));
      await admin.tags.create({ name: 'Finance', colorToken: 'blue' });
      expect(prismaMock.reportScheduleTag.create).toHaveBeenCalledWith({
        data: { tenantId, name: 'Finance', colorToken: 'blue', description: null, sortOrder: 5 },
      });
    });

    it('creates the first tag at position 0 with the default colour', async () => {
      (prismaMock.reportScheduleTag.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: null },
      });
      (prismaMock.reportScheduleTag.create as any).mockResolvedValueOnce(tagRow());
      await admin.tags.create({ name: 'Finance', description: 'Money' });
      expect(prismaMock.reportScheduleTag.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          name: 'Finance',
          colorToken: 'slate',
          description: 'Money',
          sortOrder: 0,
        },
      });
    });

    it('maps a duplicate tag name to CONFLICT', async () => {
      (prismaMock.reportScheduleTag.aggregate as any).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (prismaMock.reportScheduleTag.create as any).mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.tags.create({ name: 'Finance' }), 'CONFLICT');
    });

    it('rename rewrites the tag on this tenant schedules only, de-duplicated, in one transaction', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow());
      tx.reportScheduleTag.update.mockResolvedValueOnce(tagRow({ name: 'Money' }));
      tx.reportSchedule.findMany.mockResolvedValueOnce([
        { id: 's1', tags: ['Finance', 'Ops'] },
        { id: 's2', tags: ['Finance', 'Money'] },
      ]);
      const view = await admin.tags.update({ id: 'tag-1', name: 'Money' });
      expect(tx.reportScheduleTag.findFirst).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId },
      });
      expect(tx.reportSchedule.findMany).toHaveBeenCalledWith({
        where: { tenantId, tags: { has: 'Finance' } },
        select: { id: true, tags: true },
      });
      expect(tx.reportSchedule.update).toHaveBeenCalledWith({
        where: { id: 's1', tenantId },
        data: { tags: ['Money', 'Ops'] },
      });
      expect(tx.reportSchedule.update).toHaveBeenCalledWith({
        where: { id: 's2', tenantId },
        data: { tags: ['Money'] },
      });
      expect(view.name).toBe('Money');
    });

    it('clears a tag description when an empty string is sent', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow({ description: 'Old' }));
      tx.reportScheduleTag.update.mockResolvedValueOnce(tagRow({ description: null }));
      await admin.tags.update({ id: 'tag-1', description: '' });
      expect(tx.reportScheduleTag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId },
        data: { description: null },
      });
    });

    it('takes the tenant lock before rewriting schedule tags', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow());
      tx.reportScheduleTag.update.mockResolvedValueOnce(tagRow({ name: 'Money' }));
      tx.reportSchedule.findMany.mockResolvedValueOnce([]);
      await admin.tags.update({ id: 'tag-1', name: 'Money' });
      const lockOrder = (prismaMock.$executeRaw as any).mock.invocationCallOrder[0];
      const readOrder = (prismaMock.reportScheduleTag.findFirst as any).mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });

    it('updates colour without touching schedules', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow());
      tx.reportScheduleTag.update.mockResolvedValueOnce(tagRow({ colorToken: 'red' }));
      await admin.tags.update({ id: 'tag-1', colorToken: 'red', name: 'Finance' });
      expect(tx.reportSchedule.findMany).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND when renaming a foreign-tenant tag', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(null);
      await expectCode(admin.tags.update({ id: 'foreign', name: 'x' }), 'NOT_FOUND');
      expect(tx.reportScheduleTag.update).not.toHaveBeenCalled();
    });

    it('maps a duplicate rename to CONFLICT', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow());
      tx.reportScheduleTag.update.mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.tags.update({ id: 'tag-1', name: 'Ops' }), 'CONFLICT');
    });

    it('delete removes the tag from this tenant schedules and deletes it in one transaction', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(tagRow());
      tx.reportSchedule.findMany.mockResolvedValueOnce([{ id: 's1', tags: ['Finance', 'Ops'] }]);
      await expect(admin.tags.delete({ id: 'tag-1' })).resolves.toEqual({ deleted: true });
      expect(tx.reportSchedule.update).toHaveBeenCalledWith({
        where: { id: 's1', tenantId },
        data: { tags: ['Ops'] },
      });
      expect(tx.reportScheduleTag.delete).toHaveBeenCalledWith({
        where: { id: 'tag-1', tenantId },
      });
    });

    it('returns NOT_FOUND when deleting a foreign-tenant tag', async () => {
      const tx = useTx();
      tx.reportScheduleTag.findFirst.mockResolvedValueOnce(null);
      await expectCode(admin.tags.delete({ id: 'foreign' }), 'NOT_FOUND');
      expect(tx.reportScheduleTag.delete).not.toHaveBeenCalled();
    });

    it('tag mutations are FORBIDDEN for a regular user', async () => {
      await expectCode(user.tags.create({ name: 'x' }), 'FORBIDDEN');
      await expectCode(user.tags.update({ id: 'tag-1', name: 'x' }), 'FORBIDDEN');
      await expectCode(user.tags.delete({ id: 'tag-1' }), 'FORBIDDEN');
    });
  });
});
