/**
 * Deadline Domain Service
 *
 * Bridge between the API layer and the domain layer for deadlines.
 * Uses DeadlineEngine for business day calculations, holiday exclusions,
 * and deadline computation.
 *
 * @module apps/api/src/services/deadline-domain.service
 */

import {
  DeadlineEngine,
  createDeadlineEngine,
  Deadline,
  DeadlineRule,
  HolidayCalendar,
  CaseId,
  type DeadlineEngineConfig,
  type ComputedDeadline,
  type ReminderSchedule,
  type DeadlinePriority,
  type DayCountType,
  type DeadlineTrigger,
  type Jurisdiction,
} from '@intelliflow/domain';

// ============================================================================
// Types for Service Layer
// ============================================================================

/**
 * Input for computing a deadline
 */
export interface ComputeDeadlineInput {
  triggerDate: Date;
  daysCount: number;
  dayCountType: DayCountType;
  excludeHolidays?: boolean;
  includeEndDay?: boolean;
  jurisdiction?: Jurisdiction;
}

/**
 * Input for creating a deadline from a rule
 */
export interface CreateDeadlineFromRuleInput {
  caseId: string;
  triggerDate: Date;
  rule: {
    name: string;
    description?: string;
    daysCount: number;
    dayCountType: DayCountType;
    trigger: DeadlineTrigger;
    excludeHolidays?: boolean;
    includeEndDay?: boolean;
    jurisdiction?: Jurisdiction;
  };
  title?: string;
  description?: string;
  assignedTo?: string;
  priority?: DeadlinePriority;
}

/**
 * Timeline deadline item
 */
export interface TimelineDeadline {
  id: string;
  title: string;
  description?: string;
  dueDate: Date;
  triggerDate: Date;
  priority: DeadlinePriority;
  status: string;
  daysRemaining: number;
  businessDaysRemaining: number;
  isOverdue: boolean;
  isApproaching: boolean;
  isCritical: boolean;
  caseId: string;
  assignedTo?: string;
  reminderSchedule: ReminderSchedule;
}

/**
 * Deadline summary for dashboard
 */
export interface DeadlineSummary {
  total: number;
  overdue: number;
  dueToday: number;
  approaching: number; // within warning threshold
  critical: number; // within critical threshold
  completedThisWeek: number;
  upcomingByPriority: Record<DeadlinePriority, number>;
}

/**
 * Holiday configuration
 */
export interface HolidayConfig {
  country: string;
  region?: string;
  customHolidays?: Array<{ date: Date; name: string }>;
}

// ============================================================================
// Deadline Domain Service
// ============================================================================

/**
 * DeadlineDomainService - Applies domain logic to deadline operations
 *
 * This service:
 * - Uses DeadlineEngine for deadline computation
 * - Handles business day calculations
 * - Manages holiday calendars
 * - Generates reminder schedules
 */
export class DeadlineDomainService {
  private engine: DeadlineEngine;
  private config: Partial<DeadlineEngineConfig>;

  constructor(config?: Partial<DeadlineEngineConfig>) {
    this.config = config ?? {};
    this.engine = createDeadlineEngine(this.config);
  }

  /**
   * Configure the deadline engine
   */
  configure(config: Partial<DeadlineEngineConfig>): void {
    this.config = { ...this.config, ...config };
    this.engine.updateConfig(this.config);
  }

  /**
   * Set up holiday calendar from configuration
   */
  configureHolidays(holidays: HolidayConfig): void {
    // Create holiday calendar with UK bank holidays
    const calendar = HolidayCalendar.ukBankHolidays();

    // Add custom holidays if provided
    if (holidays.customHolidays) {
      for (const holiday of holidays.customHolidays) {
        calendar.addHoliday(holiday.date, holiday.name);
      }
    }

    this.engine.setHolidayCalendar(calendar);
  }

  /**
   * Compute a deadline due date
   */
  computeDeadline(input: ComputeDeadlineInput): ComputedDeadline | null {
    // Create deadline rule
    const ruleResult = DeadlineRule.create({
      name: 'Computed Deadline',
      description: 'Dynamically computed deadline',
      daysCount: input.daysCount,
      dayCountType: input.dayCountType,
      trigger: 'CASE_FILED', // Default trigger
      excludeHolidays: input.excludeHolidays ?? true,
      includeEndDay: input.includeEndDay ?? false,
      jurisdiction: input.jurisdiction,
    });

    if (ruleResult.isFailure) {
      console.error('[DeadlineDomainService] Failed to create rule:', ruleResult.error);
      return null;
    }

    const computeResult = this.engine.computeDeadline(input.triggerDate, ruleResult.value);
    if (computeResult.isFailure) {
      console.error('[DeadlineDomainService] Failed to compute deadline:', computeResult.error);
      return null;
    }

    return computeResult.value;
  }

  /**
   * Create a deadline from a rule
   */
  createDeadlineFromRule(input: CreateDeadlineFromRuleInput): Deadline | null {
    // Create deadline rule
    const ruleResult = DeadlineRule.create({
      name: input.rule.name,
      description: input.rule.description,
      daysCount: input.rule.daysCount,
      dayCountType: input.rule.dayCountType,
      trigger: input.rule.trigger,
      excludeHolidays: input.rule.excludeHolidays ?? true,
      includeEndDay: input.rule.includeEndDay ?? false,
      jurisdiction: input.rule.jurisdiction,
    });

    if (ruleResult.isFailure) {
      console.error('[DeadlineDomainService] Failed to create rule:', ruleResult.error);
      return null;
    }

    // Create CaseId
    const caseIdResult = CaseId.create(input.caseId);
    if (caseIdResult.isFailure) {
      console.error('[DeadlineDomainService] Invalid case ID:', input.caseId);
      return null;
    }

    // Create deadline
    const deadlineResult = this.engine.createDeadline(
      caseIdResult.value,
      input.triggerDate,
      ruleResult.value,
      input.title ?? input.rule.name,
      {
        description: input.description ?? input.rule.description,
        assignedTo: input.assignedTo,
        priority: input.priority,
      }
    );

    if (deadlineResult.isFailure) {
      console.error('[DeadlineDomainService] Failed to create deadline:', deadlineResult.error);
      return null;
    }

    return deadlineResult.value;
  }

  /**
   * Create multiple deadlines from rules
   */
  createDeadlinesFromRules(
    caseId: string,
    triggerDate: Date,
    rules: Array<{
      name: string;
      description?: string;
      daysCount: number;
      dayCountType: DayCountType;
      trigger: DeadlineTrigger;
      excludeHolidays?: boolean;
      includeEndDay?: boolean;
      jurisdiction?: Jurisdiction;
    }>,
    assignedTo?: string
  ): Deadline[] {
    const deadlines: Deadline[] = [];

    for (const rule of rules) {
      const deadline = this.createDeadlineFromRule({
        caseId,
        triggerDate,
        rule,
        assignedTo,
      });

      if (deadline) {
        deadlines.push(deadline);
      }
    }

    return deadlines;
  }

  /**
   * Generate reminder schedule for a deadline
   */
  generateReminderSchedule(deadline: Deadline, intervals?: number[]): ReminderSchedule {
    return this.engine.generateReminderSchedule(deadline, intervals);
  }

  /**
   * Check if a reminder should be sent
   */
  shouldSendReminder(
    deadline: Deadline,
    intervals?: number[]
  ): { shouldSend: boolean; daysUntilDue: number; reminderType: string } {
    return this.engine.shouldSendReminder(deadline, intervals);
  }

  /**
   * Get approaching deadlines (within threshold)
   */
  filterApproachingDeadlines(deadlines: Deadline[], thresholdDays?: number): Deadline[] {
    return this.engine.filterApproachingDeadlines(deadlines, thresholdDays);
  }

  /**
   * Get overdue deadlines
   */
  filterOverdueDeadlines(deadlines: Deadline[]): Deadline[] {
    return this.engine.filterOverdueDeadlines(deadlines);
  }

  /**
   * Sort deadlines by urgency
   */
  sortByUrgency(deadlines: Deadline[]): Deadline[] {
    return this.engine.sortByUrgency(deadlines);
  }

  /**
   * Convert domain deadlines to timeline format
   */
  toTimelineDeadlines(deadlines: Deadline[]): TimelineDeadline[] {
    const config = this.engine.getConfig();

    return deadlines.map((d) => ({
      id: d.id.value,
      title: d.title,
      description: d.description,
      dueDate: d.dueDate,
      triggerDate: d.triggerDate,
      priority: d.priority,
      status: d.status,
      daysRemaining: d.daysRemaining,
      businessDaysRemaining: this.engine.countBusinessDaysUntil(d),
      isOverdue: d.isOverdue,
      isApproaching: d.daysRemaining >= 0 && d.daysRemaining <= config.warningThresholdDays,
      isCritical: d.daysRemaining >= 0 && d.daysRemaining <= config.criticalThresholdDays,
      caseId: d.caseId.value,
      assignedTo: d.assignedTo,
      reminderSchedule: this.generateReminderSchedule(d),
    }));
  }

  /**
   * Calculate deadline summary for dashboard
   */
  calculateSummary(deadlines: Deadline[]): DeadlineSummary {
    const config = this.engine.getConfig();
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const activeDeadlines = deadlines.filter((d) => d.isActive);
    const overdue = activeDeadlines.filter((d) => d.isOverdue);
    const dueToday = activeDeadlines.filter((d) => d.daysRemaining === 0);
    const approaching = activeDeadlines.filter(
      (d) => d.daysRemaining > 0 && d.daysRemaining <= config.warningThresholdDays
    );
    const critical = activeDeadlines.filter(
      (d) => d.daysRemaining >= 0 && d.daysRemaining <= config.criticalThresholdDays
    );
    const completedThisWeek = deadlines.filter(
      (d) => d.status === 'COMPLETED' && d.completedAt && d.completedAt >= weekAgo
    );

    // Count by priority
    const upcomingByPriority: Record<DeadlinePriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const d of activeDeadlines) {
      upcomingByPriority[d.priority]++;
    }

    return {
      total: activeDeadlines.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      approaching: approaching.length,
      critical: critical.length,
      completedThisWeek: completedThisWeek.length,
      upcomingByPriority,
    };
  }

  /**
   * Check if a date is a business day
   */
  isBusinessDay(date: Date): boolean {
    return this.engine.isBusinessDay(date);
  }

  /**
   * Check if a date is a holiday
   */
  isHoliday(date: Date): boolean {
    return this.engine.isHoliday(date);
  }

  /**
   * Get next business day
   */
  getNextBusinessDay(date: Date): Date {
    return this.engine.getNextBusinessDay(date);
  }

  /**
   * Validate a deadline rule
   */
  validateRule(
    rule: {
      name: string;
      daysCount: number;
      dayCountType: DayCountType;
      trigger: DeadlineTrigger;
      excludeHolidays?: boolean;
      includeEndDay?: boolean;
    },
    triggerDate?: Date
  ): { isValid: boolean; errors: string[]; computedDueDate?: Date } {
    const ruleResult = DeadlineRule.create({
      name: rule.name,
      description: '',
      daysCount: rule.daysCount,
      dayCountType: rule.dayCountType,
      trigger: rule.trigger,
      excludeHolidays: rule.excludeHolidays ?? true,
      includeEndDay: rule.includeEndDay ?? false,
    });

    if (ruleResult.isFailure) {
      return { isValid: false, errors: [ruleResult.error.message] };
    }

    return this.engine.validateRule(ruleResult.value, triggerDate);
  }

  /**
   * Get upcoming deadlines for a case
   * Returns deadlines sorted by urgency
   */
  getUpcomingDeadlinesForCase(
    caseId: string,
    deadlines: Deadline[],
    daysAhead: number = 30
  ): TimelineDeadline[] {
    // Filter to case
    const caseDeadlines = deadlines.filter(
      (d) => d.caseId.value === caseId && d.isActive
    );

    // Filter to upcoming
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const upcoming = caseDeadlines.filter(
      (d) => d.dueDate <= futureDate || d.isOverdue
    );

    // Sort by urgency
    const sorted = this.sortByUrgency(upcoming);

    // Convert to timeline format
    return this.toTimelineDeadlines(sorted);
  }

  /**
   * Convert DB records to domain Deadlines
   */
  static toDomainDeadlines(
    dbDeadlines: Array<{
      id: string;
      caseId: string;
      title: string;
      description?: string | null;
      dueDate: Date;
      triggerDate: Date;
      priority: string;
      status: string;
      assignedTo?: string | null;
      completedAt?: Date | null;
      rule?: {
        name: string;
        daysCount: number;
        dayCountType: string;
        trigger: string;
        excludeHolidays?: boolean;
        includeEndDay?: boolean;
      } | null;
    }>
  ): Deadline[] {
    const deadlines: Deadline[] = [];

    for (const dbDl of dbDeadlines) {
      try {
        // Create CaseId
        const caseIdResult = CaseId.create(dbDl.caseId);
        if (caseIdResult.isFailure) continue;

        // Create rule if available
        let rule: DeadlineRule | undefined;
        if (dbDl.rule) {
          const ruleResult = DeadlineRule.create({
            name: dbDl.rule.name,
            description: '',
            daysCount: dbDl.rule.daysCount,
            dayCountType: dbDl.rule.dayCountType as DayCountType,
            trigger: dbDl.rule.trigger as DeadlineTrigger,
            excludeHolidays: dbDl.rule.excludeHolidays ?? true,
            includeEndDay: dbDl.rule.includeEndDay ?? false,
          });
          if (ruleResult.isSuccess) {
            rule = ruleResult.value;
          }
        }

        // Create deadline
        const deadlineResult = Deadline.create({
          caseId: caseIdResult.value,
          rule: rule ?? DeadlineRule.create({
            name: dbDl.title,
            description: '',
            daysCount: 0,
            dayCountType: 'CALENDAR',
            trigger: 'CUSTOM',
          }).value,
          triggerDate: dbDl.triggerDate,
          dueDate: dbDl.dueDate,
          title: dbDl.title,
          description: dbDl.description ?? undefined,
          assignedTo: dbDl.assignedTo ?? undefined,
          priority: dbDl.priority as DeadlinePriority,
        });

        if (deadlineResult.isSuccess) {
          deadlines.push(deadlineResult.value);
        }
      } catch (error) {
        console.error(`[DeadlineDomainService] Failed to convert deadline ${dbDl.id}:`, error);
      }
    }

    return deadlines;
  }
}

// Export singleton instance with default config
export const deadlineDomainService = new DeadlineDomainService();

// Export factory function for custom configurations
export function createDeadlineDomainService(config?: Partial<DeadlineEngineConfig>): DeadlineDomainService {
  return new DeadlineDomainService(config);
}
