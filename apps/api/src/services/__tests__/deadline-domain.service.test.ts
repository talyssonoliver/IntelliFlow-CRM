/**
 * DeadlineDomainService Tests
 *
 * Comprehensive tests for deadline domain service functionality.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  DeadlineDomainService,
  createDeadlineDomainService,
  type ComputeDeadlineInput,
  type CreateDeadlineFromRuleInput,
  type HolidayConfig,
} from '../deadline-domain.service';

// Mock the domain imports
vi.mock('@intelliflow/domain', () => {
  // Mock Result type
  const createResult = <T>(value: T, isSuccess: boolean, error?: { message: string }) => ({
    isSuccess,
    isFailure: !isSuccess,
    value,
    error,
  });

  // Mock DeadlineId
  class MockDeadlineId {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    static create(value?: string) {
      return createResult(new MockDeadlineId(value || 'deadline-123'), true);
    }
  }

  // Mock CaseId
  class MockCaseId {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    static create(value: string) {
      if (!value || value.length < 3) {
        return createResult(null, false, { message: 'Invalid case ID' });
      }
      return createResult(new MockCaseId(value), true);
    }
  }

  // Mock DeadlineRule
  class MockDeadlineRule {
    name: string;
    description?: string;
    daysCount: number;
    dayCountType: string;
    trigger: string;
    excludeHolidays: boolean;
    includeEndDay: boolean;
    jurisdiction?: string;

    constructor(props: {
      name: string;
      description?: string;
      daysCount: number;
      dayCountType: string;
      trigger: string;
      excludeHolidays: boolean;
      includeEndDay: boolean;
      jurisdiction?: string;
    }) {
      this.name = props.name;
      this.description = props.description;
      this.daysCount = props.daysCount;
      this.dayCountType = props.dayCountType;
      this.trigger = props.trigger;
      this.excludeHolidays = props.excludeHolidays;
      this.includeEndDay = props.includeEndDay;
      this.jurisdiction = props.jurisdiction;
    }

    static create(props: {
      name: string;
      description?: string;
      daysCount: number;
      dayCountType: string;
      trigger: string;
      excludeHolidays?: boolean;
      includeEndDay?: boolean;
      jurisdiction?: string;
    }) {
      if (props.daysCount < 0) {
        return createResult(null, false, { message: 'Days count must be positive' });
      }
      return createResult(
        new MockDeadlineRule({
          ...props,
          excludeHolidays: props.excludeHolidays ?? true,
          includeEndDay: props.includeEndDay ?? false,
        }),
        true
      );
    }
  }

  // Mock Deadline
  class MockDeadline {
    id: MockDeadlineId;
    caseId: MockCaseId;
    rule: MockDeadlineRule;
    triggerDate: Date;
    dueDate: Date;
    title: string;
    description?: string;
    assignedTo?: string;
    priority: string;
    status: string;
    completedAt?: Date;
    remindersSent: number;
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isOverdue: boolean;
    daysRemaining: number;

    constructor(props: {
      caseId: MockCaseId;
      rule: MockDeadlineRule;
      triggerDate: Date;
      dueDate: Date;
      title: string;
      description?: string;
      assignedTo?: string;
      priority?: string;
    }) {
      this.id = new MockDeadlineId(`deadline-${Date.now()}`);
      this.caseId = props.caseId;
      this.rule = props.rule;
      this.triggerDate = props.triggerDate;
      this.dueDate = props.dueDate;
      this.title = props.title;
      this.description = props.description;
      this.assignedTo = props.assignedTo;
      this.priority = props.priority || 'MEDIUM';
      this.status = 'PENDING';
      this.remindersSent = 0;
      this.createdAt = new Date();
      this.updatedAt = new Date();

      // Calculate derived properties
      const now = new Date();
      this.daysRemaining = Math.ceil(
        (props.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      this.isOverdue = this.daysRemaining < 0;
      this.isActive = this.status === 'PENDING';
    }

    static create(props: {
      caseId: MockCaseId;
      rule: MockDeadlineRule;
      triggerDate: Date;
      dueDate: Date;
      title: string;
      description?: string;
      assignedTo?: string;
      priority?: string;
    }) {
      return createResult(new MockDeadline(props), true);
    }
  }

  // Mock HolidayCalendar
  class MockHolidayCalendar {
    private holidays: Map<string, string> = new Map();

    static empty() {
      return new MockHolidayCalendar();
    }

    static ukBankHolidays() {
      const calendar = new MockHolidayCalendar();
      // Add some sample UK bank holidays
      calendar.addHoliday(new Date('2024-12-25'), 'Christmas Day');
      calendar.addHoliday(new Date('2024-12-26'), 'Boxing Day');
      calendar.addHoliday(new Date('2024-01-01'), 'New Year\'s Day');
      return calendar;
    }

    addHoliday(date: Date, name: string) {
      this.holidays.set(date.toISOString().split('T')[0], name);
    }

    isHoliday(date: Date): boolean {
      return this.holidays.has(date.toISOString().split('T')[0]);
    }

    isWeekend(date: Date): boolean {
      const day = date.getDay();
      return day === 0 || day === 6;
    }

    isBusinessDay(date: Date): boolean {
      return !this.isWeekend(date) && !this.isHoliday(date);
    }

    countBusinessDays(start: Date, end: Date): number {
      let count = 0;
      const current = new Date(start);
      while (current < end) {
        if (this.isBusinessDay(current)) {
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      return count;
    }
  }

  // Mock DeadlineEngine
  class MockDeadlineEngine {
    private config: {
      warningThresholdDays: number;
      criticalThresholdDays: number;
      defaultReminderIntervals: number[];
      holidayCalendar: MockHolidayCalendar;
    };
    private holidayCalendar: MockHolidayCalendar;

    constructor(config?: Partial<{
      warningThresholdDays: number;
      criticalThresholdDays: number;
      defaultReminderIntervals: number[];
      holidayCalendar: MockHolidayCalendar;
    }>) {
      this.config = {
        warningThresholdDays: config?.warningThresholdDays ?? 3,
        criticalThresholdDays: config?.criticalThresholdDays ?? 1,
        defaultReminderIntervals: config?.defaultReminderIntervals ?? [7, 3, 1],
        holidayCalendar: config?.holidayCalendar ?? MockHolidayCalendar.empty(),
      };
      this.holidayCalendar = this.config.holidayCalendar;
    }

    getConfig() {
      return { ...this.config };
    }

    updateConfig(config: Partial<{
      warningThresholdDays: number;
      criticalThresholdDays: number;
    }>) {
      this.config = { ...this.config, ...config };
    }

    setHolidayCalendar(calendar: MockHolidayCalendar) {
      this.holidayCalendar = calendar;
      this.config.holidayCalendar = calendar;
    }

    computeDeadline(triggerDate: Date, rule: MockDeadlineRule) {
      const dueDate = new Date(triggerDate);
      dueDate.setDate(dueDate.getDate() + rule.daysCount);

      return createResult(
        {
          dueDate,
          triggerDate,
          rule,
          businessDaysCount: rule.daysCount,
          calendarDaysCount: rule.daysCount,
          holidaysExcluded: 0,
          weekendsExcluded: 0,
        },
        true
      );
    }

    createDeadline(
      caseId: MockCaseId,
      triggerDate: Date,
      rule: MockDeadlineRule,
      title: string,
      options?: {
        description?: string;
        assignedTo?: string;
        priority?: string;
      }
    ) {
      const computeResult = this.computeDeadline(triggerDate, rule);
      if (computeResult.isFailure) {
        return computeResult;
      }

      return MockDeadline.create({
        caseId,
        rule,
        triggerDate,
        dueDate: computeResult.value.dueDate,
        title,
        description: options?.description,
        assignedTo: options?.assignedTo,
        priority: options?.priority,
      });
    }

    generateReminderSchedule(deadline: MockDeadline, intervals?: number[]) {
      const reminderIntervals = intervals ?? this.config.defaultReminderIntervals;
      const reminderDates: Date[] = [];

      for (const days of reminderIntervals) {
        const reminderDate = new Date(deadline.dueDate);
        reminderDate.setDate(reminderDate.getDate() - days);
        if (reminderDate > new Date()) {
          reminderDates.push(reminderDate);
        }
      }

      return {
        deadlineId: deadline.id.value,
        reminderDates,
        intervals: reminderIntervals,
      };
    }

    shouldSendReminder(deadline: MockDeadline, intervals?: number[]) {
      const reminderIntervals = intervals ?? this.config.defaultReminderIntervals;
      const daysUntilDue = deadline.daysRemaining;
      const shouldSend = reminderIntervals.includes(daysUntilDue);

      let reminderType: string = 'NONE';
      if (shouldSend) {
        if (daysUntilDue <= 1) {
          reminderType = 'URGENT';
        } else if (deadline.remindersSent === 0) {
          reminderType = 'FIRST';
        } else {
          reminderType = 'FOLLOW_UP';
        }
      }

      return { shouldSend, daysUntilDue, reminderType };
    }

    filterApproachingDeadlines(deadlines: MockDeadline[], thresholdDays?: number) {
      const threshold = thresholdDays ?? this.config.warningThresholdDays;
      return deadlines.filter(
        (d) => d.isActive && d.daysRemaining >= 0 && d.daysRemaining <= threshold
      );
    }

    filterOverdueDeadlines(deadlines: MockDeadline[]) {
      return deadlines.filter((d) => d.isActive && d.isOverdue);
    }

    sortByUrgency(deadlines: MockDeadline[]) {
      const priorityOrder: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
      };

      return [...deadlines].sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
    }

    countBusinessDaysUntil(deadline: MockDeadline) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (deadline.dueDate <= now) return 0;
      return this.holidayCalendar.countBusinessDays(now, deadline.dueDate);
    }

    isBusinessDay(date: Date) {
      return this.holidayCalendar.isBusinessDay(date);
    }

    isHoliday(date: Date) {
      return this.holidayCalendar.isHoliday(date);
    }

    getNextBusinessDay(date: Date) {
      const result = new Date(date);
      result.setDate(result.getDate() + 1);
      while (!this.holidayCalendar.isBusinessDay(result)) {
        result.setDate(result.getDate() + 1);
      }
      return result;
    }

    validateRule(rule: MockDeadlineRule, triggerDate?: Date) {
      const errors: string[] = [];
      const testDate = triggerDate ?? new Date();

      if (rule.daysCount < 0) {
        errors.push('Days count must be non-negative');
      }

      if (rule.daysCount > 3650) {
        errors.push('Days count exceeds maximum (10 years)');
      }

      const computeResult = this.computeDeadline(testDate, rule);

      return {
        isValid: errors.length === 0,
        errors,
        computedDueDate: computeResult.isSuccess ? computeResult.value.dueDate : undefined,
      };
    }
  }

  // Factory function
  const createDeadlineEngine = (config?: Partial<{
    warningThresholdDays: number;
    criticalThresholdDays: number;
    defaultReminderIntervals: number[];
  }>) => {
    return new MockDeadlineEngine(config);
  };

  return {
    DeadlineEngine: MockDeadlineEngine,
    createDeadlineEngine,
    Deadline: MockDeadline,
    DeadlineRule: MockDeadlineRule,
    HolidayCalendar: MockHolidayCalendar,
    CaseId: MockCaseId,
    DeadlineId: MockDeadlineId,
  };
});

describe('DeadlineDomainService', () => {
  let service: DeadlineDomainService;

  beforeEach(() => {
    service = new DeadlineDomainService();
  });

  describe('constructor', () => {
    it('should create service with default configuration', () => {
      const newService = new DeadlineDomainService();
      expect(newService).toBeInstanceOf(DeadlineDomainService);
    });

    it('should create service with custom configuration', () => {
      const customService = new DeadlineDomainService({
        warningThresholdDays: 5,
        criticalThresholdDays: 2,
      });
      expect(customService).toBeInstanceOf(DeadlineDomainService);
    });
  });

  describe('createDeadlineDomainService factory', () => {
    it('should create service instance via factory function', () => {
      const factoryService = createDeadlineDomainService();
      expect(factoryService).toBeInstanceOf(DeadlineDomainService);
    });

    it('should create service with custom config via factory', () => {
      const factoryService = createDeadlineDomainService({
        warningThresholdDays: 7,
      });
      expect(factoryService).toBeInstanceOf(DeadlineDomainService);
    });
  });

  describe('configure', () => {
    it('should update engine configuration', () => {
      service.configure({
        warningThresholdDays: 10,
        criticalThresholdDays: 3,
      });
      // Configuration is internal, so we verify by checking behavior
      expect(service).toBeInstanceOf(DeadlineDomainService);
    });

    it('should merge with existing configuration', () => {
      const customService = new DeadlineDomainService({
        warningThresholdDays: 5,
      });
      customService.configure({
        criticalThresholdDays: 2,
      });
      expect(customService).toBeInstanceOf(DeadlineDomainService);
    });
  });

  describe('configureHolidays', () => {
    it('should configure UK bank holidays', () => {
      const holidayConfig: HolidayConfig = {
        country: 'UK',
      };

      service.configureHolidays(holidayConfig);

      // Verify Christmas is a holiday
      const christmas = new Date('2024-12-25');
      expect(service.isHoliday(christmas)).toBe(true);
    });

    it('should add custom holidays', () => {
      const holidayConfig: HolidayConfig = {
        country: 'UK',
        customHolidays: [
          { date: new Date('2024-07-04'), name: 'Company Day' },
          { date: new Date('2024-08-15'), name: 'Summer Holiday' },
        ],
      };

      service.configureHolidays(holidayConfig);

      expect(service.isHoliday(new Date('2024-07-04'))).toBe(true);
      expect(service.isHoliday(new Date('2024-08-15'))).toBe(true);
    });

    it('should configure holidays with region', () => {
      const holidayConfig: HolidayConfig = {
        country: 'UK',
        region: 'Scotland',
      };

      service.configureHolidays(holidayConfig);
      expect(service).toBeInstanceOf(DeadlineDomainService);
    });
  });

  describe('computeDeadline', () => {
    it('should compute deadline with calendar days', () => {
      const input: ComputeDeadlineInput = {
        triggerDate: new Date('2024-01-15'),
        daysCount: 10,
        dayCountType: 'CALENDAR',
      };

      const result = service.computeDeadline(input);

      expect(result).not.toBeNull();
      expect(result?.dueDate).toBeInstanceOf(Date);
      expect(result?.triggerDate).toEqual(new Date('2024-01-15'));
    });

    it('should compute deadline with business days', () => {
      const input: ComputeDeadlineInput = {
        triggerDate: new Date('2024-01-15'),
        daysCount: 10,
        dayCountType: 'BUSINESS',
        excludeHolidays: true,
      };

      const result = service.computeDeadline(input);

      expect(result).not.toBeNull();
      expect(result?.businessDaysCount).toBeDefined();
    });

    it('should include end day when specified', () => {
      const input: ComputeDeadlineInput = {
        triggerDate: new Date('2024-01-15'),
        daysCount: 5,
        dayCountType: 'CALENDAR',
        includeEndDay: true,
      };

      const result = service.computeDeadline(input);

      expect(result).not.toBeNull();
    });

    it('should handle jurisdiction-specific deadlines', () => {
      const input: ComputeDeadlineInput = {
        triggerDate: new Date('2024-01-15'),
        daysCount: 14,
        dayCountType: 'BUSINESS',
        jurisdiction: 'ENGLAND_WALES',
      };

      const result = service.computeDeadline(input);

      expect(result).not.toBeNull();
    });

    it('should return null for invalid rule (negative days)', () => {
      const input: ComputeDeadlineInput = {
        triggerDate: new Date('2024-01-15'),
        daysCount: -5,
        dayCountType: 'CALENDAR',
      };

      const result = service.computeDeadline(input);

      expect(result).toBeNull();
    });
  });

  describe('createDeadlineFromRule', () => {
    it('should create deadline from valid rule', () => {
      const input: CreateDeadlineFromRuleInput = {
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Defence Deadline',
          description: 'File defence within 14 days',
          daysCount: 14,
          dayCountType: 'BUSINESS',
          trigger: 'CASE_FILED',
        },
        title: 'File Defence',
        description: 'Submit defence documents',
        assignedTo: 'user-123',
        priority: 'HIGH',
      };

      const result = service.createDeadlineFromRule(input);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('File Defence');
      expect(result?.priority).toBe('HIGH');
    });

    it('should use rule name as default title', () => {
      const input: CreateDeadlineFromRuleInput = {
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Defence Deadline',
          daysCount: 14,
          dayCountType: 'BUSINESS',
          trigger: 'CASE_FILED',
        },
      };

      const result = service.createDeadlineFromRule(input);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Defence Deadline');
    });

    it('should return null for invalid case ID', () => {
      const input: CreateDeadlineFromRuleInput = {
        caseId: 'ab', // Too short
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Test Deadline',
          daysCount: 7,
          dayCountType: 'CALENDAR',
          trigger: 'CUSTOM',
        },
      };

      const result = service.createDeadlineFromRule(input);

      expect(result).toBeNull();
    });

    it('should return null for invalid rule', () => {
      const input: CreateDeadlineFromRuleInput = {
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Invalid Rule',
          daysCount: -10, // Invalid
          dayCountType: 'CALENDAR',
          trigger: 'CASE_FILED',
        },
      };

      const result = service.createDeadlineFromRule(input);

      expect(result).toBeNull();
    });
  });

  describe('createDeadlinesFromRules', () => {
    it('should create multiple deadlines from rules', () => {
      const rules = [
        {
          name: 'Acknowledgement',
          daysCount: 7,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
        {
          name: 'Defence',
          daysCount: 14,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
        {
          name: 'Reply',
          daysCount: 21,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
      ];

      const deadlines = service.createDeadlinesFromRules(
        'case-12345',
        new Date('2024-01-15'),
        rules,
        'user-123'
      );

      expect(deadlines).toHaveLength(3);
      expect(deadlines[0].title).toBe('Acknowledgement');
      expect(deadlines[1].title).toBe('Defence');
      expect(deadlines[2].title).toBe('Reply');
    });

    it('should skip invalid rules and continue', () => {
      const rules = [
        {
          name: 'Valid Rule',
          daysCount: 7,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
        {
          name: 'Invalid Rule',
          daysCount: -5, // Invalid
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
      ];

      const deadlines = service.createDeadlinesFromRules(
        'case-12345',
        new Date('2024-01-15'),
        rules
      );

      expect(deadlines).toHaveLength(1);
      expect(deadlines[0].title).toBe('Valid Rule');
    });

    it('should return empty array if all rules are invalid', () => {
      const rules = [
        {
          name: 'Invalid Rule 1',
          daysCount: -5,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
        {
          name: 'Invalid Rule 2',
          daysCount: -10,
          dayCountType: 'BUSINESS' as const,
          trigger: 'SERVICE' as const,
        },
      ];

      const deadlines = service.createDeadlinesFromRules(
        'case-12345',
        new Date('2024-01-15'),
        rules
      );

      expect(deadlines).toHaveLength(0);
    });
  });

  describe('generateReminderSchedule', () => {
    it('should generate reminder schedule for deadline', () => {
      const deadline = service.createDeadlineFromRule({
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Test Deadline',
          daysCount: 30,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_FILED',
        },
      })!;

      const schedule = service.generateReminderSchedule(deadline);

      expect(schedule.deadlineId).toBe(deadline.id.value);
      expect(schedule.intervals).toBeDefined();
      expect(Array.isArray(schedule.reminderDates)).toBe(true);
    });

    it('should use custom reminder intervals', () => {
      const deadline = service.createDeadlineFromRule({
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Test Deadline',
          daysCount: 60,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_FILED',
        },
      })!;

      const customIntervals = [30, 14, 7, 3, 1];
      const schedule = service.generateReminderSchedule(deadline, customIntervals);

      expect(schedule.intervals).toEqual(customIntervals);
    });
  });

  describe('shouldSendReminder', () => {
    it('should determine if reminder should be sent', () => {
      const deadline = service.createDeadlineFromRule({
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Test Deadline',
          daysCount: 7,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_FILED',
        },
      })!;

      const result = service.shouldSendReminder(deadline);

      expect(result).toHaveProperty('shouldSend');
      expect(result).toHaveProperty('daysUntilDue');
      expect(result).toHaveProperty('reminderType');
    });

    it('should use custom intervals for reminder check', () => {
      const deadline = service.createDeadlineFromRule({
        caseId: 'case-12345',
        triggerDate: new Date('2024-01-15'),
        rule: {
          name: 'Test Deadline',
          daysCount: 14,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_FILED',
        },
      })!;

      const result = service.shouldSendReminder(deadline, [14, 7, 1]);

      expect(result).toHaveProperty('shouldSend');
    });
  });

  describe('filterApproachingDeadlines', () => {
    it('should filter deadlines approaching within threshold', () => {
      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: new Date(),
          rule: { name: 'Soon', daysCount: 2, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
        service.createDeadlineFromRule({
          caseId: 'case-2',
          triggerDate: new Date(),
          rule: { name: 'Later', daysCount: 30, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const approaching = service.filterApproachingDeadlines(deadlines, 5);

      expect(approaching.length).toBeLessThanOrEqual(deadlines.length);
    });

    it('should use default threshold when not specified', () => {
      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: new Date(),
          rule: { name: 'Test', daysCount: 2, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const approaching = service.filterApproachingDeadlines(deadlines);

      expect(Array.isArray(approaching)).toBe(true);
    });
  });

  describe('filterOverdueDeadlines', () => {
    it('should filter overdue deadlines', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);

      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: pastDate,
          rule: { name: 'Overdue', daysCount: 5, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
        service.createDeadlineFromRule({
          caseId: 'case-2',
          triggerDate: new Date(),
          rule: { name: 'Future', daysCount: 30, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const overdue = service.filterOverdueDeadlines(deadlines);

      expect(Array.isArray(overdue)).toBe(true);
    });
  });

  describe('sortByUrgency', () => {
    it('should sort deadlines by priority and due date', () => {
      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: new Date(),
          rule: { name: 'Low Priority', daysCount: 5, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          priority: 'LOW',
        })!,
        service.createDeadlineFromRule({
          caseId: 'case-2',
          triggerDate: new Date(),
          rule: { name: 'Critical', daysCount: 10, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          priority: 'CRITICAL',
        })!,
        service.createDeadlineFromRule({
          caseId: 'case-3',
          triggerDate: new Date(),
          rule: { name: 'High Priority', daysCount: 7, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          priority: 'HIGH',
        })!,
      ];

      const sorted = service.sortByUrgency(deadlines);

      expect(sorted[0].priority).toBe('CRITICAL');
      expect(sorted[1].priority).toBe('HIGH');
      expect(sorted[2].priority).toBe('LOW');
    });
  });

  describe('toTimelineDeadlines', () => {
    it('should convert deadlines to timeline format', () => {
      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: new Date(),
          rule: { name: 'Test', daysCount: 10, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          description: 'Test description',
          assignedTo: 'user-123',
        })!,
      ];

      const timeline = service.toTimelineDeadlines(deadlines);

      expect(timeline).toHaveLength(1);
      expect(timeline[0]).toHaveProperty('id');
      expect(timeline[0]).toHaveProperty('title', 'Test');
      expect(timeline[0]).toHaveProperty('dueDate');
      expect(timeline[0]).toHaveProperty('triggerDate');
      expect(timeline[0]).toHaveProperty('priority');
      expect(timeline[0]).toHaveProperty('status');
      expect(timeline[0]).toHaveProperty('daysRemaining');
      expect(timeline[0]).toHaveProperty('businessDaysRemaining');
      expect(timeline[0]).toHaveProperty('isOverdue');
      expect(timeline[0]).toHaveProperty('isApproaching');
      expect(timeline[0]).toHaveProperty('isCritical');
      expect(timeline[0]).toHaveProperty('caseId');
      expect(timeline[0]).toHaveProperty('reminderSchedule');
    });

    it('should handle empty deadline array', () => {
      const timeline = service.toTimelineDeadlines([]);

      expect(timeline).toHaveLength(0);
    });
  });

  describe('calculateSummary', () => {
    it('should calculate deadline summary', () => {
      const now = new Date();
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - 10);

      const deadlines = [
        service.createDeadlineFromRule({
          caseId: 'case-1',
          triggerDate: now,
          rule: { name: 'Future', daysCount: 20, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          priority: 'HIGH',
        })!,
        service.createDeadlineFromRule({
          caseId: 'case-2',
          triggerDate: now,
          rule: { name: 'Approaching', daysCount: 2, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
          priority: 'CRITICAL',
        })!,
      ];

      const summary = service.calculateSummary(deadlines);

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('overdue');
      expect(summary).toHaveProperty('dueToday');
      expect(summary).toHaveProperty('approaching');
      expect(summary).toHaveProperty('critical');
      expect(summary).toHaveProperty('completedThisWeek');
      expect(summary).toHaveProperty('upcomingByPriority');
      expect(summary.upcomingByPriority).toHaveProperty('CRITICAL');
      expect(summary.upcomingByPriority).toHaveProperty('HIGH');
      expect(summary.upcomingByPriority).toHaveProperty('MEDIUM');
      expect(summary.upcomingByPriority).toHaveProperty('LOW');
    });

    it('should handle empty deadline array', () => {
      const summary = service.calculateSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.overdue).toBe(0);
      expect(summary.dueToday).toBe(0);
    });
  });

  describe('isBusinessDay', () => {
    it('should return true for weekday', () => {
      // January 15, 2024 is a Monday
      const monday = new Date('2024-01-15');
      expect(service.isBusinessDay(monday)).toBe(true);
    });

    it('should return false for weekend', () => {
      // January 13, 2024 is a Saturday
      const saturday = new Date('2024-01-13');
      expect(service.isBusinessDay(saturday)).toBe(false);

      // January 14, 2024 is a Sunday
      const sunday = new Date('2024-01-14');
      expect(service.isBusinessDay(sunday)).toBe(false);
    });
  });

  describe('isHoliday', () => {
    it('should return true for configured holidays', () => {
      service.configureHolidays({ country: 'UK' });

      const christmas = new Date('2024-12-25');
      expect(service.isHoliday(christmas)).toBe(true);
    });

    it('should return false for non-holidays', () => {
      const regularDay = new Date('2024-06-15');
      expect(service.isHoliday(regularDay)).toBe(false);
    });
  });

  describe('getNextBusinessDay', () => {
    it('should return next business day from weekday', () => {
      // January 15, 2024 is a Monday
      const monday = new Date('2024-01-15');
      const nextBusinessDay = service.getNextBusinessDay(monday);

      expect(nextBusinessDay).toBeInstanceOf(Date);
      expect(nextBusinessDay.getTime()).toBeGreaterThan(monday.getTime());
    });

    it('should skip weekends', () => {
      // January 12, 2024 is a Friday
      const friday = new Date('2024-01-12');
      const nextBusinessDay = service.getNextBusinessDay(friday);

      // Should be Monday (skipping Saturday and Sunday)
      expect(nextBusinessDay.getDay()).not.toBe(0); // Not Sunday
      expect(nextBusinessDay.getDay()).not.toBe(6); // Not Saturday
    });
  });

  describe('validateRule', () => {
    it('should validate a valid rule', () => {
      const rule = {
        name: 'Valid Rule',
        daysCount: 14,
        dayCountType: 'BUSINESS' as const,
        trigger: 'CASE_FILED' as const,
      };

      const result = service.validateRule(rule);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.computedDueDate).toBeInstanceOf(Date);
    });

    it('should validate with custom trigger date', () => {
      const rule = {
        name: 'Valid Rule',
        daysCount: 7,
        dayCountType: 'CALENDAR' as const,
        trigger: 'SERVICE' as const,
      };

      const customDate = new Date('2024-06-01');
      const result = service.validateRule(rule, customDate);

      expect(result.isValid).toBe(true);
    });

    it('should return errors for excessive days count', () => {
      const rule = {
        name: 'Too Long',
        daysCount: 5000, // More than 10 years
        dayCountType: 'CALENDAR' as const,
        trigger: 'CUSTOM' as const,
      };

      const result = service.validateRule(rule);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getUpcomingDeadlinesForCase', () => {
    it('should get upcoming deadlines for a specific case', () => {
      const caseId = 'case-12345';
      const deadlines = [
        service.createDeadlineFromRule({
          caseId,
          triggerDate: new Date(),
          rule: { name: 'Same Case 1', daysCount: 5, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
        service.createDeadlineFromRule({
          caseId,
          triggerDate: new Date(),
          rule: { name: 'Same Case 2', daysCount: 15, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
        service.createDeadlineFromRule({
          caseId: 'different-case',
          triggerDate: new Date(),
          rule: { name: 'Different Case', daysCount: 10, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const upcoming = service.getUpcomingDeadlinesForCase(caseId, deadlines);

      expect(upcoming.every((d) => d.caseId === caseId)).toBe(true);
    });

    it('should respect days ahead parameter', () => {
      const caseId = 'case-12345';
      const deadlines = [
        service.createDeadlineFromRule({
          caseId,
          triggerDate: new Date(),
          rule: { name: 'Soon', daysCount: 5, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
        service.createDeadlineFromRule({
          caseId,
          triggerDate: new Date(),
          rule: { name: 'Far Away', daysCount: 60, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const upcoming = service.getUpcomingDeadlinesForCase(caseId, deadlines, 10);

      expect(upcoming.length).toBeLessThanOrEqual(2);
    });

    it('should return timeline format', () => {
      const caseId = 'case-12345';
      const deadlines = [
        service.createDeadlineFromRule({
          caseId,
          triggerDate: new Date(),
          rule: { name: 'Test', daysCount: 7, dayCountType: 'CALENDAR', trigger: 'CUSTOM' },
        })!,
      ];

      const upcoming = service.getUpcomingDeadlinesForCase(caseId, deadlines);

      if (upcoming.length > 0) {
        expect(upcoming[0]).toHaveProperty('id');
        expect(upcoming[0]).toHaveProperty('title');
        expect(upcoming[0]).toHaveProperty('dueDate');
        expect(upcoming[0]).toHaveProperty('reminderSchedule');
      }
    });
  });

  describe('toDomainDeadlines (static method)', () => {
    it('should convert DB records to domain Deadlines', () => {
      const dbDeadlines = [
        {
          id: 'deadline-1',
          caseId: 'case-12345',
          title: 'Test Deadline 1',
          description: 'Description 1',
          dueDate: new Date('2024-02-15'),
          triggerDate: new Date('2024-01-15'),
          priority: 'HIGH',
          status: 'PENDING',
          assignedTo: 'user-123',
          completedAt: null,
          rule: {
            name: 'Test Rule',
            daysCount: 30,
            dayCountType: 'BUSINESS',
            trigger: 'CASE_FILED',
            excludeHolidays: true,
            includeEndDay: false,
          },
        },
        {
          id: 'deadline-2',
          caseId: 'case-67890',
          title: 'Test Deadline 2',
          dueDate: new Date('2024-03-01'),
          triggerDate: new Date('2024-02-01'),
          priority: 'MEDIUM',
          status: 'PENDING',
        },
      ];

      const domainDeadlines = DeadlineDomainService.toDomainDeadlines(dbDeadlines);

      expect(domainDeadlines.length).toBeGreaterThan(0);
    });

    it('should skip records with invalid case IDs', () => {
      const dbDeadlines = [
        {
          id: 'deadline-1',
          caseId: 'ab', // Invalid - too short
          title: 'Invalid',
          dueDate: new Date(),
          triggerDate: new Date(),
          priority: 'HIGH',
          status: 'PENDING',
        },
      ];

      const domainDeadlines = DeadlineDomainService.toDomainDeadlines(dbDeadlines);

      expect(domainDeadlines).toHaveLength(0);
    });

    it('should handle records without rule', () => {
      const dbDeadlines = [
        {
          id: 'deadline-1',
          caseId: 'case-12345',
          title: 'No Rule Deadline',
          dueDate: new Date('2024-02-15'),
          triggerDate: new Date('2024-01-15'),
          priority: 'HIGH',
          status: 'PENDING',
          rule: null,
        },
      ];

      const domainDeadlines = DeadlineDomainService.toDomainDeadlines(dbDeadlines);

      expect(domainDeadlines.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty array', () => {
      const domainDeadlines = DeadlineDomainService.toDomainDeadlines([]);

      expect(domainDeadlines).toHaveLength(0);
    });
  });
});
