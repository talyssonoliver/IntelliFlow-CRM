import { PrismaClient, Prisma, withTransaction, type TransactionClient } from '@intelliflow/db';
import {
  Appointment,
  AppointmentId,
  AppointmentRepository,
  TenantScopedAppointmentRepository,
  AppointmentFilter,
  PaginationOptions,
  PaginatedResult,
  TimeSlot,
  Buffer,
  Recurrence,
  CaseId,
  AppointmentStatus,
  AppointmentType,
} from '@intelliflow/domain';

/**
 * Helper to create AppointmentId from string
 */
function createAppointmentId(id: string): AppointmentId {
  const result = AppointmentId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid AppointmentId: ${id}`);
  }
  return result.value;
}

/**
 * Helper to create CaseId from string
 */
function createCaseId(id: string): CaseId {
  const result = CaseId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid CaseId: ${id}`);
  }
  return result.value;
}

/** Build the Prisma WHERE clause for findWithFilters */
function buildTimeRangeFilter(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

function buildAppointmentFilterWhere(filter: AppointmentFilter): Prisma.AppointmentWhereInput {
  const where: Prisma.AppointmentWhereInput = {};

  // Inject tenantId if present (set by scoped repo wrapper)
  if (filter.tenantId) where.tenantId = filter.tenantId;

  if (filter.organizerId) where.organizerId = filter.organizerId;

  if (filter.attendeeId) {
    where.OR = [
      { organizerId: filter.attendeeId },
      { attendees: { some: { userId: filter.attendeeId } } },
    ];
  }

  if (filter.caseId) where.linkedCases = { some: { caseId: filter.caseId.value } };

  if (filter.status) {
    where.status = Array.isArray(filter.status) ? { in: filter.status } : filter.status;
  }

  if (filter.appointmentType) {
    where.appointmentType = Array.isArray(filter.appointmentType)
      ? { in: filter.appointmentType }
      : filter.appointmentType;
  }

  const startTimeFilter = buildTimeRangeFilter(filter.startTimeFrom, filter.startTimeTo);
  if (startTimeFilter) where.startTime = startTimeFilter;

  const endTimeFilter = buildTimeRangeFilter(filter.endTimeFrom, filter.endTimeTo);
  if (endTimeFilter) where.endTime = endTimeFilter;

  if (filter.isRecurring !== undefined) {
    where.recurrence = filter.isRecurring
      ? ({ not: Prisma.JsonNull } as Prisma.JsonNullableFilter<'Appointment'>)
      : ({ equals: Prisma.JsonNull } as Prisma.JsonNullableFilter<'Appointment'>);
  }

  return where;
}

/** Shared mapper — used by both the root repo (save) and the scoped repo (reads). */
function mapToEntity(
  record: Prisma.AppointmentGetPayload<{
    include: { attendees: true; linkedCases: true };
  }>
): Appointment {
  const timeSlot = TimeSlot.reconstitute(record.startTime, record.endTime);
  const buffer = Buffer.reconstitute(record.bufferMinutesBefore, record.bufferMinutesAfter);

  let recurrence: Recurrence | undefined;
  if (record.recurrence) {
    recurrence = Recurrence.reconstitute(record.recurrence as any);
  }

  const attendeeIds = record.attendees.map((a) => a.userId);
  const linkedCaseIds = record.linkedCases.map((c) => createCaseId(c.caseId));

  return Appointment.reconstitute(createAppointmentId(record.id), {
    title: record.title,
    description: record.description ?? undefined,
    timeSlot,
    timezone: record.timezone ?? undefined,
    appointmentType: record.appointmentType as AppointmentType,
    status: record.status as AppointmentStatus,
    location: record.location ?? undefined,
    buffer,
    recurrence,
    attendeeIds,
    linkedCaseIds,
    organizerId: record.organizerId,
    tenantId: (record as { tenantId?: string }).tenantId ?? 'default',
    notes: record.notes ?? undefined,
    externalCalendarId: record.externalCalendarId ?? undefined,
    calendarId: record.calendarId ?? null,
    reminderMinutes: record.reminderMinutes ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cancelledAt: record.cancelledAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    cancellationReason: record.cancellationReason ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Inner scoped repo — not exported
// ---------------------------------------------------------------------------

/**
 * Tenant-scoped Prisma implementation.
 * Every read method and delete is guarded by `tenantId`.
 * Not exported — obtained exclusively via `PrismaAppointmentRepository.forTenant(tenantId)`.
 */
class TenantScopedPrismaAppointmentRepository implements TenantScopedAppointmentRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string
  ) {}

  async findById(id: AppointmentId): Promise<Appointment | null> {
    const record = await this.prisma.appointment.findFirst({
      where: { id: id.value, tenantId: this.tenantId },
      include: { attendees: true, linkedCases: true },
    });

    if (!record) return null;
    return mapToEntity(record);
  }

  async findByIds(ids: AppointmentId[]): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { id: { in: ids.map((id) => id.value) }, tenantId: this.tenantId },
      include: { attendees: true, linkedCases: true },
    });

    return records.map(mapToEntity);
  }

  async findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { organizerId, tenantId: this.tenantId },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        OR: [{ organizerId: attendeeId }, { attendees: { some: { userId: attendeeId } } }],
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        linkedCases: { some: { caseId: caseId.value } },
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [
          { startTime: { lt: timeSlot.endTime } },
          { endTime: { gt: timeSlot.startTime } },
          excludeId ? { id: { not: excludeId.value } } : {},
          { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        ],
      },
      include: { attendees: true, linkedCases: true },
      orderBy: { startTime: 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findForConflictCheck(
    attendeeIds: string[],
    timeRange: { startTime: Date; endTime: Date },
    excludeId?: AppointmentId
  ): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [
          {
            OR: [
              { organizerId: { in: attendeeIds } },
              { attendees: { some: { userId: { in: attendeeIds } } } },
            ],
          },
          { startTime: { lt: timeRange.endTime } },
          { endTime: { gt: timeRange.startTime } },
          excludeId ? { id: { not: excludeId.value } } : {},
          { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        ],
      },
      include: { attendees: true, linkedCases: true },
      orderBy: { startTime: 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findWithFilters(
    filter: AppointmentFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Appointment>> {
    // Inject tenantId into the filter so buildAppointmentFilterWhere picks it up
    const where: Prisma.AppointmentWhereInput = buildAppointmentFilterWhere({
      ...filter,
      tenantId: this.tenantId,
    });

    const [records, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: { attendees: true, linkedCases: true },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
        orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    const items = records.map(mapToEntity);

    return {
      items,
      total,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      hasMore: (options?.offset ?? 0) + items.length < total,
    };
  }

  async countByStatus(organizerId?: string): Promise<Record<AppointmentStatus, number>> {
    const results = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: { tenantId: this.tenantId, ...(organizerId && { organizerId }) },
      _count: true,
    });

    const counts: Record<AppointmentStatus, number> = {
      SCHEDULED: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };

    for (const result of results) {
      counts[result.status as AppointmentStatus] = result._count;
    }

    return counts;
  }

  async findUpcoming(attendeeId: string, limit: number = 10): Promise<Appointment[]> {
    const now = new Date();

    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [
          {
            OR: [{ organizerId: attendeeId }, { attendees: { some: { userId: attendeeId } } }],
          },
          { startTime: { gte: now } },
          { status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] } },
        ],
      },
      include: { attendees: true, linkedCases: true },
      take: limit,
      orderBy: { startTime: 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findPast(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const now = new Date();

    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [
          {
            OR: [{ organizerId: attendeeId }, { attendees: { some: { userId: attendeeId } } }],
          },
          { endTime: { lt: now } },
        ],
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { startTime: 'desc' },
    });

    return records.map(mapToEntity);
  }

  async findByExternalCalendarId(externalCalendarId: string): Promise<Appointment | null> {
    // findFirst (not findUnique) because tenantId is part of the composed WHERE
    const record = await this.prisma.appointment.findFirst({
      where: { externalCalendarId, tenantId: this.tenantId },
      include: { attendees: true, linkedCases: true },
    });

    if (!record) return null;
    return mapToEntity(record);
  }

  async hasConflicts(
    timeSlot: TimeSlot,
    attendeeIds: string[],
    excludeId?: AppointmentId
  ): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        tenantId: this.tenantId,
        AND: [
          {
            OR: [
              { organizerId: { in: attendeeIds } },
              { attendees: { some: { userId: { in: attendeeIds } } } },
            ],
          },
          { startTime: { lt: timeSlot.endTime } },
          { endTime: { gt: timeSlot.startTime } },
          excludeId ? { id: { not: excludeId.value } } : {},
          { status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        ],
      },
    });

    return count > 0;
  }

  async findRecurringInstances(parentId: AppointmentId): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { parentAppointmentId: parentId.value, tenantId: this.tenantId },
      include: { attendees: true, linkedCases: true },
      orderBy: { startTime: 'asc' },
    });

    return records.map(mapToEntity);
  }

  async findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() + reminderThresholdMinutes * 60 * 1000);

    const records = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        AND: [
          { startTime: { gt: now } },
          { startTime: { lte: thresholdTime } },
          { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          { reminderMinutes: { not: null } },
        ],
      },
      include: { attendees: true, linkedCases: true },
      orderBy: { startTime: 'asc' },
    });

    return records.map(mapToEntity);
  }

  async delete(id: AppointmentId): Promise<void> {
    // deleteMany (not delete) prevents silent cross-tenant delete when id alone is stale
    await this.prisma.appointment.deleteMany({
      where: { id: id.value, tenantId: this.tenantId },
    });
  }
}

// ---------------------------------------------------------------------------
// Root repo (write-capable, forTenant factory)
// ---------------------------------------------------------------------------

/**
 * Prisma Appointment Repository
 *
 * Implements the root `AppointmentRepository` port.
 * Write methods (save, saveAll, batchUpdateStatus) are available on this class
 * because the entity already carries tenantId or the caller provides it explicitly.
 * Read / delete methods live on the scoped repo returned by `forTenant(tenantId)`.
 */
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  forTenant(tenantId: string): TenantScopedAppointmentRepository {
    return new TenantScopedPrismaAppointmentRepository(this.prisma, tenantId);
  }

  async save(appointment: Appointment): Promise<void> {
    const data = {
      id: appointment.id.value,
      title: appointment.title,
      description: appointment.description ?? null,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      timezone: appointment.timezone ?? null,
      appointmentType: appointment.appointmentType,
      status: appointment.status,
      location: appointment.location ?? null,
      bufferMinutesBefore: appointment.buffer.beforeMinutes,
      bufferMinutesAfter: appointment.buffer.afterMinutes,
      recurrence: appointment.recurrence ? appointment.recurrence.toJSON() : null,
      organizerId: appointment.organizerId,
      tenantId: appointment.tenantId,
      notes: appointment.notes ?? null,
      externalCalendarId: appointment.externalCalendarId ?? null,
      calendarId: appointment.calendarId ?? null,
      reminderMinutes: appointment.reminderMinutes ?? null,
      cancelledAt: appointment.cancelledAt ?? null,
      completedAt: appointment.completedAt ?? null,
      cancellationReason: appointment.cancellationReason ?? null,
    };

    await withTransaction(async (tx: TransactionClient) => {
      // Upsert appointment
      await tx.appointment.upsert({
        where: { id: data.id },
        create: data as Prisma.AppointmentUncheckedCreateInput,
        update: data as Prisma.AppointmentUncheckedUpdateInput,
      });

      // Sync attendees
      await tx.appointmentAttendee.deleteMany({
        where: { appointmentId: data.id },
      });

      if (appointment.attendeeIds.length > 0) {
        await tx.appointmentAttendee.createMany({
          data: appointment.attendeeIds.map((userId) => ({
            appointmentId: data.id,
            userId,
            tenantId: data.tenantId,
          })),
        });
      }

      // Sync linked cases
      await tx.appointmentCase.deleteMany({
        where: { appointmentId: data.id },
      });

      if (appointment.linkedCaseIds.length > 0) {
        await tx.appointmentCase.createMany({
          data: appointment.linkedCaseIds.map((caseId) => ({
            appointmentId: data.id,
            caseId: caseId.value,
            tenantId: data.tenantId,
          })),
        });
      }
    });
  }

  async saveAll(appointments: Appointment[]): Promise<void> {
    await withTransaction(async (tx: TransactionClient) => {
      for (const appointment of appointments) {
        await this.syncAppointmentInTx(tx, appointment);
      }
    });
  }

  private async syncAppointmentInTx(
    tx: TransactionClient,
    appointment: Appointment
  ): Promise<void> {
    const data = {
      id: appointment.id.value,
      title: appointment.title,
      description: appointment.description ?? null,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      timezone: appointment.timezone ?? null,
      appointmentType: appointment.appointmentType,
      status: appointment.status,
      location: appointment.location ?? null,
      bufferMinutesBefore: appointment.buffer.beforeMinutes,
      bufferMinutesAfter: appointment.buffer.afterMinutes,
      recurrence: appointment.recurrence ? appointment.recurrence.toJSON() : null,
      organizerId: appointment.organizerId,
      tenantId: appointment.tenantId,
      notes: appointment.notes ?? null,
      externalCalendarId: appointment.externalCalendarId ?? null,
      calendarId: appointment.calendarId ?? null,
      reminderMinutes: appointment.reminderMinutes ?? null,
      cancelledAt: appointment.cancelledAt ?? null,
      completedAt: appointment.completedAt ?? null,
      cancellationReason: appointment.cancellationReason ?? null,
    };

    await tx.appointment.upsert({
      where: { id: data.id },
      create: data as Prisma.AppointmentUncheckedCreateInput,
      update: data as Prisma.AppointmentUncheckedUpdateInput,
    });

    // Sync attendees
    await tx.appointmentAttendee.deleteMany({
      where: { appointmentId: data.id },
    });

    if (appointment.attendeeIds.length > 0) {
      await tx.appointmentAttendee.createMany({
        data: appointment.attendeeIds.map((userId) => ({
          appointmentId: data.id,
          userId,
          tenantId: data.tenantId,
        })),
      });
    }

    // Sync linked cases
    await tx.appointmentCase.deleteMany({
      where: { appointmentId: data.id },
    });

    if (appointment.linkedCaseIds.length > 0) {
      await tx.appointmentCase.createMany({
        data: appointment.linkedCaseIds.map((caseId) => ({
          appointmentId: data.id,
          caseId: caseId.value,
          tenantId: data.tenantId,
        })),
      });
    }
  }

  async batchUpdateStatus(
    ids: AppointmentId[],
    tenantId: string,
    status: AppointmentStatus
  ): Promise<void> {
    const now = new Date();
    const updateData: Prisma.AppointmentUpdateManyMutationInput = {
      status,
      updatedAt: now,
    };

    if (status === 'CANCELLED') {
      updateData.cancelledAt = now;
    } else if (status === 'COMPLETED') {
      updateData.completedAt = now;
    }

    // tenantId guard prevents cross-tenant bulk mutations when IDs come from untrusted input
    await this.prisma.appointment.updateMany({
      where: { id: { in: ids.map((id) => id.value) }, tenantId },
      data: updateData,
    });
  }
}
