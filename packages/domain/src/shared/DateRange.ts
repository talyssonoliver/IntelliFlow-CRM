import { ValueObject } from './ValueObject';
import { Result, DomainError } from './Result';

/**
 * DateRange Value Object
 *
 * Encapsulates date range validation and calculations.
 * Ensures start date is always before or equal to end date.
 *
 * @example
 * const result = DateRange.create(new Date('2024-01-01'), new Date('2024-01-31'));
 * if (result.isSuccess) {
 *   console.log(result.value.durationInDays); // 30
 *   console.log(result.value.contains(new Date('2024-01-15'))); // true
 * }
 */

interface DateRangeProps {
  start: Date;
  end: Date;
}

export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE';

  constructor(message: string) {
    super(message);
  }
}

export class DateRange extends ValueObject<DateRangeProps> {
  /**
   * Create a DateRange from start and end dates
   *
   * @param start - Start date
   * @param end - End date (must be >= start)
   * @returns Result containing DateRange or InvalidDateRangeError
   */
  static create(start: Date | string, end: Date | string): Result<DateRange, InvalidDateRangeError> {
    // Convert strings to dates if needed
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;

    // Validate dates are valid
    if (isNaN(startDate.getTime())) {
      return Result.fail(new InvalidDateRangeError('Start date is invalid'));
    }

    if (isNaN(endDate.getTime())) {
      return Result.fail(new InvalidDateRangeError('End date is invalid'));
    }

    // Validate start <= end
    if (startDate > endDate) {
      return Result.fail(
        new InvalidDateRangeError(
          `Start date (${startDate.toISOString()}) must be before or equal to end date (${endDate.toISOString()})`
        )
      );
    }

    return Result.ok(new DateRange({ start: startDate, end: endDate }));
  }

  /**
   * Create a DateRange for the last N days (including today)
   */
  static lastNDays(days: number): Result<DateRange, InvalidDateRangeError> {
    if (days < 1) {
      return Result.fail(new InvalidDateRangeError('Days must be at least 1'));
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));

    // Reset to start of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return DateRange.create(start, end);
  }

  /**
   * Create a DateRange for the last N months
   */
  static lastNMonths(months: number): Result<DateRange, InvalidDateRangeError> {
    if (months < 1) {
      return Result.fail(new InvalidDateRangeError('Months must be at least 1'));
    }

    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);

    // Reset to start/end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return DateRange.create(start, end);
  }

  /**
   * Create a DateRange for the current month
   */
  static thisMonth(): Result<DateRange, InvalidDateRangeError> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return DateRange.create(start, end);
  }

  /**
   * Create a DateRange for the current quarter
   */
  static thisQuarter(): Result<DateRange, InvalidDateRangeError> {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);

    return DateRange.create(start, end);
  }

  /**
   * Create a DateRange for the current year
   */
  static thisYear(): Result<DateRange, InvalidDateRangeError> {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    return DateRange.create(start, end);
  }

  /**
   * Get the start date
   */
  get start(): Date {
    return new Date(this.props.start); // Return copy to maintain immutability
  }

  /**
   * Get the end date
   */
  get end(): Date {
    return new Date(this.props.end); // Return copy to maintain immutability
  }

  /**
   * Get the duration in milliseconds
   */
  get durationInMs(): number {
    return this.props.end.getTime() - this.props.start.getTime();
  }

  /**
   * Get the duration in days
   */
  get durationInDays(): number {
    return Math.ceil(this.durationInMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get the duration in weeks
   */
  get durationInWeeks(): number {
    return Math.ceil(this.durationInDays / 7);
  }

  /**
   * Get the duration in months (approximate)
   */
  get durationInMonths(): number {
    const yearsDiff = this.props.end.getFullYear() - this.props.start.getFullYear();
    const monthsDiff = this.props.end.getMonth() - this.props.start.getMonth();
    return yearsDiff * 12 + monthsDiff;
  }

  /**
   * Check if a date is within this range (inclusive)
   */
  contains(date: Date): boolean {
    const timestamp = date.getTime();
    return timestamp >= this.props.start.getTime() && timestamp <= this.props.end.getTime();
  }

  /**
   * Check if this range overlaps with another range
   */
  overlaps(other: DateRange): boolean {
    return (
      this.props.start <= other.props.end && this.props.end >= other.props.start
    );
  }

  /**
   * Check if this range is before another range (no overlap)
   */
  isBefore(other: DateRange): boolean {
    return this.props.end < other.props.start;
  }

  /**
   * Check if this range is after another range (no overlap)
   */
  isAfter(other: DateRange): boolean {
    return this.props.start > other.props.end;
  }

  /**
   * Format the date range as a string
   */
  format(locale = 'en-US', options?: Intl.DateTimeFormatOptions): string {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    };

    const startStr = this.props.start.toLocaleDateString(locale, defaultOptions);
    const endStr = this.props.end.toLocaleDateString(locale, defaultOptions);

    return `${startStr} - ${endStr}`;
  }

  /**
   * Get raw value for serialization
   */
  toValue(): { start: Date; end: Date } {
    return {
      start: this.props.start,
      end: this.props.end,
    };
  }

  /**
   * Convert to ISO string range
   */
  toISOString(): string {
    return `${this.props.start.toISOString()} - ${this.props.end.toISOString()}`;
  }

  /**
   * Convert to string (formatted)
   */
  toString(): string {
    return this.format();
  }
}
