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
 * Appointment Repository Port (Interface)
 * Defines the contract for appointment persistence
 * To be implemented by infrastructure adapters
 */
export interface AppointmentRepository {
  /**
   * Save an appointment (create or update)
   */
  save(appointment: Appointment): Promise<void>;

  /**
   * Save multiple appointments in a transaction
   */
  saveAll(appointments: Appointment[]): Promise<void>;

  /**
   * Find an appointment by ID
   */
  findById(id: AppointmentId): Promise<Appointment | null>;

  /**
   * Find multiple appointments by IDs
   */
  findByIds(ids: AppointmentId[]): Promise<Appointment[]>;

  /**
   * Delete an appointment by ID
   */
  delete(id: AppointmentId): Promise<void>;

  /**
   * Find appointments by organizer
   */
  findByOrganizer(organizerId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /**
   * Find appointments by attendee
   */
  findByAttendee(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /**
   * Find appointments linked to a case
   */
  findByCase(caseId: CaseId, options?: PaginationOptions): Promise<Appointment[]>;

  /**
   * Find appointments within a time range
   */
  findInTimeRange(
    startTime: Date,
    endTime: Date,
    options?: PaginationOptions
  ): Promise<Appointment[]>;

  /**
   * Find appointments that overlap with a given time slot
   * Crucial for conflict detection
   */
  findOverlapping(timeSlot: TimeSlot, excludeId?: AppointmentId): Promise<Appointment[]>;

  /**
   * Find appointments for conflict checking
   * Returns appointments for specified attendees in a time range
   */
  findForConflictCheck(
    attendeeIds: string[],
    timeRange: { startTime: Date; endTime: Date },
    excludeId?: AppointmentId
  ): Promise<Appointment[]>;

  /**
   * Find appointments with filters
   */
  findWithFilters(
    filter: AppointmentFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Appointment>>;

  /**
   * Count appointments by status
   */
  countByStatus(organizerId?: string): Promise<Record<AppointmentStatus, number>>;

  /**
   * Find upcoming appointments
   */
  findUpcoming(attendeeId: string, limit?: number): Promise<Appointment[]>;

  /**
   * Find past appointments
   */
  findPast(attendeeId: string, options?: PaginationOptions): Promise<Appointment[]>;

  /**
   * Find appointments by external calendar ID
   */
  findByExternalCalendarId(calendarId: string): Promise<Appointment | null>;

  /**
   * Check if any conflicts exist for a time slot
   */
  hasConflicts(
    timeSlot: TimeSlot,
    attendeeIds: string[],
    excludeId?: AppointmentId
  ): Promise<boolean>;

  /**
   * Find recurring appointment instances
   */
  findRecurringInstances(parentId: AppointmentId): Promise<Appointment[]>;

  /**
   * Batch update appointment status
   */
  batchUpdateStatus(ids: AppointmentId[], status: AppointmentStatus): Promise<void>;

  /**
   * Find appointments needing reminders
   */
  findNeedingReminder(reminderThresholdMinutes: number): Promise<Appointment[]>;
}
