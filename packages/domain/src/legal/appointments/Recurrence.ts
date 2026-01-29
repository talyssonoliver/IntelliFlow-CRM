import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidRecurrenceError extends DomainError {
  readonly code = 'INVALID_RECURRENCE';

  constructor(message: string) {
    super(`Invalid recurrence: ${message}`);
  }
}

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type DayOfWeek =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

interface RecurrenceProps {
  frequency: RecurrenceFrequency;
  interval: number; // Every n days/weeks/months/years
  daysOfWeek?: DayOfWeek[]; // For WEEKLY frequency
  dayOfMonth?: number; // For MONTHLY frequency
  monthOfYear?: number; // For YEARLY frequency
  endDate?: Date; // When recurrence ends (null for indefinite)
  occurrenceCount?: number; // Number of occurrences (alternative to endDate)
  exceptionDates: Date[]; // Dates to skip
}

/**
 * Recurrence Value Object
 * Represents a recurrence pattern for appointments
 * Supports daily, weekly, monthly, yearly, and custom patterns
 */
export class Recurrence extends ValueObject<RecurrenceProps> {
  private constructor(props: RecurrenceProps) {
    super(props);
  }

  get frequency(): RecurrenceFrequency {
    return this.props.frequency;
  }

  get interval(): number {
    return this.props.interval;
  }

  get daysOfWeek(): DayOfWeek[] | undefined {
    return this.props.daysOfWeek ? [...this.props.daysOfWeek] : undefined;
  }

  get dayOfMonth(): number | undefined {
    return this.props.dayOfMonth;
  }

  get monthOfYear(): number | undefined {
    return this.props.monthOfYear;
  }

  get endDate(): Date | undefined {
    return this.props.endDate ? new Date(this.props.endDate) : undefined;
  }

  get occurrenceCount(): number | undefined {
    return this.props.occurrenceCount;
  }

  get exceptionDates(): Date[] {
    return this.props.exceptionDates.map((d) => new Date(d));
  }

  /**
   * Create a daily recurrence
   */
  static createDaily(
    interval: number = 1,
    options?: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, InvalidRecurrenceError> {
    if (interval < 1) {
      return Result.fail(new InvalidRecurrenceError('Interval must be at least 1'));
    }

    return Result.ok(
      new Recurrence({
        frequency: 'DAILY',
        interval,
        endDate: options?.endDate,
        occurrenceCount: options?.occurrenceCount,
        exceptionDates: [],
      })
    );
  }

  /**
   * Create a weekly recurrence
   */
  static createWeekly(
    daysOfWeek: DayOfWeek[],
    interval: number = 1,
    options?: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, InvalidRecurrenceError> {
    if (interval < 1) {
      return Result.fail(new InvalidRecurrenceError('Interval must be at least 1'));
    }

    if (daysOfWeek.length === 0) {
      return Result.fail(new InvalidRecurrenceError('At least one day of week must be specified'));
    }

    return Result.ok(
      new Recurrence({
        frequency: 'WEEKLY',
        interval,
        daysOfWeek,
        endDate: options?.endDate,
        occurrenceCount: options?.occurrenceCount,
        exceptionDates: [],
      })
    );
  }

  /**
   * Create a monthly recurrence
   */
  static createMonthly(
    dayOfMonth: number,
    interval: number = 1,
    options?: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, InvalidRecurrenceError> {
    if (interval < 1) {
      return Result.fail(new InvalidRecurrenceError('Interval must be at least 1'));
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return Result.fail(new InvalidRecurrenceError('Day of month must be between 1 and 31'));
    }

    return Result.ok(
      new Recurrence({
        frequency: 'MONTHLY',
        interval,
        dayOfMonth,
        endDate: options?.endDate,
        occurrenceCount: options?.occurrenceCount,
        exceptionDates: [],
      })
    );
  }

  /**
   * Create a yearly recurrence
   */
  static createYearly(
    monthOfYear: number,
    dayOfMonth: number,
    interval: number = 1,
    options?: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, InvalidRecurrenceError> {
    if (interval < 1) {
      return Result.fail(new InvalidRecurrenceError('Interval must be at least 1'));
    }

    if (monthOfYear < 1 || monthOfYear > 12) {
      return Result.fail(new InvalidRecurrenceError('Month of year must be between 1 and 12'));
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return Result.fail(new InvalidRecurrenceError('Day of month must be between 1 and 31'));
    }

    return Result.ok(
      new Recurrence({
        frequency: 'YEARLY',
        interval,
        monthOfYear,
        dayOfMonth,
        endDate: options?.endDate,
        occurrenceCount: options?.occurrenceCount,
        exceptionDates: [],
      })
    );
  }

  /**
   * Create a custom recurrence with all options
   */
  static createCustom(props: {
    frequency: RecurrenceFrequency;
    interval: number;
    daysOfWeek?: DayOfWeek[];
    dayOfMonth?: number;
    monthOfYear?: number;
    endDate?: Date;
    occurrenceCount?: number;
    exceptionDates?: Date[];
  }): Result<Recurrence, InvalidRecurrenceError> {
    if (props.interval < 1) {
      return Result.fail(new InvalidRecurrenceError('Interval must be at least 1'));
    }

    return Result.ok(
      new Recurrence({
        ...props,
        exceptionDates: props.exceptionDates ?? [],
      })
    );
  }

  /**
   * Add an exception date
   */
  withException(date: Date): Recurrence {
    const newExceptions = [...this.props.exceptionDates, date];
    return new Recurrence({
      ...this.props,
      exceptionDates: newExceptions,
    });
  }

  /**
   * Remove an exception date
   */
  removeException(date: Date): Recurrence {
    const newExceptions = this.props.exceptionDates.filter((d) => d.getTime() !== date.getTime());
    return new Recurrence({
      ...this.props,
      exceptionDates: newExceptions,
    });
  }

  /**
   * Check if a date is an exception
   */
  isException(date: Date): boolean {
    return this.props.exceptionDates.some((d) => this.isSameDay(d, date));
  }

  /**
   * Check if the recurrence has ended
   */
  hasEnded(currentDate: Date): boolean {
    if (this.props.endDate && currentDate > this.props.endDate) {
      return true;
    }
    return false;
  }

  /**
   * Generate occurrences from a start date
   * @param startDate The starting date for recurrence
   * @param maxOccurrences Maximum number of occurrences to generate
   * @param upToDate Optional end date to stop generation
   */
  generateOccurrences(startDate: Date, maxOccurrences: number = 100, upToDate?: Date): Date[] {
    const occurrences: Date[] = [];
    let currentDate = new Date(startDate);
    const endDate =
      this.props.endDate ?? upToDate ?? new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
    const maxCount = this.props.occurrenceCount ?? maxOccurrences;

    while (occurrences.length < maxCount && currentDate <= endDate) {
      if (!this.isException(currentDate)) {
        if (this.matchesPattern(currentDate)) {
          occurrences.push(new Date(currentDate));
        }
      }
      currentDate = this.nextDate(currentDate);
    }

    return occurrences;
  }

  /**
   * Check if a date matches the recurrence pattern
   */
  private matchesPattern(date: Date): boolean {
    switch (this.props.frequency) {
      case 'DAILY':
        return true;

      case 'WEEKLY': {
        const dayName = this.getDayName(date.getDay());
        return this.props.daysOfWeek?.includes(dayName) ?? false;
      }

      case 'MONTHLY':
        return date.getDate() === this.props.dayOfMonth;

      case 'YEARLY':
        return (
          date.getMonth() + 1 === this.props.monthOfYear && date.getDate() === this.props.dayOfMonth
        );

      case 'CUSTOM':
        // Custom follows the same logic based on provided props
        if (this.props.daysOfWeek && this.props.daysOfWeek.length > 0) {
          const day = this.getDayName(date.getDay());
          if (!this.props.daysOfWeek.includes(day)) return false;
        }
        if (this.props.dayOfMonth !== undefined && date.getDate() !== this.props.dayOfMonth) {
          return false;
        }
        if (
          this.props.monthOfYear !== undefined &&
          date.getMonth() + 1 !== this.props.monthOfYear
        ) {
          return false;
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Get the next date based on the recurrence pattern
   */
  private nextDate(currentDate: Date): Date {
    const next = new Date(currentDate);

    switch (this.props.frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + this.props.interval);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + 1); // Move to next day to check
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + this.props.interval);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + this.props.interval);
        break;
      case 'CUSTOM':
        next.setDate(next.getDate() + 1); // Default to daily iteration for custom
        break;
    }

    return next;
  }

  private getDayName(dayIndex: number): DayOfWeek {
    const days: DayOfWeek[] = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    return days[dayIndex];
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(props: RecurrenceProps): Recurrence {
    return new Recurrence({
      ...props,
      endDate: props.endDate ? new Date(props.endDate) : undefined,
      exceptionDates: props.exceptionDates.map((d) => new Date(d)),
    });
  }

  toValue(): RecurrenceProps {
    return {
      frequency: this.props.frequency,
      interval: this.props.interval,
      daysOfWeek: this.props.daysOfWeek,
      dayOfMonth: this.props.dayOfMonth,
      monthOfYear: this.props.monthOfYear,
      endDate: this.props.endDate,
      occurrenceCount: this.props.occurrenceCount,
      exceptionDates: this.props.exceptionDates,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      frequency: this.props.frequency,
      interval: this.props.interval,
      daysOfWeek: this.props.daysOfWeek,
      dayOfMonth: this.props.dayOfMonth,
      monthOfYear: this.props.monthOfYear,
      endDate: this.props.endDate?.toISOString(),
      occurrenceCount: this.props.occurrenceCount,
      exceptionDates: this.props.exceptionDates.map((d) => d.toISOString()),
    };
  }

  /**
   * Get human-readable description
   */
  describe(): string {
    switch (this.props.frequency) {
      case 'DAILY':
        return this.props.interval === 1 ? 'Daily' : `Every ${this.props.interval} days`;

      case 'WEEKLY': {
        const days = this.props.daysOfWeek?.join(', ') ?? '';
        return this.props.interval === 1
          ? `Weekly on ${days}`
          : `Every ${this.props.interval} weeks on ${days}`;
      }

      case 'MONTHLY':
        return this.props.interval === 1
          ? `Monthly on day ${this.props.dayOfMonth}`
          : `Every ${this.props.interval} months on day ${this.props.dayOfMonth}`;

      case 'YEARLY':
        return this.props.interval === 1
          ? `Yearly on ${this.props.monthOfYear}/${this.props.dayOfMonth}`
          : `Every ${this.props.interval} years on ${this.props.monthOfYear}/${this.props.dayOfMonth}`;

      case 'CUSTOM':
        return 'Custom recurrence';

      default:
        return 'Unknown recurrence';
    }
  }
}
