import { Result, DomainError } from '../../shared/Result';

/**
 * Error when holiday calendar is invalid
 */
export class InvalidHolidayCalendarError extends DomainError {
  readonly code = 'INVALID_HOLIDAY_CALENDAR';
  constructor(message: string) {
    super(`Invalid holiday calendar: ${message}`);
  }
}

/**
 * Holiday entry
 */
export interface Holiday {
  date: Date;
  name: string;
  recurring: boolean;
}

/**
 * HolidayCalendar - Manages holidays for deadline calculations
 * Supports both fixed-date and recurring holidays
 */
export class HolidayCalendar {
  private readonly holidays: Map<string, Holiday> = new Map();
  private readonly recurringHolidays: Array<{ month: number; day: number; name: string }> = [];

  private constructor(
    private readonly name: string,
    private readonly timezone: string = 'UTC'
  ) {}

  /**
   * Create a new holiday calendar
   */
  static create(name: string, timezone: string = 'UTC'): Result<HolidayCalendar, DomainError> {
    if (!name || name.trim().length === 0) {
      return Result.fail(new InvalidHolidayCalendarError('Calendar name is required'));
    }

    return Result.ok(new HolidayCalendar(name.trim(), timezone));
  }

  /**
   * Get calendar name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get timezone
   */
  getTimezone(): string {
    return this.timezone;
  }

  /**
   * Add a specific date holiday
   */
  addHoliday(date: Date, holidayName: string): this {
    const key = this.dateKey(date);
    this.holidays.set(key, {
      date: new Date(date),
      name: holidayName,
      recurring: false,
    });
    return this;
  }

  /**
   * Add a recurring annual holiday (e.g., Christmas is always Dec 25)
   */
  addRecurringHoliday(month: number, day: number, holidayName: string): this {
    if (month < 1 || month > 12) {
      throw new Error('Month must be between 1 and 12');
    }
    if (day < 1 || day > 31) {
      throw new Error('Day must be between 1 and 31');
    }

    this.recurringHolidays.push({ month, day, name: holidayName });
    return this;
  }

  /**
   * Remove a holiday
   */
  removeHoliday(date: Date): boolean {
    const key = this.dateKey(date);
    return this.holidays.delete(key);
  }

  /**
   * Check if a date is a holiday
   */
  isHoliday(date: Date): boolean {
    // Check specific holidays
    const key = this.dateKey(date);
    if (this.holidays.has(key)) {
      return true;
    }

    // Check recurring holidays
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return this.recurringHolidays.some((h) => h.month === month && h.day === day);
  }

  /**
   * Get holiday name for a date (if it is a holiday)
   */
  getHolidayName(date: Date): string | null {
    const key = this.dateKey(date);
    const specificHoliday = this.holidays.get(key);
    if (specificHoliday) {
      return specificHoliday.name;
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const recurring = this.recurringHolidays.find((h) => h.month === month && h.day === day);
    return recurring?.name ?? null;
  }

  /**
   * Check if a date is a weekend (Saturday or Sunday)
   */
  isWeekend(date: Date): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  /**
   * Check if a date is a business day (not weekend and not holiday)
   */
  isBusinessDay(date: Date): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  /**
   * Get all holidays in a date range
   */
  getHolidaysInRange(startDate: Date, endDate: Date): Holiday[] {
    const holidays: Holiday[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      if (this.isHoliday(current)) {
        const name = this.getHolidayName(current) ?? 'Unknown Holiday';
        holidays.push({
          date: new Date(current),
          name,
          recurring: this.recurringHolidays.some(
            (h) => h.month === current.getMonth() + 1 && h.day === current.getDate()
          ),
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return holidays;
  }

  /**
   * Count business days between two dates
   */
  countBusinessDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      if (this.isBusinessDay(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /**
   * Create US Federal holidays calendar
   */
  static usFederalHolidays(): HolidayCalendar {
    const calendar = HolidayCalendar.create('US Federal Holidays', 'America/New_York').value;

    // Fixed holidays (recurring)
    calendar.addRecurringHoliday(1, 1, "New Year's Day");
    calendar.addRecurringHoliday(7, 4, 'Independence Day');
    calendar.addRecurringHoliday(11, 11, 'Veterans Day');
    calendar.addRecurringHoliday(12, 25, 'Christmas Day');

    // Note: Floating holidays (MLK Day, Presidents Day, Memorial Day, Labor Day,
    // Thanksgiving) need to be added for specific years as they fall on different dates

    return calendar;
  }

  /**
   * Create UK bank holidays calendar
   */
  static ukBankHolidays(): HolidayCalendar {
    const calendar = HolidayCalendar.create('UK Bank Holidays', 'Europe/London').value;

    // Fixed holidays (recurring)
    calendar.addRecurringHoliday(1, 1, "New Year's Day");
    calendar.addRecurringHoliday(12, 25, 'Christmas Day');
    calendar.addRecurringHoliday(12, 26, 'Boxing Day');

    // Note: Easter Monday, Early May Bank Holiday, Spring Bank Holiday,
    // Summer Bank Holiday need to be added for specific years

    return calendar;
  }

  /**
   * Create empty calendar (no holidays)
   */
  static empty(name: string = 'Empty Calendar'): HolidayCalendar {
    return HolidayCalendar.create(name).value;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      timezone: this.timezone,
      holidays: Array.from(this.holidays.values()).map((h) => ({
        date: h.date.toISOString(),
        name: h.name,
        recurring: h.recurring,
      })),
      recurringHolidays: this.recurringHolidays,
    };
  }
}
