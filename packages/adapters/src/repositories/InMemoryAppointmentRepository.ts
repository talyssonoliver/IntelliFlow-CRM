import {
  Appointment,
  AppointmentId,
  AppointmentRepository,
  AppointmentFilter,
  PaginationOptions,
  PaginatedResult,
  TimeSlot,
  CaseId,
  AppointmentStatus,
} from '@intelliflow/domain';

/**
 * In-Memory Appointment Repository
 * For testing purposes
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments: Map<string, Appointment> = new Map();

  async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.value, appointment);
  }

  async saveAll(appointments: Appointment[]): Promise<void> {
    for (const appointment of appointments) {
      this.appointments.set(appointment.id.value, appointment);
    }
  }

  async findById(id: AppointmentId): Promise<Appointment | null> {
    return this.appointments.get(id.value) ?? null;
  }

  async findByIds(ids: AppointmentId[]): Promise<Appointment[]> {
    return ids
      .map((id) => this.appointments.get(id.value))
      .filter((apt): apt is Appointment => apt !== undefined);
  }

  async delete(id: AppointmentId): Promise<void> {
    this.appointments.delete(id.value);
  }

  async findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const results = Array.from(this.appointments.values())
      .filter((apt) => apt.organizerId === organizerId)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const results = Array.from(this.appointments.values())
      .filter((apt) => apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]> {
    const results = Array.from(this.appointments.values())
      .filter((apt) => apt.linkedCaseIds.some((id) => id.value === caseId.value))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]> {
    const results = Array.from(this.appointments.values())
      .filter((apt) => apt.startTime < endTime && apt.endTime > startTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter((apt) => {
        if (excludeId && apt.id.value === excludeId.value) return false;
        if (apt.status === 'CANCELLED' || apt.status === 'NO_SHOW') return false;
        return apt.startTime < timeSlot.endTime && apt.endTime > timeSlot.startTime;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async findForConflictCheck(
    attendeeIds: string[],
    timeRange: { startTime: Date; endTime: Date },
    excludeId?: AppointmentId
  ): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter((apt) => {
        if (excludeId && apt.id.value === excludeId.value) return false;
        if (apt.status === 'CANCELLED' || apt.status === 'NO_SHOW') return false;
        if (apt.startTime >= timeRange.endTime || apt.endTime <= timeRange.startTime) return false;

        const isAttendee =
          attendeeIds.includes(apt.organizerId) ||
          apt.attendeeIds.some((id) => attendeeIds.includes(id));

        return isAttendee;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async findWithFilters(
    filter: AppointmentFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Appointment>> {
    let results = Array.from(this.appointments.values());

    if (filter.organizerId) {
      results = results.filter((apt) => apt.organizerId === filter.organizerId);
    }

    if (filter.attendeeId) {
      results = results.filter(
        (apt) =>
          apt.organizerId === filter.attendeeId || apt.attendeeIds.includes(filter.attendeeId!)
      );
    }

    if (filter.caseId) {
      results = results.filter((apt) =>
        apt.linkedCaseIds.some((id) => id.value === filter.caseId!.value)
      );
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((apt) => statuses.includes(apt.status));
    }

    if (filter.appointmentType) {
      const types = Array.isArray(filter.appointmentType)
        ? filter.appointmentType
        : [filter.appointmentType];
      results = results.filter((apt) => types.includes(apt.appointmentType));
    }

    if (filter.startTimeFrom) {
      results = results.filter((apt) => apt.startTime >= filter.startTimeFrom!);
    }

    if (filter.startTimeTo) {
      results = results.filter((apt) => apt.startTime <= filter.startTimeTo!);
    }

    if (filter.isRecurring !== undefined) {
      results = results.filter((apt) => apt.isRecurring === filter.isRecurring);
    }

    results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const total = results.length;
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const items = results.slice(offset, offset + limit);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async countByStatus(organizerId?: string): Promise<Record<AppointmentStatus, number>> {
    const counts: Record<AppointmentStatus, number> = {
      SCHEDULED: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };

    for (const apt of this.appointments.values()) {
      if (organizerId && apt.organizerId !== organizerId) continue;
      counts[apt.status]++;
    }

    return counts;
  }

  async findUpcoming(attendeeId: string, limit: number = 10): Promise<Appointment[]> {
    const now = new Date();

    return Array.from(this.appointments.values())
      .filter((apt) => {
        if (apt.status === 'CANCELLED' || apt.status === 'COMPLETED' || apt.status === 'NO_SHOW') {
          return false;
        }
        if (apt.startTime <= now) return false;
        return apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId);
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, limit);
  }

  async findPast(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const now = new Date();

    const results = Array.from(this.appointments.values())
      .filter((apt) => {
        if (apt.endTime >= now) return false;
        return apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId);
      })
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()); // Descending

    return this.paginate(results, options);
  }

  async findByExternalCalendarId(calendarId: string): Promise<Appointment | null> {
    for (const apt of this.appointments.values()) {
      if (apt.externalCalendarId === calendarId) {
        return apt;
      }
    }
    return null;
  }

  async hasConflicts(
    timeSlot: TimeSlot,
    attendeeIds: string[],
    excludeId?: AppointmentId
  ): Promise<boolean> {
    for (const apt of this.appointments.values()) {
      if (excludeId && apt.id.value === excludeId.value) continue;
      if (apt.status === 'CANCELLED' || apt.status === 'NO_SHOW') continue;

      const isAttendee =
        attendeeIds.includes(apt.organizerId) ||
        apt.attendeeIds.some((id) => attendeeIds.includes(id));

      if (!isAttendee) continue;

      if (apt.startTime < timeSlot.endTime && apt.endTime > timeSlot.startTime) {
        return true;
      }
    }
    return false;
  }

  async findRecurringInstances(parentId: AppointmentId): Promise<Appointment[]> {
    // In a real implementation, this would track parent/child relationships
    // For testing, we just return empty
    return [];
  }

  async batchUpdateStatus(ids: AppointmentId[], status: AppointmentStatus): Promise<void> {
    for (const id of ids) {
      const apt = this.appointments.get(id.value);
      if (apt) {
        // Note: In a real scenario, we'd need to mutate or replace the appointment
        // This is a simplified implementation
      }
    }
  }

  async findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() + reminderThresholdMinutes * 60 * 1000);

    return Array.from(this.appointments.values())
      .filter((apt) => {
        if (apt.status !== 'SCHEDULED' && apt.status !== 'CONFIRMED') return false;
        if (!apt.reminderMinutes) return false;
        return apt.startTime > now && apt.startTime <= thresholdTime;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  // Test helpers
  clear(): void {
    this.appointments.clear();
  }

  getAll(): Appointment[] {
    return Array.from(this.appointments.values());
  }

  count(): number {
    return this.appointments.size;
  }

  private paginate(items: Appointment[], options?: PaginationOptions): Appointment[] {
    if (!options) return items;
    const { limit, offset = 0 } = options;
    return items.slice(offset, limit ? offset + limit : undefined);
  }
}
