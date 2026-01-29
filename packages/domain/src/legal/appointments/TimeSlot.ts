import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidTimeSlotError extends DomainError {
  readonly code = 'INVALID_TIME_SLOT';

  constructor(message: string) {
    super(`Invalid time slot: ${message}`);
  }
}

export class TimeSlotConflictError extends DomainError {
  readonly code = 'TIME_SLOT_CONFLICT';

  constructor(message: string) {
    super(`Time slot conflict: ${message}`);
  }
}

interface TimeSlotProps {
  startTime: Date;
  endTime: Date;
}

/**
 * TimeSlot Value Object
 * Represents a time period with start and end times
 * Includes buffer support for scheduling
 */
export class TimeSlot extends ValueObject<TimeSlotProps> {
  private constructor(props: TimeSlotProps) {
    super(props);
  }

  get startTime(): Date {
    return new Date(this.props.startTime);
  }

  get endTime(): Date {
    return new Date(this.props.endTime);
  }

  get durationMinutes(): number {
    return Math.round(
      (this.props.endTime.getTime() - this.props.startTime.getTime()) / (1000 * 60)
    );
  }

  get durationHours(): number {
    return this.durationMinutes / 60;
  }

  /**
   * Factory method to create a TimeSlot
   */
  static create(startTime: Date, endTime: Date): Result<TimeSlot, InvalidTimeSlotError> {
    // Validate that start is before end
    if (startTime >= endTime) {
      return Result.fail(new InvalidTimeSlotError('Start time must be before end time'));
    }

    // Validate reasonable duration (max 24 hours)
    const durationMs = endTime.getTime() - startTime.getTime();
    const maxDurationMs = 24 * 60 * 60 * 1000; // 24 hours
    if (durationMs > maxDurationMs) {
      return Result.fail(new InvalidTimeSlotError('Duration cannot exceed 24 hours'));
    }

    // Minimum duration of 5 minutes
    const minDurationMs = 5 * 60 * 1000; // 5 minutes
    if (durationMs < minDurationMs) {
      return Result.fail(new InvalidTimeSlotError('Duration must be at least 5 minutes'));
    }

    return Result.ok(new TimeSlot({ startTime, endTime }));
  }

  /**
   * Create a TimeSlot from start time and duration
   */
  static createFromDuration(
    startTime: Date,
    durationMinutes: number
  ): Result<TimeSlot, InvalidTimeSlotError> {
    if (durationMinutes <= 0) {
      return Result.fail(new InvalidTimeSlotError('Duration must be positive'));
    }

    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    return TimeSlot.create(startTime, endTime);
  }

  /**
   * Check if this time slot overlaps with another
   */
  overlaps(other: TimeSlot): boolean {
    return this.props.startTime < other.props.endTime && this.props.endTime > other.props.startTime;
  }

  /**
   * Check if this time slot contains a specific point in time
   */
  contains(time: Date): boolean {
    return time >= this.props.startTime && time < this.props.endTime;
  }

  /**
   * Check if this time slot is fully contained within another
   */
  isWithin(other: TimeSlot): boolean {
    return (
      this.props.startTime >= other.props.startTime && this.props.endTime <= other.props.endTime
    );
  }

  /**
   * Create a new TimeSlot with buffer time before and after
   */
  withBuffer(
    bufferMinutesBefore: number,
    bufferMinutesAfter: number
  ): Result<TimeSlot, InvalidTimeSlotError> {
    const newStart = new Date(this.props.startTime.getTime() - bufferMinutesBefore * 60 * 1000);
    const newEnd = new Date(this.props.endTime.getTime() + bufferMinutesAfter * 60 * 1000);
    return TimeSlot.create(newStart, newEnd);
  }

  /**
   * Check if this time slot is in the past
   */
  isPast(): boolean {
    return this.props.endTime < new Date();
  }

  /**
   * Check if this time slot is currently active
   */
  isCurrent(): boolean {
    const now = new Date();
    return now >= this.props.startTime && now < this.props.endTime;
  }

  /**
   * Check if this time slot is in the future
   */
  isFuture(): boolean {
    return this.props.startTime > new Date();
  }

  /**
   * Get the gap between this time slot and another
   * Returns negative if they overlap
   */
  gapMinutes(other: TimeSlot): number {
    if (this.props.endTime <= other.props.startTime) {
      // This slot is before the other
      return Math.round(
        (other.props.startTime.getTime() - this.props.endTime.getTime()) / (1000 * 60)
      );
    } else if (other.props.endTime <= this.props.startTime) {
      // Other slot is before this
      return Math.round(
        (this.props.startTime.getTime() - other.props.endTime.getTime()) / (1000 * 60)
      );
    }
    // They overlap
    return -1;
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(startTime: Date, endTime: Date): TimeSlot {
    return new TimeSlot({ startTime, endTime });
  }

  toValue(): { startTime: string; endTime: string; durationMinutes: number } {
    return {
      startTime: this.props.startTime.toISOString(),
      endTime: this.props.endTime.toISOString(),
      durationMinutes: this.durationMinutes,
    };
  }

  toJSON(): { startTime: string; endTime: string; durationMinutes: number } {
    return this.toValue();
  }
}
