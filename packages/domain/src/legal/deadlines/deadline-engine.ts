/**
 * DeadlineEngine - Core deadline computation engine
 *
 * This engine handles:
 * - Computing legal deadlines based on case type
 * - Business days vs calendar days calculations
 * - Holiday and weekend exclusions
 * - Deadline rule application
 *
 * @module legal/deadlines
 */

import { Result, DomainError } from '../../shared/Result';
import { DeadlineRule, DayCountType, DeadlineTrigger } from './DeadlineRule';
import { HolidayCalendar } from './HolidayCalendar';
import { Deadline, CreateDeadlineProps, DeadlinePriority } from './Deadline';
import { CaseId } from '../cases/CaseId';

/**
 * Error when deadline calculation fails
 */
export class DeadlineCalculationError extends DomainError {
  readonly code = 'DEADLINE_CALCULATION_ERROR';
  constructor(message: string) {
    super(`Deadline calculation failed: ${message}`);
  }
}

/**
 * Configuration for deadline engine
 */
export interface DeadlineEngineConfig {
  /** Holiday calendar to use for business day calculations */
  holidayCalendar: HolidayCalendar;
  /** Default reminder intervals in days before deadline */
  defaultReminderIntervals: number[];
  /** Warning threshold - days before deadline to show "approaching" status */
  warningThresholdDays: number;
  /** Critical threshold - days before deadline to show "critical" priority */
  criticalThresholdDays: number;
}

/**
 * Computed deadline result
 */
export interface ComputedDeadline {
  dueDate: Date;
  triggerDate: Date;
  rule: DeadlineRule;
  businessDaysCount: number;
  calendarDaysCount: number;
  holidaysExcluded: number;
  weekendsExcluded: number;
}

/**
 * Reminder schedule for a deadline
 */
export interface ReminderSchedule {
  deadlineId: string;
  reminderDates: Date[];
  intervals: number[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DeadlineEngineConfig = {
  holidayCalendar: HolidayCalendar.empty(),
  defaultReminderIntervals: [7, 3, 1], // 7 days, 3 days, 1 day before
  warningThresholdDays: 3,
  criticalThresholdDays: 1,
};

/**
 * DeadlineEngine - Computes legal deadlines with business day logic
 *
 * Key features:
 * - Supports business days and calendar days
 * - Excludes weekends and holidays
 * - Handles multiple jurisdictions
 * - Generates reminder schedules
 */
export class DeadlineEngine {
  private config: DeadlineEngineConfig;

  constructor(config: Partial<DeadlineEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DeadlineEngineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DeadlineEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set holiday calendar
   */
  setHolidayCalendar(calendar: HolidayCalendar): void {
    this.config.holidayCalendar = calendar;
  }

  /**
   * Compute deadline due date from a trigger date and rule
   */
  computeDeadline(triggerDate: Date, rule: DeadlineRule): Result<ComputedDeadline, DomainError> {
    try {
      const startDate = new Date(triggerDate);
      startDate.setHours(0, 0, 0, 0);

      let dueDate: Date;
      let holidaysExcluded = 0;
      let weekendsExcluded = 0;

      if (rule.dayCountType === 'BUSINESS') {
        const result = this.addBusinessDays(startDate, rule.daysCount, rule.excludeHolidays);
        dueDate = result.dueDate;
        holidaysExcluded = result.holidaysSkipped;
        weekendsExcluded = result.weekendsSkipped;
      } else {
        const result = this.addCalendarDays(startDate, rule.daysCount, rule.excludeHolidays);
        dueDate = result.dueDate;
        holidaysExcluded = result.holidaysSkipped;
      }

      // If end day should not be included, add one more day
      if (!rule.includeEndDay) {
        dueDate.setDate(dueDate.getDate() + 1);
      }

      // Ensure deadline doesn't fall on weekend or holiday for business day deadlines
      if (rule.dayCountType === 'BUSINESS') {
        dueDate = this.adjustToNextBusinessDay(dueDate);
      }

      const calendarDaysCount = this.daysBetween(startDate, dueDate);
      const businessDaysCount = this.config.holidayCalendar.countBusinessDays(startDate, dueDate);

      return Result.ok({
        dueDate,
        triggerDate: startDate,
        rule,
        businessDaysCount,
        calendarDaysCount,
        holidaysExcluded,
        weekendsExcluded,
      });
    } catch (error) {
      return Result.fail(
        new DeadlineCalculationError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  /**
   * Create a Deadline entity from a rule and trigger date
   */
  createDeadline(
    caseId: CaseId,
    triggerDate: Date,
    rule: DeadlineRule,
    title: string,
    options?: {
      description?: string;
      assignedTo?: string;
      priority?: DeadlinePriority;
    }
  ): Result<Deadline, DomainError> {
    const computeResult = this.computeDeadline(triggerDate, rule);
    if (computeResult.isFailure) {
      return Result.fail(computeResult.error);
    }

    const computed = computeResult.value;

    const props: CreateDeadlineProps = {
      caseId,
      rule,
      triggerDate: computed.triggerDate,
      dueDate: computed.dueDate,
      title,
      description: options?.description,
      assignedTo: options?.assignedTo,
      priority: options?.priority,
    };

    return Deadline.create(props);
  }

  /**
   * Create multiple deadlines from a set of rules
   */
  createDeadlinesFromRules(
    caseId: CaseId,
    triggerDate: Date,
    rules: DeadlineRule[],
    assignedTo?: string
  ): Result<Deadline[], DomainError> {
    const deadlines: Deadline[] = [];

    for (const rule of rules) {
      const result = this.createDeadline(caseId, triggerDate, rule, rule.name, {
        description: rule.description,
        assignedTo,
      });

      if (result.isFailure) {
        return Result.fail(result.error);
      }

      deadlines.push(result.value);
    }

    return Result.ok(deadlines);
  }

  /**
   * Generate reminder schedule for a deadline
   */
  generateReminderSchedule(
    deadline: Deadline,
    intervals: number[] = this.config.defaultReminderIntervals
  ): ReminderSchedule {
    const reminderDates: Date[] = [];

    // Sort intervals in descending order (furthest reminder first)
    const sortedIntervals = [...intervals].sort((a, b) => b - a);

    for (const days of sortedIntervals) {
      const reminderDate = new Date(deadline.dueDate);
      reminderDate.setDate(reminderDate.getDate() - days);

      // Only add reminder if it's in the future
      if (reminderDate > new Date()) {
        reminderDates.push(reminderDate);
      }
    }

    return {
      deadlineId: deadline.id.value,
      reminderDates,
      intervals: sortedIntervals.filter((_, i) => i < reminderDates.length),
    };
  }

  /**
   * Check if a deadline needs a reminder based on configured intervals
   */
  shouldSendReminder(
    deadline: Deadline,
    intervals: number[] = this.config.defaultReminderIntervals
  ): {
    shouldSend: boolean;
    daysUntilDue: number;
    reminderType: 'FIRST' | 'FOLLOW_UP' | 'URGENT' | 'NONE';
  } {
    if (!deadline.isActive) {
      return { shouldSend: false, daysUntilDue: 0, reminderType: 'NONE' };
    }

    const daysUntilDue = deadline.daysRemaining;

    // Check if current day matches any reminder interval
    const matchesInterval = intervals.some((interval) => daysUntilDue === interval);

    if (!matchesInterval) {
      return { shouldSend: false, daysUntilDue, reminderType: 'NONE' };
    }

    // Determine reminder type based on days remaining
    let reminderType: 'FIRST' | 'FOLLOW_UP' | 'URGENT' | 'NONE';
    if (daysUntilDue <= 1) {
      reminderType = 'URGENT';
    } else if (deadline.remindersSent === 0) {
      reminderType = 'FIRST';
    } else {
      reminderType = 'FOLLOW_UP';
    }

    return { shouldSend: true, daysUntilDue, reminderType };
  }

  /**
   * Get deadlines approaching within threshold
   */
  filterApproachingDeadlines(
    deadlines: Deadline[],
    thresholdDays: number = this.config.warningThresholdDays
  ): Deadline[] {
    const now = new Date();
    return deadlines.filter((d) => {
      if (!d.isActive) return false;
      const daysRemaining = d.daysRemaining;
      return daysRemaining >= 0 && daysRemaining <= thresholdDays;
    });
  }

  /**
   * Get overdue deadlines
   */
  filterOverdueDeadlines(deadlines: Deadline[]): Deadline[] {
    return deadlines.filter((d) => d.isActive && d.isOverdue);
  }

  /**
   * Sort deadlines by priority and due date
   */
  sortByUrgency(deadlines: Deadline[]): Deadline[] {
    const priorityOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

    return [...deadlines].sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by due date (earliest first)
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
  }

  /**
   * Add business days to a date
   */
  private addBusinessDays(
    startDate: Date,
    days: number,
    excludeHolidays: boolean
  ): { dueDate: Date; holidaysSkipped: number; weekendsSkipped: number } {
    const result = new Date(startDate);
    let remainingDays = days;
    let holidaysSkipped = 0;
    let weekendsSkipped = 0;

    while (remainingDays > 0) {
      result.setDate(result.getDate() + 1);

      // Skip weekends
      if (this.config.holidayCalendar.isWeekend(result)) {
        weekendsSkipped++;
        continue;
      }

      // Skip holidays if configured
      if (excludeHolidays && this.config.holidayCalendar.isHoliday(result)) {
        holidaysSkipped++;
        continue;
      }

      remainingDays--;
    }

    return { dueDate: result, holidaysSkipped, weekendsSkipped };
  }

  /**
   * Add calendar days to a date (optionally excluding holidays)
   */
  private addCalendarDays(
    startDate: Date,
    days: number,
    excludeHolidays: boolean
  ): { dueDate: Date; holidaysSkipped: number } {
    const result = new Date(startDate);
    let remainingDays = days;
    let holidaysSkipped = 0;

    while (remainingDays > 0) {
      result.setDate(result.getDate() + 1);

      // Skip holidays if configured
      if (excludeHolidays && this.config.holidayCalendar.isHoliday(result)) {
        holidaysSkipped++;
        continue;
      }

      remainingDays--;
    }

    return { dueDate: result, holidaysSkipped };
  }

  /**
   * Adjust date to next business day if it falls on weekend/holiday
   */
  private adjustToNextBusinessDay(date: Date): Date {
    const result = new Date(date);

    while (
      this.config.holidayCalendar.isWeekend(result) ||
      this.config.holidayCalendar.isHoliday(result)
    ) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(startDate: Date, endDate: Date): number {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if a date is a business day
   */
  isBusinessDay(date: Date): boolean {
    return this.config.holidayCalendar.isBusinessDay(date);
  }

  /**
   * Check if a date is a holiday
   */
  isHoliday(date: Date): boolean {
    return this.config.holidayCalendar.isHoliday(date);
  }

  /**
   * Check if a date is a weekend
   */
  isWeekend(date: Date): boolean {
    return this.config.holidayCalendar.isWeekend(date);
  }

  /**
   * Get the next business day from a given date
   */
  getNextBusinessDay(date: Date): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + 1);
    return this.adjustToNextBusinessDay(result);
  }

  /**
   * Count business days until a deadline
   */
  countBusinessDaysUntil(deadline: Deadline): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (deadline.dueDate <= now) {
      return 0;
    }

    return this.config.holidayCalendar.countBusinessDays(now, deadline.dueDate);
  }

  /**
   * Validate that a deadline rule produces a valid due date
   */
  validateRule(
    rule: DeadlineRule,
    triggerDate: Date = new Date()
  ): {
    isValid: boolean;
    errors: string[];
    computedDueDate?: Date;
  } {
    const errors: string[] = [];

    if (rule.daysCount < 0) {
      errors.push('Days count must be non-negative');
    }

    if (rule.daysCount > 3650) {
      errors.push('Days count exceeds maximum (10 years)');
    }

    const computeResult = this.computeDeadline(triggerDate, rule);
    if (computeResult.isFailure) {
      errors.push(computeResult.error.message);
      return { isValid: false, errors };
    }

    const computed = computeResult.value;

    // Validate the computed due date is reasonable
    const maxFutureDate = new Date();
    maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 10);

    if (computed.dueDate > maxFutureDate) {
      errors.push('Computed due date is too far in the future');
    }

    return {
      isValid: errors.length === 0,
      errors,
      computedDueDate: computed.dueDate,
    };
  }
}

// Export singleton instance with default config
export const defaultDeadlineEngine = new DeadlineEngine();

// Export factory function for custom configurations
export function createDeadlineEngine(config: Partial<DeadlineEngineConfig> = {}): DeadlineEngine {
  return new DeadlineEngine(config);
}
