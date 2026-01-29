import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { AppointmentId } from './AppointmentId';
import { TimeSlot } from './TimeSlot';
import { Recurrence } from './Recurrence';
import { Buffer } from './Buffer';
import { CaseId } from '../cases/CaseId';
import {
  AppointmentStatus,
  AppointmentType,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentConfirmedEvent,
  AppointmentCancelledEvent,
  AppointmentCompletedEvent,
  AppointmentNoShowEvent,
  AppointmentLinkedToCaseEvent,
  AppointmentUnlinkedFromCaseEvent,
  AppointmentAttendeeAddedEvent,
  AppointmentAttendeeRemovedEvent,
} from './AppointmentEvents';

// Domain Errors
export class AppointmentAlreadyCancelledError extends DomainError {
  readonly code = 'APPOINTMENT_ALREADY_CANCELLED';
  constructor() {
    super('Appointment has already been cancelled');
  }
}

export class AppointmentAlreadyCompletedError extends DomainError {
  readonly code = 'APPOINTMENT_ALREADY_COMPLETED';
  constructor() {
    super('Appointment has already been completed');
  }
}

export class AppointmentInPastError extends DomainError {
  readonly code = 'APPOINTMENT_IN_PAST';
  constructor() {
    super('Cannot schedule appointment in the past');
  }
}

export class AppointmentInvalidStatusTransitionError extends DomainError {
  readonly code = 'APPOINTMENT_INVALID_STATUS_TRANSITION';
  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(`Cannot transition appointment from ${from} to ${to}`);
  }
}

export class AppointmentAttendeeAlreadyAddedError extends DomainError {
  readonly code = 'APPOINTMENT_ATTENDEE_ALREADY_ADDED';
  constructor(attendeeId: string) {
    super(`Attendee ${attendeeId} is already added to this appointment`);
  }
}

export class AppointmentAttendeeNotFoundError extends DomainError {
  readonly code = 'APPOINTMENT_ATTENDEE_NOT_FOUND';
  constructor(attendeeId: string) {
    super(`Attendee ${attendeeId} not found in this appointment`);
  }
}

export class AppointmentCaseNotLinkedError extends DomainError {
  readonly code = 'APPOINTMENT_CASE_NOT_LINKED';
  constructor(caseId: string) {
    super(`Case ${caseId} is not linked to this appointment`);
  }
}

// Appointment Props Interface
interface AppointmentProps {
  title: string;
  description?: string;
  timeSlot: TimeSlot;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  location?: string;
  buffer: Buffer;
  recurrence?: Recurrence;
  attendeeIds: string[];
  linkedCaseIds: CaseId[];
  organizerId: string;
  notes?: string;
  externalCalendarId?: string;
  reminderMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  completedAt?: Date;
  cancellationReason?: string;
}

// Create Appointment Props
export interface CreateAppointmentProps {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  appointmentType: AppointmentType;
  location?: string;
  buffer?: Buffer;
  recurrence?: Recurrence;
  attendeeIds?: string[];
  linkedCaseIds?: CaseId[];
  organizerId: string;
  reminderMinutes?: number;
}

/**
 * Appointment Aggregate Root
 * Represents a scheduled appointment with conflict detection, buffers, and recurrence support
 */
export class Appointment extends AggregateRoot<AppointmentId> {
  private props: AppointmentProps;

  private constructor(id: AppointmentId, props: AppointmentProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get timeSlot(): TimeSlot {
    return this.props.timeSlot;
  }

  get appointmentType(): AppointmentType {
    return this.props.appointmentType;
  }

  get status(): AppointmentStatus {
    return this.props.status;
  }

  get location(): string | undefined {
    return this.props.location;
  }

  get buffer(): Buffer {
    return this.props.buffer;
  }

  get recurrence(): Recurrence | undefined {
    return this.props.recurrence;
  }

  get attendeeIds(): ReadonlyArray<string> {
    return [...this.props.attendeeIds];
  }

  get linkedCaseIds(): ReadonlyArray<CaseId> {
    return [...this.props.linkedCaseIds];
  }

  get organizerId(): string {
    return this.props.organizerId;
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get externalCalendarId(): string | undefined {
    return this.props.externalCalendarId;
  }

  get reminderMinutes(): number | undefined {
    return this.props.reminderMinutes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get cancelledAt(): Date | undefined {
    return this.props.cancelledAt;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get cancellationReason(): string | undefined {
    return this.props.cancellationReason;
  }

  // Computed properties
  get isCancelled(): boolean {
    return this.props.status === 'CANCELLED';
  }

  get isCompleted(): boolean {
    return this.props.status === 'COMPLETED';
  }

  get isActive(): boolean {
    return !this.isCancelled && !this.isCompleted && this.props.status !== 'NO_SHOW';
  }

  get isRecurring(): boolean {
    return this.props.recurrence !== undefined;
  }

  get isPast(): boolean {
    return this.props.timeSlot.isPast();
  }

  get isFuture(): boolean {
    return this.props.timeSlot.isFuture();
  }

  get isCurrent(): boolean {
    return this.props.timeSlot.isCurrent();
  }

  get startTime(): Date {
    return this.props.timeSlot.startTime;
  }

  get endTime(): Date {
    return this.props.timeSlot.endTime;
  }

  get durationMinutes(): number {
    return this.props.timeSlot.durationMinutes;
  }

  /**
   * Get effective start time including buffer
   */
  get effectiveStartTime(): Date {
    return this.props.buffer.adjustStartTime(this.props.timeSlot.startTime);
  }

  /**
   * Get effective end time including buffer
   */
  get effectiveEndTime(): Date {
    return this.props.buffer.adjustEndTime(this.props.timeSlot.endTime);
  }

  /**
   * Get effective time slot including buffers
   */
  get effectiveTimeSlot(): TimeSlot {
    const result = TimeSlot.create(this.effectiveStartTime, this.effectiveEndTime);
    return result.isSuccess ? result.value : this.props.timeSlot;
  }

  // Factory method
  static create(props: CreateAppointmentProps): Result<Appointment, DomainError> {
    // Create time slot
    const timeSlotResult = TimeSlot.create(props.startTime, props.endTime);
    if (timeSlotResult.isFailure) {
      return Result.fail(timeSlotResult.error);
    }

    const timeSlot = timeSlotResult.value;

    // Check if appointment is not in the past (allow current)
    // Allow booking starting now or in the future
    const now = new Date();
    const allowedStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 minute grace period
    if (props.startTime < allowedStart) {
      return Result.fail(new AppointmentInPastError());
    }

    const appointmentId = AppointmentId.generate();
    const appointment = new Appointment(appointmentId, {
      title: props.title,
      description: props.description,
      timeSlot,
      appointmentType: props.appointmentType,
      status: 'SCHEDULED',
      location: props.location,
      buffer: props.buffer ?? Buffer.none(),
      recurrence: props.recurrence,
      attendeeIds: props.attendeeIds ?? [],
      linkedCaseIds: props.linkedCaseIds ?? [],
      organizerId: props.organizerId,
      reminderMinutes: props.reminderMinutes,
      createdAt: now,
      updatedAt: now,
    });

    appointment.addDomainEvent(
      new AppointmentCreatedEvent(
        appointmentId,
        props.title,
        timeSlot,
        props.appointmentType,
        props.organizerId
      )
    );

    return Result.ok(appointment);
  }

  // Reconstitute from persistence
  static reconstitute(id: AppointmentId, props: AppointmentProps): Appointment {
    return new Appointment(id, props);
  }

  // Commands

  /**
   * Reschedule the appointment to a new time
   */
  reschedule(
    newStartTime: Date,
    newEndTime: Date,
    rescheduledBy: string,
    reason?: string
  ): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    const newTimeSlotResult = TimeSlot.create(newStartTime, newEndTime);
    if (newTimeSlotResult.isFailure) {
      return Result.fail(newTimeSlotResult.error);
    }

    const newTimeSlot = newTimeSlotResult.value;

    // Don't allow rescheduling to the past
    if (newTimeSlot.isPast()) {
      return Result.fail(new AppointmentInPastError());
    }

    const previousTimeSlot = this.props.timeSlot;
    this.props.timeSlot = newTimeSlot;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new AppointmentRescheduledEvent(this.id, previousTimeSlot, newTimeSlot, rescheduledBy, reason)
    );

    return Result.ok(undefined);
  }

  /**
   * Confirm the appointment
   */
  confirm(confirmedBy: string): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    if (this.props.status !== 'SCHEDULED') {
      return Result.fail(
        new AppointmentInvalidStatusTransitionError(this.props.status, 'CONFIRMED')
      );
    }

    this.props.status = 'CONFIRMED';
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentConfirmedEvent(this.id, confirmedBy));

    return Result.ok(undefined);
  }

  /**
   * Start the appointment (mark as in progress)
   */
  start(startedBy: string): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    const validFromStatuses: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
    if (!validFromStatuses.includes(this.props.status)) {
      return Result.fail(
        new AppointmentInvalidStatusTransitionError(this.props.status, 'IN_PROGRESS')
      );
    }

    this.props.status = 'IN_PROGRESS';
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Complete the appointment
   */
  complete(completedBy: string, notes?: string): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    const validFromStatuses: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'];
    if (!validFromStatuses.includes(this.props.status)) {
      return Result.fail(
        new AppointmentInvalidStatusTransitionError(this.props.status, 'COMPLETED')
      );
    }

    this.props.status = 'COMPLETED';
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();
    if (notes) {
      this.props.notes = notes;
    }

    this.addDomainEvent(new AppointmentCompletedEvent(this.id, completedBy, notes));

    return Result.ok(undefined);
  }

  /**
   * Cancel the appointment
   */
  cancel(cancelledBy: string, reason?: string): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    this.props.status = 'CANCELLED';
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = reason;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentCancelledEvent(this.id, cancelledBy, reason));

    return Result.ok(undefined);
  }

  /**
   * Mark as no-show
   */
  markNoShow(markedBy: string): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (this.isCompleted) {
      return Result.fail(new AppointmentAlreadyCompletedError());
    }

    const validFromStatuses: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
    if (!validFromStatuses.includes(this.props.status)) {
      return Result.fail(new AppointmentInvalidStatusTransitionError(this.props.status, 'NO_SHOW'));
    }

    this.props.status = 'NO_SHOW';
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentNoShowEvent(this.id, markedBy));

    return Result.ok(undefined);
  }

  /**
   * Add an attendee
   */
  addAttendee(attendeeId: string, addedBy: string): Result<void, DomainError> {
    if (this.props.attendeeIds.includes(attendeeId)) {
      return Result.fail(new AppointmentAttendeeAlreadyAddedError(attendeeId));
    }

    this.props.attendeeIds.push(attendeeId);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentAttendeeAddedEvent(this.id, attendeeId, addedBy));

    return Result.ok(undefined);
  }

  /**
   * Remove an attendee
   */
  removeAttendee(attendeeId: string, removedBy: string): Result<void, DomainError> {
    const index = this.props.attendeeIds.indexOf(attendeeId);
    if (index === -1) {
      return Result.fail(new AppointmentAttendeeNotFoundError(attendeeId));
    }

    this.props.attendeeIds.splice(index, 1);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentAttendeeRemovedEvent(this.id, attendeeId, removedBy));

    return Result.ok(undefined);
  }

  /**
   * Link to a case
   */
  linkToCase(caseId: CaseId, linkedBy: string): Result<void, DomainError> {
    const alreadyLinked = this.props.linkedCaseIds.some((id) => id.value === caseId.value);
    if (alreadyLinked) {
      return Result.ok(undefined); // Idempotent - already linked
    }

    this.props.linkedCaseIds.push(caseId);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentLinkedToCaseEvent(this.id, caseId, linkedBy));

    return Result.ok(undefined);
  }

  /**
   * Unlink from a case
   */
  unlinkFromCase(caseId: CaseId, unlinkedBy: string): Result<void, DomainError> {
    const index = this.props.linkedCaseIds.findIndex((id) => id.value === caseId.value);
    if (index === -1) {
      return Result.fail(new AppointmentCaseNotLinkedError(caseId.value));
    }

    this.props.linkedCaseIds.splice(index, 1);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AppointmentUnlinkedFromCaseEvent(this.id, caseId, unlinkedBy));

    return Result.ok(undefined);
  }

  /**
   * Update appointment details
   */
  updateDetails(updates: {
    title?: string;
    description?: string;
    location?: string;
    appointmentType?: AppointmentType;
    notes?: string;
    reminderMinutes?: number;
  }): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    if (updates.title !== undefined) {
      this.props.title = updates.title;
    }
    if (updates.description !== undefined) {
      this.props.description = updates.description;
    }
    if (updates.location !== undefined) {
      this.props.location = updates.location;
    }
    if (updates.appointmentType !== undefined) {
      this.props.appointmentType = updates.appointmentType;
    }
    if (updates.notes !== undefined) {
      this.props.notes = updates.notes;
    }
    if (updates.reminderMinutes !== undefined) {
      this.props.reminderMinutes = updates.reminderMinutes;
    }

    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Update buffer times
   */
  updateBuffer(buffer: Buffer): Result<void, DomainError> {
    if (this.isCancelled) {
      return Result.fail(new AppointmentAlreadyCancelledError());
    }

    this.props.buffer = buffer;
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Set external calendar ID
   */
  setExternalCalendarId(calendarId: string): void {
    this.props.externalCalendarId = calendarId;
    this.props.updatedAt = new Date();
  }

  /**
   * Check if this appointment conflicts with another
   */
  conflictsWith(other: Appointment): boolean {
    // Don't conflict with self
    if (this.id.value === other.id.value) {
      return false;
    }

    // Only check active appointments
    if (!this.isActive || !other.isActive) {
      return false;
    }

    // Check if effective time slots overlap
    return this.effectiveTimeSlot.overlaps(other.effectiveTimeSlot);
  }

  /**
   * Check if this appointment conflicts with a time slot
   */
  conflictsWithTimeSlot(timeSlot: TimeSlot): boolean {
    if (!this.isActive) {
      return false;
    }

    return this.effectiveTimeSlot.overlaps(timeSlot);
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      title: this.title,
      description: this.description,
      timeSlot: this.timeSlot.toJSON(),
      appointmentType: this.appointmentType,
      status: this.status,
      location: this.location,
      buffer: this.buffer.toJSON(),
      recurrence: this.recurrence?.toJSON(),
      attendeeIds: [...this.attendeeIds],
      linkedCaseIds: this.linkedCaseIds.map((id) => id.value),
      organizerId: this.organizerId,
      notes: this.notes,
      externalCalendarId: this.externalCalendarId,
      reminderMinutes: this.reminderMinutes,
      effectiveStartTime: this.effectiveStartTime.toISOString(),
      effectiveEndTime: this.effectiveEndTime.toISOString(),
      durationMinutes: this.durationMinutes,
      isRecurring: this.isRecurring,
      isPast: this.isPast,
      isFuture: this.isFuture,
      isCurrent: this.isCurrent,
      isActive: this.isActive,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      cancelledAt: this.cancelledAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      cancellationReason: this.cancellationReason,
    };
  }
}
