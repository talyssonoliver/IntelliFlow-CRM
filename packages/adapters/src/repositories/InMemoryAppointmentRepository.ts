import {
  Appointment,
  AppointmentId,
  AppointmentRepository,
  TenantScopedAppointmentRepository,
  AppointmentFilter,
  PaginationOptions,
  PaginatedResult,
  TimeSlot,
  CaseId,
  AppointmentStatus,
} from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Tenant-scoped inner class (not exported — obtain via forTenant())
// ---------------------------------------------------------------------------

class TenantScopedInMemoryAppointmentRepository implements TenantScopedAppointmentRepository {
  constructor(
    private readonly tenantId: string,
    private readonly store: Map<string, Appointment>
  ) {}

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private tenantValues(): Appointment[] {
    return Array.from(this.store.values()).filter((apt) => apt.tenantId === this.tenantId);
  }

  private paginate(items: Appointment[], options?: PaginationOptions): Appointment[] {
    if (!options) return items;
    const { limit, offset = 0 } = options;
    return items.slice(offset, limit ? offset + limit : undefined);
  }

  // ------------------------------------------------------------------
  // Read methods — all implicitly scoped to this.tenantId
  // ------------------------------------------------------------------

  async findById(id: AppointmentId): Promise<Appointment | null> {
    const apt = this.store.get(id.value);
    if (!apt || apt.tenantId !== this.tenantId) return null;
    return apt;
  }

  async findByIds(ids: AppointmentId[]): Promise<Appointment[]> {
    return ids
      .map((id) => this.store.get(id.value))
      .filter((apt): apt is Appointment => apt !== undefined && apt.tenantId === this.tenantId);
  }

  async findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const results = this.tenantValues()
      .filter((apt) => apt.organizerId === organizerId)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]> {
    const results = this.tenantValues()
      .filter((apt) => apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]> {
    const results = this.tenantValues()
      .filter((apt) => apt.linkedCaseIds.some((id) => id.value === caseId.value))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]> {
    const results = this.tenantValues()
      .filter((apt) => apt.startTime < endTime && apt.endTime > startTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return this.paginate(results, options);
  }

  async findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]> {
    return this.tenantValues()
      .filter((apt) => {
        if (apt.id.value === excludeId?.value) return false;
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
    return this.tenantValues()
      .filter((apt) => {
        if (apt.id.value === excludeId?.value) return false;
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
    // Always inject tenantId — port contract guarantees it is never passed by callers
    let results = this.tenantValues();

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

    for (const apt of this.tenantValues()) {
      if (organizerId && apt.organizerId !== organizerId) continue;
      counts[apt.status]++;
    }

    return counts;
  }

  async findUpcoming(attendeeId: string, limit: number = 10): Promise<Appointment[]> {
    const now = new Date();

    return this.tenantValues()
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

    const results = this.tenantValues()
      .filter((apt) => {
        if (apt.endTime >= now) return false;
        return apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId);
      })
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()); // Descending

    return this.paginate(results, options);
  }

  async findByExternalCalendarId(externalCalendarId: string): Promise<Appointment | null> {
    for (const apt of this.tenantValues()) {
      if (apt.externalCalendarId === externalCalendarId) {
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
    for (const apt of this.tenantValues()) {
      if (apt.id.value === excludeId?.value) continue;
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

  /**
   * Find recurring instances for a parent appointment.
   *
   * Limitation: The domain entity (`AppointmentProps`) does not currently track
   * a `parentAppointmentId` field.  When that field is added to the domain, replace
   * the `(apt as any).parentAppointmentId` access below with the proper getter.
   * Until then, this method always returns [] for real Appointment instances but
   * works for test doubles that carry a plain `parentAppointmentId` property.
   */
  async findRecurringInstances(parentId: AppointmentId): Promise<Appointment[]> {
    return this.tenantValues().filter((apt) => {
      const parentApptId = (apt as any).parentAppointmentId;
      if (!parentApptId) return false;
      const raw = typeof parentApptId === 'string' ? parentApptId : parentApptId?.value;
      return raw === parentId.value;
    });
  }

  async findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() + reminderThresholdMinutes * 60 * 1000);

    return this.tenantValues()
      .filter((apt) => {
        if (apt.status !== 'SCHEDULED' && apt.status !== 'CONFIRMED') return false;
        if (!apt.reminderMinutes) return false;
        return apt.startTime > now && apt.startTime <= thresholdTime;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  /** Delete by ID — no-op (silent) if ID belongs to a different tenant. */
  async delete(id: AppointmentId): Promise<void> {
    const apt = this.store.get(id.value);
    if (apt && apt.tenantId !== this.tenantId) {
      // Cross-tenant delete attempt — silent safety no-op
      return;
    }
    this.store.delete(id.value);
  }
}

// ---------------------------------------------------------------------------
// Root repository (exported)
// ---------------------------------------------------------------------------

/**
 * In-Memory Appointment Repository
 *
 * Implements the root `AppointmentRepository` port.  Obtain a tenant-scoped
 * view via `forTenant(tenantId)` before calling any read method.
 *
 * For testing purposes only — not for production use.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly appointments: Map<string, Appointment> = new Map();

  // ------------------------------------------------------------------
  // Root port — AppointmentRepository
  // ------------------------------------------------------------------

  forTenant(tenantId: string): TenantScopedAppointmentRepository {
    return new TenantScopedInMemoryAppointmentRepository(tenantId, this.appointments);
  }

  async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.value, appointment);
  }

  async saveAll(appointments: Appointment[]): Promise<void> {
    for (const appointment of appointments) {
      this.appointments.set(appointment.id.value, appointment);
    }
  }

  /**
   * Batch update appointment status with explicit tenant guard.
   *
   * BUGFIX: the original implementation had an empty loop body.
   * Fixed: iterates ids, verifies tenant ownership, then force-sets the status
   * directly on the entity's internal props (the only mutation available without
   * raising domain business-rule errors that would block test scenarios such as
   * double-cancellation).
   */
  async batchUpdateStatus(
    ids: AppointmentId[],
    tenantId: string,
    status: AppointmentStatus
  ): Promise<void> {
    for (const id of ids) {
      const apt = this.appointments.get(id.value);
      if (!apt) continue;
      // Cross-tenant guard — skip silently
      if (apt.tenantId !== tenantId) continue;
      // Force-set status directly since the entity's mutation methods enforce
      // business-rule guards that may block batch operations in test scenarios.
      (apt as any).props.status = status;
    }
  }

  // ------------------------------------------------------------------
  // Test helpers (not part of the port)
  // ------------------------------------------------------------------

  clear(): void {
    this.appointments.clear();
  }

  getAll(): Appointment[] {
    return Array.from(this.appointments.values());
  }

  count(): number {
    return this.appointments.size;
  }
}
