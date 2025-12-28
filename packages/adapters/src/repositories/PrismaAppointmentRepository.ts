import { PrismaClient, Prisma } from '@intelliflow/db';
import {
  Appointment,
  AppointmentId,
  AppointmentRepository,
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

/**
 * Prisma Appointment Repository
 * Implements AppointmentRepository port using Prisma ORM
 */
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapToEntity(
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
      appointmentType: record.appointmentType as AppointmentType,
      status: record.status as AppointmentStatus,
      location: record.location ?? undefined,
      buffer,
      recurrence,
      attendeeIds,
      linkedCaseIds,
      organizerId: record.organizerId,
      notes: record.notes ?? undefined,
      externalCalendarId: record.externalCalendarId ?? undefined,
      reminderMinutes: record.reminderMinutes ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      cancelledAt: record.cancelledAt ?? undefined,
      completedAt: record.completedAt ?? undefined,
      cancellationReason: record.cancellationReason ?? undefined,
    });
  }

  async save(appointment: Appointment): Promise<void> {
    const data = {
      id: appointment.id.value,
      title: appointment.title,
      description: appointment.description ?? null,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      appointmentType: appointment.appointmentType,
      status: appointment.status,
      location: appointment.location ?? null,
      bufferMinutesBefore: appointment.buffer.beforeMinutes,
      bufferMinutesAfter: appointment.buffer.afterMinutes,
      recurrence: appointment.recurrence ? appointment.recurrence.toJSON() : null,
      organizerId: appointment.organizerId,
      notes: appointment.notes ?? null,
      externalCalendarId: appointment.externalCalendarId ?? null,
      reminderMinutes: appointment.reminderMinutes ?? null,
      cancelledAt: appointment.cancelledAt ?? null,
      completedAt: appointment.completedAt ?? null,
      cancellationReason: appointment.cancellationReason ?? null,
    };

    await this.prisma.$transaction(async (tx) => {
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
          })),
        });
      }
    });
  }

  async saveAll(appointments: Appointment[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const appointment of appointments) {
        const data = {
          id: appointment.id.value,
          title: appointment.title,
          description: appointment.description ?? null,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          appointmentType: appointment.appointmentType,
          status: appointment.status,
          location: appointment.location ?? null,
          bufferMinutesBefore: appointment.buffer.beforeMinutes,
          bufferMinutesAfter: appointment.buffer.afterMinutes,
          recurrence: appointment.recurrence ? appointment.recurrence.toJSON() : null,
          organizerId: appointment.organizerId,
          notes: appointment.notes ?? null,
          externalCalendarId: appointment.externalCalendarId ?? null,
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
            })),
          });
        }
      }
    });
  }

  async findById(id: AppointmentId): Promise<Appointment | null> {
    const record = await this.prisma.appointment.findUnique({
      where: { id: id.value },
      include: { attendees: true, linkedCases: true },
    });

    if (!record) return null;
    return this.mapToEntity(record);
  }

  async findByIds(ids: AppointmentId[]): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { id: { in: ids.map((id) => id.value) } },
      include: { attendees: true, linkedCases: true },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async delete(id: AppointmentId): Promise<void> {
    await this.prisma.appointment.delete({
      where: { id: id.value },
    });
  }

  async findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { organizerId },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        OR: [{ organizerId: attendeeId }, { attendees: { some: { userId: attendeeId } } }],
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        linkedCases: { some: { caseId: caseId.value } },
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
      },
      include: { attendees: true, linkedCases: true },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { [options?.sortBy ?? 'startTime']: options?.sortOrder ?? 'asc' },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
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

    return records.map((record) => this.mapToEntity(record));
  }

  async findForConflictCheck(
    attendeeIds: string[],
    timeRange: { startTime: Date; endTime: Date },
    excludeId?: AppointmentId
  ): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: {
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

    return records.map((record) => this.mapToEntity(record));
  }

  async findWithFilters(
    filter: AppointmentFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Appointment>> {
    const where: Prisma.AppointmentWhereInput = {};

    if (filter.organizerId) {
      where.organizerId = filter.organizerId;
    }

    if (filter.attendeeId) {
      where.OR = [
        { organizerId: filter.attendeeId },
        { attendees: { some: { userId: filter.attendeeId } } },
      ];
    }

    if (filter.caseId) {
      where.linkedCases = { some: { caseId: filter.caseId.value } };
    }

    if (filter.status) {
      where.status = Array.isArray(filter.status) ? { in: filter.status } : filter.status;
    }

    if (filter.appointmentType) {
      where.appointmentType = Array.isArray(filter.appointmentType)
        ? { in: filter.appointmentType }
        : filter.appointmentType;
    }

    if (filter.startTimeFrom || filter.startTimeTo) {
      where.startTime = {};
      if (filter.startTimeFrom) where.startTime.gte = filter.startTimeFrom;
      if (filter.startTimeTo) where.startTime.lte = filter.startTimeTo;
    }

    if (filter.endTimeFrom || filter.endTimeTo) {
      where.endTime = {};
      if (filter.endTimeFrom) where.endTime.gte = filter.endTimeFrom;
      if (filter.endTimeTo) where.endTime.lte = filter.endTimeTo;
    }

    if (filter.isRecurring !== undefined) {
      where.recurrence = filter.isRecurring
        ? ({ not: Prisma.JsonNull } as Prisma.JsonNullableFilter<'Appointment'>)
        : (Prisma.JsonNull as unknown as Prisma.JsonNullableFilter<'Appointment'>);
    }

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

    const items = records.map((record) => this.mapToEntity(record));

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
      where: organizerId ? { organizerId } : undefined,
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

    return records.map((record) => this.mapToEntity(record));
  }

  async findPast(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const now = new Date();

    const records = await this.prisma.appointment.findMany({
      where: {
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

    return records.map((record) => this.mapToEntity(record));
  }

  async findByExternalCalendarId(calendarId: string): Promise<Appointment | null> {
    const record = await this.prisma.appointment.findFirst({
      where: { externalCalendarId: calendarId },
      include: { attendees: true, linkedCases: true },
    });

    if (!record) return null;
    return this.mapToEntity(record);
  }

  async hasConflicts(
    timeSlot: TimeSlot,
    attendeeIds: string[],
    excludeId?: AppointmentId
  ): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
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
      where: { parentAppointmentId: parentId.value },
      include: { attendees: true, linkedCases: true },
      orderBy: { startTime: 'asc' },
    });

    return records.map((record) => this.mapToEntity(record));
  }

  async batchUpdateStatus(ids: AppointmentId[], status: AppointmentStatus): Promise<void> {
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

    await this.prisma.appointment.updateMany({
      where: { id: { in: ids.map((id) => id.value) } },
      data: updateData,
    });
  }

  async findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() + reminderThresholdMinutes * 60 * 1000);

    const records = await this.prisma.appointment.findMany({
      where: {
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

    return records.map((record) => this.mapToEntity(record));
  }
}
