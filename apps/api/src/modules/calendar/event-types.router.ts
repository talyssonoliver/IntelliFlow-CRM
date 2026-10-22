/**
 * Event Types Router — PG-203 (Module Settings: Event Types, ADR-083).
 *
 * Tenant meeting types, applied in the New Appointment form
 * (`listActive`) and bookable on the public booking page. Calendar is a core
 * module, so this is plain `tenantProcedure` (no LEGAL gate); writes are limited
 * to the PG-202 availability admins (ADMIN, MANAGER) and reads are open to every
 * tenant user. `prismaWithTenant` does not inject `tenantId`, so every read and
 * write passes it, and Prisma `data` objects are built field by field (never an
 * input spread). Every destructive write runs in `$transaction`.
 */
import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import {
  EVENT_TYPE_LIMITS,
  isAvailabilityAdminRole,
  type EventTypeRequiredField,
} from '@intelliflow/domain';
import {
  bookingLinkSchema,
  createEventTypeSchema,
  deleteEventTypeSchema,
  findDuplicateEventTypeField,
  updateEventTypeSchema,
  type BookingLinkDto,
  type CreateEventTypeInput,
  type EventTypeDto,
  type EventTypeListDto,
  type EventTypeOptionDto,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext, type TenantAwareContext } from '../../security/tenant-context';
import { getAuditLogger } from '../../security/audit-logger';

type EventTypeCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user' | 'prisma'>;
type Db = EventTypeCtx['prismaWithTenant'];
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

const FORBIDDEN = 'Only administrators and managers can change event types.';
const NOT_FOUND = 'Event type not found';
const HOST_NOT_FOUND = 'Host not found in this workspace';
const LIMIT_REACHED = `You can have up to ${EVENT_TYPE_LIMITS.maxPerTenant} event types.`;
const SLUG_CONFLICT = 'That booking slug is already in use.';
const NAME_CONFLICT = 'An event type with this name already exists.';
const HANDLE_TAKEN = 'That booking handle is taken. Choose another.';

const DTO_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  durationMinutes: true,
  colorToken: true,
  locationType: true,
  locationDetails: true,
  appointmentType: true,
  hostUserId: true,
  requiredFields: true,
  leadSource: true,
  isActive: true,
} as const;

type EventTypeRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  colorToken: string;
  locationType: EventTypeDto['locationType'];
  locationDetails: string | null;
  appointmentType: EventTypeDto['appointmentType'];
  hostUserId: string;
  requiredFields: string[];
  leadSource: string;
  isActive: boolean;
};

type HostRow = {
  id: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
};

/**
 * Config writes that change what is bookable take the public booking's per-tenant lock
 * (public-booking.router.ts), so a booking never commits against a type that was
 * disabled, re-hosted or deleted while it was in flight.
 */
async function lockBookings(tx: Tx, tenantId: string): Promise<void> {
  const lockKey = `booking:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

function assertEventTypeAdmin(ctx: EventTypeCtx): void {
  if (!isAvailabilityAdminRole(ctx.user?.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: FORBIDDEN });
  }
}

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

/** A unique violation on (tenantId, slug) or on lower(name). */
function rethrowUniqueConflict(err: unknown): never {
  if (prismaCode(err) === 'P2002') {
    const target = JSON.stringify((err as { meta?: { target?: unknown } }).meta?.target ?? '');
    throw new TRPCError({
      code: 'CONFLICT',
      message: target.includes('slug') ? SLUG_CONFLICT : NAME_CONFLICT,
    });
  }
  throw err;
}

function displayName(host: HostRow | undefined): string | null {
  if (!host) return null;
  if (host.name?.trim()) return host.name.trim();
  const full = [host.givenName, host.familyName].filter(Boolean).join(' ').trim();
  return full || null;
}

function toDto(row: EventTypeRow, host: HostRow | undefined, hostAvailable: boolean): EventTypeDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    durationMinutes: row.durationMinutes,
    colorToken: row.colorToken,
    locationType: row.locationType,
    locationDetails: row.locationDetails,
    appointmentType: row.appointmentType,
    hostUserId: row.hostUserId,
    hostName: displayName(host),
    hostAvailable,
    requiredFields: row.requiredFields as EventTypeRequiredField[],
    leadSource: row.leadSource as EventTypeDto['leadSource'],
    isActive: row.isActive,
  };
}

function fieldsData(input: CreateEventTypeInput) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    durationMinutes: input.durationMinutes,
    colorToken: input.colorToken,
    locationType: input.locationType,
    locationDetails: input.locationDetails,
    appointmentType: input.appointmentType,
    hostUserId: input.hostUserId,
    requiredFields: input.requiredFields,
    leadSource: input.leadSource,
    isActive: input.isActive,
  };
}

/** Write-time rules: catalogue uniqueness, Calendar-settings duration range, host in this tenant. */
/**
 * On update, `current` is the row read under the booking lock: the duration range and the host
 * are only re-checked when they change, so a type created under older Calendar settings (or
 * whose host left) can still be renamed or switched off.
 */
async function assertWritable(
  tx: Tx,
  tenantId: string,
  input: CreateEventTypeInput,
  excludeId: string | null,
  current: { durationMinutes: number; hostUserId: string } | null = null
): Promise<void> {
  const existing = await tx.eventType.findMany({
    where: { tenantId },
    select: { id: true, name: true, slug: true },
  });
  const clash = findDuplicateEventTypeField(existing, input, excludeId);
  if (clash) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        clash.field === 'slug'
          ? `That booking slug is already used by “${clash.clashWith}”.`
          : `An event type named “${clash.clashWith}” already exists.`,
    });
  }

  if (current?.durationMinutes !== input.durationMinutes) {
    const settings = await tx.appointmentSettings.findUnique({
      where: { tenantId },
      select: { minDurationMinutes: true, maxDurationMinutes: true },
    });
    const min = settings?.minDurationMinutes ?? EVENT_TYPE_LIMITS.minDurationMinutes;
    const max = settings?.maxDurationMinutes ?? EVENT_TYPE_LIMITS.maxDurationMinutes;
    if (input.durationMinutes < min || input.durationMinutes > max) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Duration must be between ${min} and ${max} minutes (Calendar settings).`,
      });
    }
  }

  if (current?.hostUserId === input.hostUserId) return;
  const hostCount = await tx.user.count({
    where: { id: input.hostUserId, ...tenantUserWhere(tenantId) },
  });
  if (hostCount === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: HOST_NOT_FOUND });
  }
}

async function readHosts(db: Db | Tx, tenantId: string, hostIds: string[]) {
  const unique = [...new Set(hostIds)];
  if (unique.length === 0)
    return { hosts: new Map<string, HostRow>(), available: new Set<string>() };
  const [hosts, available] = await Promise.all([
    db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, givenName: true, familyName: true },
    }),
    db.user.findMany({
      where: { id: { in: unique }, ...tenantUserWhere(tenantId) },
      select: { id: true },
    }),
  ]);
  return {
    hosts: new Map(hosts.map((h: HostRow) => [h.id, h])),
    available: new Set(available.map((a: { id: string }) => a.id)),
  };
}

async function readBookingLink(
  db: Db,
  tenantId: string,
  tenant?: { bookingHandle: string | null; bookingPrivacyUrl: string | null } | null
): Promise<BookingLinkDto> {
  const [link, settings] = await Promise.all([
    tenant === undefined
      ? db.tenant.findUnique({
          where: { id: tenantId },
          select: { bookingHandle: true, bookingPrivacyUrl: true },
        })
      : Promise.resolve(tenant),
    db.appointmentSettings.findUnique({
      where: { tenantId },
      select: { availabilityConfiguredAt: true },
    }),
  ]);
  return {
    handle: link?.bookingHandle ?? null,
    privacyUrl: link?.bookingPrivacyUrl ?? null,
    availabilityConfigured: Boolean(settings?.availabilityConfiguredAt),
  };
}

function audit(
  ctx: EventTypeCtx,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  id: string,
  state: {
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    eventType?: string;
  }
): void {
  // Ids and field values the admin entered only — never booker data.
  getAuditLogger(ctx.prisma)
    .logAction(action, 'event_type', id, ctx.tenant.tenantId, {
      actorId: ctx.tenant.userId,
      ...state,
    })
    .catch((err: unknown) => console.error('[event-types.router] Audit log failed:', err));
}

export const eventTypesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<EventTypeListDto> => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    const rows = (await ctx.prismaWithTenant.eventType.findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
      select: DTO_SELECT,
    })) as EventTypeRow[];
    const [{ hosts, available }, bookingLink] = await Promise.all([
      readHosts(
        ctx.prismaWithTenant,
        tenantId,
        rows.map((r) => r.hostUserId)
      ),
      readBookingLink(ctx.prismaWithTenant, tenantId),
    ]);
    return {
      items: rows.map((r) => toDto(r, hosts.get(r.hostUserId), available.has(r.hostUserId))),
      canEdit: isAvailabilityAdminRole(ctx.user?.role),
      bookingLink,
      limits: EVENT_TYPE_LIMITS,
    };
  }),

  listActive: tenantProcedure.query(async ({ ctx }): Promise<EventTypeOptionDto[]> => {
    assertTenantContext(ctx);
    const rows = (await ctx.prismaWithTenant.eventType.findMany({
      where: { tenantId: ctx.tenant.tenantId, isActive: true },
      orderBy: [{ name: 'asc' }],
      select: DTO_SELECT,
    })) as EventTypeRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      durationMinutes: r.durationMinutes,
      colorToken: r.colorToken,
      description: r.description,
      locationType: r.locationType,
      locationDetails: r.locationDetails,
      appointmentType: r.appointmentType,
    }));
  }),

  create: tenantProcedure
    .input(createEventTypeSchema)
    .mutation(async ({ ctx, input }): Promise<EventTypeDto> => {
      assertTenantContext(ctx);
      assertEventTypeAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      let created: EventTypeRow;
      try {
        created = await ctx.prismaWithTenant.$transaction(async (tx) => {
          // Serialises concurrent creates too, so the per-tenant cap cannot be overshot.
          await lockBookings(tx, tenantId);
          const count = await tx.eventType.count({ where: { tenantId } });
          if (count >= EVENT_TYPE_LIMITS.maxPerTenant) {
            throw new TRPCError({ code: 'CONFLICT', message: LIMIT_REACHED });
          }
          await assertWritable(tx, tenantId, input, null);
          return (await tx.eventType.create({
            data: { tenantId, ...fieldsData(input) },
          })) as EventTypeRow;
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        rethrowUniqueConflict(err);
      }
      audit(ctx, 'CREATE', created.id, { afterState: fieldsData(input) });
      const { hosts } = await readHosts(ctx.prismaWithTenant, tenantId, [created.hostUserId]);
      return toDto(created, hosts.get(created.hostUserId), true);
    }),

  update: tenantProcedure
    .input(updateEventTypeSchema)
    .mutation(async ({ ctx, input }): Promise<EventTypeDto> => {
      assertTenantContext(ctx);
      assertEventTypeAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const { id, ...fields } = input;
      const before = await ctx.prismaWithTenant.eventType.findFirst({
        where: { id, tenantId },
        select: DTO_SELECT,
      });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
      let updated: EventTypeRow;
      try {
        updated = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockBookings(tx, tenantId);
          const current = await tx.eventType.findFirst({
            where: { id, tenantId },
            select: { durationMinutes: true, hostUserId: true },
          });
          if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          await assertWritable(tx, tenantId, fields, id, current);
          const result = await tx.eventType.updateMany({
            where: { id, tenantId },
            data: fieldsData(fields),
          });
          if (result.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          const row = await tx.eventType.findFirst({ where: { id, tenantId }, select: DTO_SELECT });
          if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          return row as EventTypeRow;
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        rethrowUniqueConflict(err);
      }
      audit(ctx, 'UPDATE', id, { beforeState: { ...before }, afterState: fieldsData(fields) });
      const { hosts } = await readHosts(ctx.prismaWithTenant, tenantId, [updated.hostUserId]);
      return toDto(updated, hosts.get(updated.hostUserId), true);
    }),

  delete: tenantProcedure.input(deleteEventTypeSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    assertEventTypeAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const deleted = await ctx.prismaWithTenant.$transaction(async (tx) => {
      await lockBookings(tx, tenantId);
      const existing = await tx.eventType.findFirst({
        where: { id: input.id, tenantId },
        select: { id: true, name: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
      // appointments_tenantId_eventTypeId_fkey ON DELETE SET NULL ("eventTypeId") keeps linked appointments.
      await tx.eventType.deleteMany({ where: { id: input.id, tenantId } });
      return existing;
    });
    audit(ctx, 'DELETE', input.id, { beforeState: { name: deleted.name } });
    return { success: true as const };
  }),

  setBookingLink: tenantProcedure
    .input(bookingLinkSchema)
    .mutation(async ({ ctx, input }): Promise<BookingLinkDto> => {
      assertTenantContext(ctx);
      assertEventTypeAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      let link: { bookingHandle: string | null; bookingPrivacyUrl: string | null };
      try {
        link = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockBookings(tx, tenantId);
          return tx.tenant.update({
            where: { id: tenantId },
            data: { bookingHandle: input.handle, bookingPrivacyUrl: input.privacyUrl },
            select: { bookingHandle: true, bookingPrivacyUrl: true },
          });
        });
      } catch (err) {
        if (prismaCode(err) === 'P2002')
          throw new TRPCError({ code: 'CONFLICT', message: HANDLE_TAKEN });
        throw err;
      }
      // A handle change invalidates every published booking link, so it is audited.
      audit(ctx, 'UPDATE', tenantId, {
        eventType: 'booking_link.updated',
        afterState: {
          bookingHandle: link.bookingHandle,
          bookingPrivacyUrl: link.bookingPrivacyUrl,
        },
      });
      return readBookingLink(ctx.prismaWithTenant, tenantId, link);
    }),
});
