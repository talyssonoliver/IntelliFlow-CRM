import { Appointment } from './Appointment';
import { AppointmentId } from './AppointmentId';
import { CaseId } from '../cases/CaseId';
import { TimeSlot } from './TimeSlot';
import { AppointmentStatus, AppointmentType } from './AppointmentEvents';

/**
 * Filter options for querying appointments
 */
export interface AppointmentFilter {
  organizerId?: string;
  attendeeId?: string;
  caseId?: CaseId;
  status?: AppointmentStatus | AppointmentStatus[];
  appointmentType?: AppointmentType | AppointmentType[];
  startTimeFrom?: Date;
  startTimeTo?: Date;
  endTimeFrom?: Date;
  endTimeTo?: Date;
  isRecurring?: boolean;
  hasConflicts?: boolean;
  /**
   * When set, the scoped repository wrapper injects this before dispatching
   * findWithFilters to the underlying store. External callers should not set
   * this directly — use forTenant(tenantId) instead.
   */
  tenantId?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
  sortBy?: 'startTime' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Tenant-scoped appointment repository.
 *
 * Returned by AppointmentRepository.forTenant(tenantId).  Every read method
 * and delete on this interface is implicitly scoped to the tenant supplied at
 * factory time — callers never pass tenantId directly.
 */
export interface TenantScopedAppointmentRepository {
  /** Find an appointment by ID (tenant-scoped) */
  findById(id: AppointmentId): Promise<Appointment | null>;

  /** Find multiple appointments by IDs (tenant-scoped) */
  findByIds(ids: AppointmentId[]): Promise<Appointment[]>;

  /** Find appointments by organizer */
  findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /** Find appointments by attendee */
  findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /** Find appointments linked to a case */
  findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]>;

  /** Find appointments within a time range */
  findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]>;

  /**
   * Find appointments that overlap with a given time slot.
   * Crucial for conflict detection.
   */
  findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]>;

  /**
   * Find appointments for conflict checking.
   * Returns appointments for specified attendees in a time range.
   */
  findForConflictCheck(
    attendeeIds: string[],
    timeRange: { startTime: Date; endTime: Date },
    excludeId?: AppointmentId
  ): Promise<Appointment[]>;

  /** Find appointments with filters (tenantId is injected automatically) */
  findWithFilters(
    filter: AppointmentFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Appointment>>;

  /** Count appointments by status */
  countByStatus(organizerId?: string): Promise<Record<AppointmentStatus, number>>;

  /** Find upcoming appointments */
  findUpcoming(attendeeId: string, limit?: number): Promise<Appointment[]>;

  /** Find past appointments */
  findPast(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /** Find an appointment by external calendar provider ID */
  findByExternalCalendarId(externalCalendarId: string): Promise<Appointment | null>;

  /** Check if any conflicts exist for a time slot */
  hasConflicts(
    timeSlot: TimeSlot,
    attendeeIds: string[],
    excludeId?: AppointmentId
  ): Promise<boolean>;

  /** Find recurring appointment instances for a parent */
  findRecurringInstances(parentId: AppointmentId): Promise<Appointment[]>;

  /** Find appointments needing reminders */
  findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]>;

  /** Delete an appointment by ID (tenant-scoped) */
  delete(id: AppointmentId): Promise<void>;
}

/**
 * Appointment Repository Port (Interface).
 *
 * Entry point into appointment persistence.  Obtain a tenant-scoped view via
 * forTenant(tenantId) before calling any read method; write methods (save,
 * saveAll) are safe without scoping because the entity already carries
 * tenantId.  batchUpdateStatus requires an explicit tenantId guard to prevent
 * cross-tenant bulk mutations.
 */
export interface AppointmentRepository {
  /**
   * Return a tenant-scoped view of the repository.
   * All read methods and delete on the returned object are implicitly filtered
   * to the supplied tenant.
   */
  forTenant(tenantId: string): TenantScopedAppointmentRepository;

  /**
   * Save an appointment (create or update).
   * Entity already carries tenantId — no scoping needed.
   */
  save(appointment: Appointment): Promise<void>;

  /**
   * Save multiple appointments in a transaction.
   * Entity already carries tenantId — no scoping needed.
   */
  saveAll(appointments: Appointment[]): Promise<void>;

  /**
   * Batch update appointment status with an explicit tenant guard.
   * The tenantId parameter is intentional: it prevents cross-tenant bulk
   * mutations in cases where IDs may be supplied from untrusted input.
   */
  batchUpdateStatus(
    ids: AppointmentId[],
    tenantId: string,
    status: AppointmentStatus
  ): Promise<void>;
}
