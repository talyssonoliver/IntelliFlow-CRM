/**
 * PG-202 — calendar.availability router (AC-010, AC-017, AC-019, AC-020, AC-021).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { availabilityRouter } from '../availability.router';
import { DEFAULT_APPOINTMENT_SETTINGS } from '../../legal/appointment-settings.defaults';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';
import { h, dateOnly, prismaError, expectEveryCallTenantScoped } from './availability.test-utils';

const TENANT = TEST_UUIDS.tenant;
const NOW = new Date('2026-04-13T09:00:00Z');

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    tenantId: TENANT,
    defaultDurationMinutes: 30,
    minDurationMinutes: 5,
    maxDurationMinutes: 480,
    defaultBufferBeforeMinutes: 10,
    defaultBufferAfterMinutes: 5,
    defaultReminderMinutes: 15,
    primaryCalendarId: null,
    syncExternalCalendars: false,
    defaultTimezone: 'Europe/London',
    maxDailyBookings: 8,
    availabilityConfiguredAt: new Date('2026-04-01T00:00:00Z'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const hourRows = [
  { id: 'h1', tenantId: TENANT, weekday: 1, startMinute: h(9), endMinute: h(12), createdAt: NOW },
  { id: 'h2', tenantId: TENANT, weekday: 1, startMinute: h(13), endMinute: h(17), createdAt: NOW },
  { id: 'h3', tenantId: TENANT, weekday: 3, startMinute: h(9), endMinute: h(17), createdAt: NOW },
];
const closureRows = [
  {
    id: 'c1',
    tenantId: TENANT,
    startDate: dateOnly('2026-12-24'),
    endDate: dateOnly('2026-12-26'),
    reason: 'Christmas',
    createdAt: NOW,
  },
];

function updateInput(overrides: Record<string, unknown> = {}) {
  return {
    timezone: 'Europe/London',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      ranges: weekday === 1 ? [{ startMinute: h(9), endMinute: h(17) }] : [],
    })),
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 0,
    maxDailyBookings: 6,
    closures: [{ startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' }],
    ...overrides,
  };
}

function txMock() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    appointmentSettings: {
      upsert: vi.fn().mockResolvedValue(settingsRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(settingsRow()),
    },
    availabilityHour: {
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(hourRows),
    },
    availabilityClosure: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(closureRows),
    },
  };
}

function useTx(tx = txMock()) {
  (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (fn: (t: unknown) => unknown) => fn(tx)
  );
  return tx;
}

function callOrder(...fns: Array<ReturnType<typeof vi.fn>>): number[] {
  return fns.map((f) => f.mock.invocationCallOrder[0]);
}

describe('availabilityRouter (PG-202)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = availabilityRouter.createCaller(createPublicContext());
    await expect(anon.get()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('get', () => {
    it('returns the configured availability for any tenant user, with canEdit false for USER', async () => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(settingsRow() as never);
      prismaMock.availabilityHour.findMany.mockResolvedValue(hourRows as never);
      prismaMock.availabilityClosure.findMany.mockResolvedValue(closureRows as never);

      const dto = await availabilityRouter.createCaller(createTestContext()).get();

      expect(dto).toEqual({
        isConfigured: true,
        timezone: 'Europe/London',
        days: [
          { weekday: 0, ranges: [] },
          {
            weekday: 1,
            ranges: [
              { startMinute: h(9), endMinute: h(12) },
              { startMinute: h(13), endMinute: h(17) },
            ],
          },
          { weekday: 2, ranges: [] },
          { weekday: 3, ranges: [{ startMinute: h(9), endMinute: h(17) }] },
          { weekday: 4, ranges: [] },
          { weekday: 5, ranges: [] },
          { weekday: 6, ranges: [] },
        ],
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 5,
        maxDailyBookings: 8,
        closures: [
          { id: 'c1', startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' },
        ],
        canEdit: false,
      });
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });

    it.each([
      ['ADMIN', createAdminContext],
      ['MANAGER', createManagerContext],
    ])('returns canEdit true for %s', async (_role, ctx) => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(settingsRow() as never);
      prismaMock.availabilityHour.findMany.mockResolvedValue([] as never);
      prismaMock.availabilityClosure.findMany.mockResolvedValue([] as never);
      const dto = await availabilityRouter.createCaller(ctx()).get();
      expect(dto.canEdit).toBe(true);
    });

    it('returns an unconfigured DTO without creating anything, timezone from the user', async () => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(null as never);
      prismaMock.availabilityHour.findMany.mockResolvedValue([] as never);
      prismaMock.availabilityClosure.findMany.mockResolvedValue([] as never);
      const ctx = createTestContext({
        user: { ...createTestContext().user!, timezone: 'America/New_York' },
      });

      const dto = await availabilityRouter.createCaller(ctx).get();

      expect(dto).toMatchObject({
        isConfigured: false,
        timezone: 'America/New_York',
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        maxDailyBookings: null,
        closures: [],
      });
      expect(dto.days).toHaveLength(7);
      expect(prismaMock.appointmentSettings.create).not.toHaveBeenCalled();
      expect(prismaMock.appointmentSettings.upsert).not.toHaveBeenCalled();
      expect(prismaMock.availabilityHour.createMany).not.toHaveBeenCalled();
    });

    it('falls back to the stored zone, then UTC, when the user has no timezone', async () => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(
        settingsRow({ availabilityConfiguredAt: null, defaultTimezone: 'Europe/Paris' }) as never
      );
      prismaMock.availabilityHour.findMany.mockResolvedValue([] as never);
      prismaMock.availabilityClosure.findMany.mockResolvedValue([] as never);
      const admin = availabilityRouter.createCaller(createAdminContext()); // admin context has no timezone
      expect((await admin.get()).timezone).toBe('Europe/Paris');

      prismaMock.appointmentSettings.findUnique.mockResolvedValue(null as never);
      expect((await admin.get()).timezone).toBe('UTC');
    });
  });

  describe('update', () => {
    it.each([
      ['ADMIN', createAdminContext],
      ['MANAGER', createManagerContext],
    ])(
      '%s saves in one transaction: settings first, then hours, then closures',
      async (_role, ctx) => {
        const tx = useTx();
        const dto = await availabilityRouter.createCaller(ctx()).update(updateInput());

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        const order = callOrder(
          tx.appointmentSettings.upsert,
          tx.availabilityHour.deleteMany,
          tx.availabilityHour.createMany,
          tx.availabilityClosure.deleteMany,
          tx.availabilityClosure.createMany
        );
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // The public booking lock is taken before anything changes (codex).
        expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe(`booking:${TENANT}`);
        expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(order[0]!);

        expect(tx.appointmentSettings.upsert).toHaveBeenCalledWith({
          where: { tenantId: TENANT },
          create: {
            ...DEFAULT_APPOINTMENT_SETTINGS,
            tenantId: TENANT,
            defaultBufferBeforeMinutes: 15,
            defaultBufferAfterMinutes: 0,
            defaultTimezone: 'Europe/London',
            maxDailyBookings: 6,
            availabilityConfiguredAt: NOW,
          },
          update: {
            defaultBufferBeforeMinutes: 15,
            defaultBufferAfterMinutes: 0,
            defaultTimezone: 'Europe/London',
            maxDailyBookings: 6,
            availabilityConfiguredAt: NOW,
          },
        });
        expect(tx.availabilityHour.deleteMany).toHaveBeenCalledWith({
          where: { tenantId: TENANT },
        });
        expect(tx.availabilityHour.createMany).toHaveBeenCalledWith({
          data: [{ tenantId: TENANT, weekday: 1, startMinute: h(9), endMinute: h(17) }],
        });
        expect(tx.availabilityClosure.createMany).toHaveBeenCalledWith({
          data: [
            {
              tenantId: TENANT,
              startDate: dateOnly('2026-12-24'),
              endDate: dateOnly('2026-12-26'),
              reason: 'Christmas',
            },
          ],
        });
        for (const call of [tx.availabilityHour.createMany, tx.availabilityClosure.createMany]) {
          expect(call.mock.calls[0][0]).not.toHaveProperty('skipDuplicates');
        }
        expect(dto.isConfigured).toBe(true);
        expect(dto.canEdit).toBe(true);
      }
    );

    it('rejects a USER with FORBIDDEN and writes nothing', async () => {
      await expect(
        availabilityRouter.createCaller(createTestContext()).update(updateInput())
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only administrators and managers can change availability.',
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('skips createMany when there are no hours or closures', async () => {
      const tx = useTx();
      await availabilityRouter.createCaller(createAdminContext()).update(
        updateInput({
          days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: [] })),
          closures: [],
        })
      );
      expect(tx.availabilityHour.deleteMany).toHaveBeenCalled();
      expect(tx.availabilityHour.createMany).not.toHaveBeenCalled();
      expect(tx.availabilityClosure.createMany).not.toHaveBeenCalled();
    });

    it('ignores a smuggled tenantId and writes the caller tenant', async () => {
      const tx = useTx();
      await availabilityRouter
        .createCaller(createAdminContext())
        .update({ ...updateInput(), tenantId: 'smuggled' } as never);
      expect(tx.appointmentSettings.upsert.mock.calls[0][0].where).toEqual({ tenantId: TENANT });
      expect(tx.availabilityHour.createMany.mock.calls[0][0].data[0].tenantId).toBe(TENANT);
    });

    it('rejects invalid input before touching the database', async () => {
      await expect(
        availabilityRouter.createCaller(createAdminContext()).update(
          updateInput({
            days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
              weekday,
              ranges:
                weekday === 1
                  ? [
                      { startMinute: h(9), endMinute: h(12) },
                      { startMinute: h(11), endMinute: h(14) },
                    ]
                  : [],
            })),
          })
        )
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      'appointmentSettings.upsert',
      'availabilityHour.createMany',
      'availabilityClosure.createMany',
    ])('maps P2002 from %s to CONFLICT', async (path) => {
      const tx = txMock();
      const [model, method] = path.split('.') as [keyof ReturnType<typeof txMock>, string];
      (tx[model] as Record<string, ReturnType<typeof vi.fn>>)[method].mockRejectedValue(
        prismaError('P2002')
      );
      useTx(tx);
      await expect(
        availabilityRouter.createCaller(createAdminContext()).update(updateInput())
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Availability was changed by someone else. Reload and try again.',
      });
    });

    it('rethrows other database errors', async () => {
      const tx = txMock();
      tx.availabilityHour.deleteMany.mockRejectedValue(prismaError('P1001'));
      useTx(tx);
      await expect(
        availabilityRouter.createCaller(createAdminContext()).update(updateInput())
      ).rejects.toBeInstanceOf(TRPCError);
    });
  });

  describe('resetToDefaults', () => {
    it('clears hours, closures, cap and the configured marker, keeping buffers and timezone', async () => {
      const tx = txMock();
      tx.appointmentSettings.findUnique.mockResolvedValue(
        settingsRow({ availabilityConfiguredAt: null, maxDailyBookings: null })
      );
      tx.availabilityHour.findMany.mockResolvedValue([]);
      tx.availabilityClosure.findMany.mockResolvedValue([]);
      useTx(tx);

      const dto = await availabilityRouter.createCaller(createManagerContext()).resetToDefaults();

      expect(tx.appointmentSettings.updateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT },
        data: { maxDailyBookings: null, availabilityConfiguredAt: null },
      });
      expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe(`booking:${TENANT}`);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.appointmentSettings.updateMany.mock.invocationCallOrder[0]!
      );
      const order = callOrder(
        tx.appointmentSettings.updateMany,
        tx.availabilityHour.deleteMany,
        tx.availabilityClosure.deleteMany
      );
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(tx.availabilityHour.deleteMany).toHaveBeenCalledWith({ where: { tenantId: TENANT } });
      expect(tx.availabilityClosure.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT },
      });
      expect(dto).toMatchObject({
        isConfigured: false,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 5,
        maxDailyBookings: null,
        closures: [],
      });
    });

    it('is safe when the tenant has no settings row', async () => {
      const tx = txMock();
      tx.appointmentSettings.updateMany.mockResolvedValue({ count: 0 });
      tx.appointmentSettings.findUnique.mockResolvedValue(null);
      tx.availabilityHour.findMany.mockResolvedValue([]);
      tx.availabilityClosure.findMany.mockResolvedValue([]);
      useTx(tx);
      await expect(
        availabilityRouter.createCaller(createAdminContext()).resetToDefaults()
      ).resolves.toMatchObject({ isConfigured: false });
    });

    it('rejects a USER with FORBIDDEN', async () => {
      await expect(
        availabilityRouter.createCaller(createTestContext()).resetToDefaults()
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cross-tenant isolation', () => {
    it('a tenant A caller never reads tenant B rows', async () => {
      const OTHER = generateTestUUID('tenant-b');
      prismaMock.appointmentSettings.findUnique.mockImplementation((async (args: {
        where: { tenantId: string };
      }) =>
        args.where.tenantId === OTHER
          ? settingsRow({ tenantId: OTHER, defaultTimezone: 'Asia/Tokyo' })
          : null) as never);
      prismaMock.availabilityHour.findMany.mockImplementation((async (args: {
        where: { tenantId: string };
      }) =>
        args.where.tenantId === OTHER
          ? hourRows.map((r) => ({ ...r, tenantId: OTHER }))
          : []) as never);
      prismaMock.availabilityClosure.findMany.mockImplementation((async (args: {
        where: { tenantId: string };
      }) => (args.where.tenantId === OTHER ? closureRows : [])) as never);

      const dto = await availabilityRouter.createCaller(createTestContext()).get();

      expect(dto.isConfigured).toBe(false);
      expect(dto.closures).toEqual([]);
      expect(dto.days.every((d) => d.ranges.length === 0)).toBe(true);
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });
  });
});
