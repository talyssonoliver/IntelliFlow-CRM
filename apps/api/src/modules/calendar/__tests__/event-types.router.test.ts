/**
 * PG-203 — calendar.eventTypes router (AC-003..AC-009, AC-023 unit).
 *
 * `$transaction` runs its callback against prismaMock, so every call made inside
 * the transaction is recorded on the same delegates the tenant-scope assertion
 * walks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRPCError } from '@trpc/server';
import { eventTypesRouter } from '../event-types.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  TEST_UUIDS,
} from '../../../test/setup';
import { prismaError } from './availability.test-utils';

vi.mock('../../../security/audit-logger', () => {
  const logAction = vi.fn(async () => 'audit-1');
  return { getAuditLogger: () => ({ logAction }), __logAction: logAction };
});
import * as auditModule from '../../../security/audit-logger';
const logAction = (auditModule as unknown as { __logAction: ReturnType<typeof vi.fn> }).__logAction;

const TENANT = TEST_UUIDS.tenant;
const ID = 'clh1234567890abcdef';
const FOREIGN = 'clhforeign000000000';
const HOST = 'clhhost000000000000';
const NOW = new Date('2026-10-20T12:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    tenantId: TENANT,
    name: 'Initial consultation',
    slug: 'initial-consultation',
    description: 'A first call.',
    durationMinutes: 30,
    colorToken: 'blue',
    locationType: 'VIDEO',
    locationDetails: 'https://meet.example.invalid/x',
    appointmentType: 'CONSULTATION',
    hostUserId: HOST,
    requiredFields: ['phone'],
    leadSource: 'BOOKING',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}): any {
  const { id: _id, tenantId: _t, createdAt: _c, updatedAt: _u, ...fields } = row();
  return { ...fields, ...overrides };
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

const SCOPED: Array<[string, string[]]> = [
  ['eventType', ['findMany', 'findFirst', 'count', 'create', 'updateMany', 'deleteMany']],
  ['appointmentSettings', ['findUnique']],
];

/** Every event-type / settings call filters or writes this tenant; user reads use tenantUserWhere. */
function expectEveryCallTenantScoped(tenantId: string) {
  let calls = 0;
  for (const [model, methods] of SCOPED) {
    for (const method of methods) {
      const fn = (prismaMock as any)[model][method] as ReturnType<typeof vi.fn>;
      for (const [args] of fn.mock.calls as Array<[any]>) {
        calls += 1;
        const scope = method === 'create' ? args.data : args.where;
        expect(scope.tenantId, `${model}.${method}`).toBe(tenantId);
      }
    }
  }
  for (const [args] of prismaMock.user.count.mock.calls as Array<[any]>) {
    calls += 1;
    expect(JSON.stringify(args.where), 'user.count tenantUserWhere').toContain(tenantId);
  }
  expect(calls).toBeGreaterThan(0);
}

function stubWriteDefaults() {
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1 as never);
  prismaMock.eventType.count.mockResolvedValue(1 as never);
  prismaMock.eventType.findMany.mockResolvedValue([] as never);
  prismaMock.appointmentSettings.findUnique.mockResolvedValue({
    minDurationMinutes: 5,
    maxDurationMinutes: 480,
  } as never);
  prismaMock.user.count.mockResolvedValue(1 as never);
  prismaMock.user.findMany.mockResolvedValue([
    {
      id: HOST,
      name: 'Hana Host',
      givenName: null,
      familyName: null,
      email: 'hana@firm.example.invalid',
    },
  ] as never);
}

const member = () => eventTypesRouter.createCaller(createTestContext());
const admin = () => eventTypesRouter.createCaller(createAdminContext());
const manager = () => eventTypesRouter.createCaller(createManagerContext());

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockClear();
});

describe('list / listActive', () => {
  beforeEach(() => {
    prismaMock.eventType.findMany.mockResolvedValue([
      row(),
      row({ id: 'clh2', hostUserId: 'clhgone' }),
    ] as never);
    // The membership read carries tenantUserWhere's OR; the name read does not.
    prismaMock.user.findMany.mockImplementation(((args: any) =>
      Promise.resolve(
        'OR' in args.where
          ? [{ id: HOST }]
          : [
              { id: HOST, name: 'Hana Host', givenName: null, familyName: null },
              { id: 'clhgone', name: null, givenName: 'Gone', familyName: 'User' },
            ]
      )) as never);
    prismaMock.tenant.findUnique.mockResolvedValue({
      bookingHandle: 'smith-law',
      bookingPrivacyUrl: null,
    } as never);
    prismaMock.appointmentSettings.findUnique.mockResolvedValue({
      availabilityConfiguredAt: new Date('2026-04-01T00:00:00Z'),
    } as never);
  });

  it('returns DTOs with host names, host availability, the booking link and canEdit', async () => {
    const result = await member().list();
    expect(result.canEdit).toBe(false);
    expect(result.bookingLink).toEqual({
      handle: 'smith-law',
      privacyUrl: null,
      availabilityConfigured: true,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: ID, hostName: 'Hana Host', hostAvailable: true });
    expect(result.items[1]).toMatchObject({ hostName: 'Gone User', hostAvailable: false });
    expect(result.items[0]).not.toHaveProperty('tenantId');
    expect((await admin().list()).canEdit).toBe(true);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TENANT } })
    );
    expectEveryCallTenantScoped(TENANT);
  });

  it('listActive returns only active types as picker options', async () => {
    prismaMock.eventType.findMany.mockReset().mockResolvedValue([row()] as never);
    const options = await member().listActive();
    expect(prismaMock.eventType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, isActive: true } })
    );
    expect(options).toEqual([
      {
        id: ID,
        name: 'Initial consultation',
        durationMinutes: 30,
        colorToken: 'blue',
        description: 'A first call.',
        locationType: 'VIDEO',
        locationDetails: 'https://meet.example.invalid/x',
        appointmentType: 'CONSULTATION',
      },
    ]);
  });
});

describe('writes require ADMIN or MANAGER (AC-003)', () => {
  it.each([
    ['create', () => member().create(input())],
    ['update', () => member().update({ ...input(), id: ID })],
    ['delete', () => member().delete({ id: ID })],
    ['setBookingLink', () => member().setBookingLink({ handle: 'smith-law', privacyUrl: null })],
  ])('%s is FORBIDDEN for a member, before any write', async (_name, call) => {
    await expectCode(call(), 'FORBIDDEN');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });

  it('a manager may create', async () => {
    stubWriteDefaults();
    prismaMock.eventType.create.mockResolvedValue(row() as never);
    await expect(manager().create(input())).resolves.toMatchObject({ id: ID });
  });
});

describe('create (AC-004, AC-005)', () => {
  beforeEach(() => stubWriteDefaults());

  it('creates inside a transaction with fields built one by one and audits it', async () => {
    prismaMock.eventType.create.mockResolvedValue(row() as never);
    const dto = await admin().create(input());
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // The catalogue cap is counted under the per-tenant lock (no 51st type from a race).
    expect((prismaMock.$executeRaw.mock.calls[0] as unknown[])[1]).toBe(`booking:${TENANT}`);
    expect(prismaMock.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.eventType.count.mock.invocationCallOrder[0]
    );
    expect(prismaMock.eventType.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT,
        name: 'Initial consultation',
        slug: 'initial-consultation',
        description: 'A first call.',
        durationMinutes: 30,
        colorToken: 'blue',
        locationType: 'VIDEO',
        locationDetails: 'https://meet.example.invalid/x',
        appointmentType: 'CONSULTATION',
        hostUserId: HOST,
        requiredFields: ['phone'],
        leadSource: 'BOOKING',
        isActive: true,
      },
    });
    expect(dto).toMatchObject({ id: ID, hostName: 'Hana Host', hostAvailable: true });
    expect(logAction).toHaveBeenCalledWith('CREATE', 'event_type', ID, TENANT, expect.any(Object));
    expectEveryCallTenantScoped(TENANT);
  });

  it('refuses the 51st type', async () => {
    prismaMock.eventType.count.mockResolvedValue(50 as never);
    await expectCode(admin().create(input()), 'CONFLICT');
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it('rejects a slug already used by a stored type (catalogue superRefine)', async () => {
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 'clhother', name: 'Intro', slug: 'initial-consultation' },
    ] as never);
    await expect(admin().create(input())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That booking slug is already used by “Intro”.',
    });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it('rejects a name already used by a stored type (case-insensitive)', async () => {
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 'clhother', name: 'INITIAL consultation', slug: 'x' },
    ] as never);
    await expect(admin().create(input())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An event type named “INITIAL consultation” already exists.',
    });
  });

  it("rejects a duration outside the tenant's Calendar settings range", async () => {
    prismaMock.appointmentSettings.findUnique.mockResolvedValue({
      minDurationMinutes: 15,
      maxDurationMinutes: 60,
    } as never);
    await expect(admin().create(input({ durationMinutes: 90 }))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Duration must be between 15 and 60 minutes (Calendar settings).',
    });
  });

  it('uses the 5..480 defaults when the tenant has no Calendar settings row', async () => {
    prismaMock.appointmentSettings.findUnique.mockResolvedValue(null as never);
    prismaMock.eventType.create.mockResolvedValue(row({ durationMinutes: 480 }) as never);
    await expect(admin().create(input({ durationMinutes: 480 }))).resolves.toBeDefined();
  });

  it('returns NOT_FOUND for a host outside the tenant (AC-005)', async () => {
    prismaMock.user.count.mockResolvedValue(0 as never);
    await expect(admin().create(input({ hostUserId: FOREIGN }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Host not found in this workspace',
    });
    expect(JSON.stringify(prismaMock.user.count.mock.calls[0][0])).toContain(FOREIGN);
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it('maps a unique violation on slug or name to CONFLICT', async () => {
    prismaMock.eventType.create.mockRejectedValueOnce(
      Object.assign(prismaError('P2002'), { meta: { target: ['tenantId', 'slug'] } })
    );
    await expect(admin().create(input())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That booking slug is already in use.',
    });
    prismaMock.eventType.create.mockRejectedValueOnce(
      Object.assign(prismaError('P2002'), { meta: { target: 'event_types_tenant_lower_name_key' } })
    );
    await expect(admin().create(input())).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An event type with this name already exists.',
    });
  });

  it('rethrows other database errors', async () => {
    prismaMock.eventType.create.mockRejectedValueOnce(prismaError('P1001'));
    await expect(admin().create(input())).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('update (AC-004, AC-006, AC-023)', () => {
  beforeEach(() => stubWriteDefaults());

  it('returns NOT_FOUND for a type of another tenant, before any write', async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce(null as never);
    await expectCode(admin().update({ ...input(), id: FOREIGN }), 'NOT_FOUND');
    expect(prismaMock.eventType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FOREIGN, tenantId: TENANT } })
    );
    expect(prismaMock.eventType.updateMany).not.toHaveBeenCalled();
  });

  it('updates with a tenant-scoped updateMany and ignores its own slug in the duplicate check', async () => {
    prismaMock.eventType.findFirst
      .mockResolvedValueOnce(row() as never)
      .mockResolvedValueOnce(row({ name: 'Renamed' }) as never);
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: ID, name: 'Initial consultation', slug: 'initial-consultation' },
    ] as never);
    prismaMock.eventType.updateMany.mockResolvedValue({ count: 1 } as never);
    const dto = await admin().update({ ...input({ name: 'Renamed' }), id: ID });
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID, tenantId: TENANT },
        data: expect.objectContaining({ name: 'Renamed' }),
      })
    );
    expect(dto.name).toBe('Renamed');
    expect(logAction).toHaveBeenCalledWith('UPDATE', 'event_type', ID, TENANT, expect.any(Object));
    expectEveryCallTenantScoped(TENANT);
  });

  it('returns NOT_FOUND when the row vanished between the check and the write', async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce(row() as never);
    prismaMock.eventType.updateMany.mockResolvedValue({ count: 0 } as never);
    await expectCode(admin().update({ ...input(), id: ID }), 'NOT_FOUND');
  });
});

describe('delete (AC-006)', () => {
  beforeEach(() => stubWriteDefaults());

  it('update and delete take the public booking lock before writing (stale-config race)', async () => {
    prismaMock.$executeRaw.mockResolvedValue(1 as never);
    prismaMock.eventType.findFirst.mockResolvedValue({ ...row(), name: 'x' } as never);
    prismaMock.eventType.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.eventType.deleteMany.mockResolvedValue({ count: 1 } as never);
    await admin().update({ ...input(), id: ID });
    await admin().delete({ id: ID });
    const keys = prismaMock.$executeRaw.mock.calls.map((call) => (call as unknown[])[1]);
    expect(keys).toEqual([`booking:${TENANT}`, `booking:${TENANT}`]);
    const lockOrder = prismaMock.$executeRaw.mock.invocationCallOrder[1];
    expect(lockOrder).toBeLessThan(prismaMock.eventType.deleteMany.mock.invocationCallOrder[0]);
  });

  it('deletes inside a transaction after a tenant-scoped ownership check', async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce({
      id: ID,
      name: 'Initial consultation',
    } as never);
    prismaMock.eventType.deleteMany.mockResolvedValue({ count: 1 } as never);
    await expect(admin().delete({ id: ID })).resolves.toEqual({ success: true });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.deleteMany).toHaveBeenCalledWith({
      where: { id: ID, tenantId: TENANT },
    });
    expect(logAction).toHaveBeenCalledWith('DELETE', 'event_type', ID, TENANT, expect.any(Object));
    expectEveryCallTenantScoped(TENANT);
  });

  it('returns NOT_FOUND for a foreign id and deletes nothing', async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce(null as never);
    await expectCode(admin().delete({ id: FOREIGN }), 'NOT_FOUND');
    expect(prismaMock.eventType.deleteMany).not.toHaveBeenCalled();
  });
});

describe('setBookingLink (AC-007)', () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
    prismaMock.$executeRaw.mockResolvedValue(1 as never);
  });

  it('takes the booking lock so no booking commits against the old link', async () => {
    prismaMock.tenant.update.mockResolvedValue({
      bookingHandle: 'smith-law',
      bookingPrivacyUrl: null,
    } as never);
    prismaMock.appointmentSettings.findUnique.mockResolvedValue(null as never);
    await admin().setBookingLink({ handle: 'smith-law', privacyUrl: null });
    const [strings, key] = prismaMock.$executeRaw.mock.calls[0] as unknown as [string[], string];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(');
    expect(key).toBe(`booking:${TENANT}`);
  });

  it('sets the handle and privacy URL on the caller tenant only and audits it', async () => {
    prismaMock.tenant.update.mockResolvedValue({
      bookingHandle: 'smith-law',
      bookingPrivacyUrl: 'https://firm.example.invalid/privacy',
    } as never);
    prismaMock.appointmentSettings.findUnique.mockResolvedValue({
      availabilityConfiguredAt: null,
    } as never);
    const result = await admin().setBookingLink({
      handle: ' Smith-Law ',
      privacyUrl: 'https://firm.example.invalid/privacy',
    });
    expect(prismaMock.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT },
      data: {
        bookingHandle: 'smith-law',
        bookingPrivacyUrl: 'https://firm.example.invalid/privacy',
      },
      select: { bookingHandle: true, bookingPrivacyUrl: true },
    });
    expect(result).toEqual({
      handle: 'smith-law',
      privacyUrl: 'https://firm.example.invalid/privacy',
      availabilityConfigured: false,
    });
    expect(logAction).toHaveBeenCalledWith(
      'UPDATE',
      'event_type',
      TENANT,
      TENANT,
      expect.objectContaining({ eventType: 'booking_link.updated' })
    );
  });

  it('clears both fields with null', async () => {
    prismaMock.tenant.update.mockResolvedValue({
      bookingHandle: null,
      bookingPrivacyUrl: null,
    } as never);
    prismaMock.appointmentSettings.findUnique.mockResolvedValue(null as never);
    await admin().setBookingLink({ handle: null, privacyUrl: null });
    expect(prismaMock.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bookingHandle: null, bookingPrivacyUrl: null } })
    );
  });

  it('maps a taken handle to CONFLICT', async () => {
    prismaMock.tenant.update.mockRejectedValueOnce(prismaError('P2002'));
    await expect(
      admin().setBookingLink({ handle: 'smith-law', privacyUrl: null })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That booking handle is taken. Choose another.',
    });
  });

  it('rejects a reserved handle before touching the database', async () => {
    await expectCode(admin().setBookingLink({ handle: 'admin', privacyUrl: null }), 'BAD_REQUEST');
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });
});

describe('source hygiene (row DoD)', () => {
  it('never uses skipDuplicates', () => {
    const source = readFileSync(resolve(__dirname, '../event-types.router.ts'), 'utf8');
    expect(source).not.toContain('skipDuplicates');
  });
});
