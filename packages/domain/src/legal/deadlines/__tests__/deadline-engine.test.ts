import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DeadlineEngine,
  DeadlineCalculationError,
  createDeadlineEngine,
  defaultDeadlineEngine,
} from '../deadline-engine';
import { DeadlineRule } from '../DeadlineRule';
import { HolidayCalendar } from '../HolidayCalendar';
import { Deadline } from '../Deadline';
import { CaseId } from '../../cases/CaseId';

describe('DeadlineEngine', () => {
  let engine: DeadlineEngine;
  let calendar: HolidayCalendar;

  beforeEach(() => {
    calendar = HolidayCalendar.empty('Test Calendar');
    engine = new DeadlineEngine({ holidayCalendar: calendar });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const defaultEngine = new DeadlineEngine();
      const config = defaultEngine.getConfig();

      expect(config.defaultReminderIntervals).toEqual([7, 3, 1]);
      expect(config.warningThresholdDays).toBe(3);
      expect(config.criticalThresholdDays).toBe(1);
    });

    it('should create with custom configuration', () => {
      const customEngine = new DeadlineEngine({
        defaultReminderIntervals: [14, 7, 3, 1],
        warningThresholdDays: 5,
        criticalThresholdDays: 2,
      });
      const config = customEngine.getConfig();

      expect(config.defaultReminderIntervals).toEqual([14, 7, 3, 1]);
      expect(config.warningThresholdDays).toBe(5);
      expect(config.criticalThresholdDays).toBe(2);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of configuration', () => {
      const config = engine.getConfig();

      expect(config.holidayCalendar).toBe(calendar);
      expect(config.defaultReminderIntervals).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      engine.updateConfig({ warningThresholdDays: 7 });

      const config = engine.getConfig();
      expect(config.warningThresholdDays).toBe(7);
    });

    it('should preserve existing config when partially updating', () => {
      const originalConfig = engine.getConfig();
      engine.updateConfig({ warningThresholdDays: 10 });

      const newConfig = engine.getConfig();
      expect(newConfig.criticalThresholdDays).toBe(originalConfig.criticalThresholdDays);
    });
  });

  describe('setHolidayCalendar', () => {
    it('should set holiday calendar', () => {
      const newCalendar = HolidayCalendar.usFederalHolidays();
      engine.setHolidayCalendar(newCalendar);

      const config = engine.getConfig();
      expect(config.holidayCalendar).toBe(newCalendar);
    });
  });

  describe('computeDeadline', () => {
    describe('calendar days', () => {
      it('should compute deadline for calendar days', () => {
        const rule = DeadlineRule.calendarDays('Test', 21, 'DOCUMENT_RECEIVED');
        const triggerDate = new Date(2025, 0, 1); // Jan 1, 2025

        const result = engine.computeDeadline(triggerDate, rule);

        expect(result.isSuccess).toBe(true);
        expect(result.value.dueDate.getDate()).toBe(22); // Jan 22
        expect(result.value.calendarDaysCount).toBe(21);
      });

      it('should exclude holidays when configured', () => {
        calendar.addHoliday(new Date(2025, 0, 15), 'Holiday');
        const rule = DeadlineRule.create({
          name: 'Test',
          daysCount: 21,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_OPENED',
          excludeHolidays: true,
        }).value;
        const triggerDate = new Date(2025, 0, 1);

        const result = engine.computeDeadline(triggerDate, rule);

        expect(result.isSuccess).toBe(true);
        expect(result.value.holidaysExcluded).toBe(1);
        // Due date should be pushed out by 1 day
        expect(result.value.dueDate.getDate()).toBe(23);
      });
    });

    describe('business days', () => {
      it('should compute deadline for business days (skip weekends)', () => {
        const rule = DeadlineRule.businessDays('Test', 5, 'CASE_OPENED');
        // Jan 6, 2025 is Monday
        const triggerDate = new Date(2025, 0, 6);

        const result = engine.computeDeadline(triggerDate, rule);

        expect(result.isSuccess).toBe(true);
        // 5 business days from Monday = next Monday (Jan 13)
        expect(result.value.dueDate.getDate()).toBe(13);
        expect(result.value.weekendsExcluded).toBeGreaterThan(0);
      });

      it('should exclude both weekends and holidays for business days', () => {
        calendar.addHoliday(new Date(2025, 0, 8), 'Holiday'); // Wed
        const rule = DeadlineRule.businessDays('Test', 5, 'CASE_OPENED');
        // Jan 6, 2025 is Monday
        const triggerDate = new Date(2025, 0, 6);

        const result = engine.computeDeadline(triggerDate, rule);

        expect(result.isSuccess).toBe(true);
        expect(result.value.holidaysExcluded).toBe(1);
        // Should be pushed out by holiday
        expect(result.value.dueDate.getDate()).toBe(14);
      });
    });

    describe('includeEndDay', () => {
      it('should add extra day when includeEndDay is false', () => {
        const ruleWithEndDay = DeadlineRule.create({
          name: 'Include End',
          daysCount: 10,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_OPENED',
          includeEndDay: true,
        }).value;

        const ruleWithoutEndDay = DeadlineRule.create({
          name: 'Exclude End',
          daysCount: 10,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_OPENED',
          includeEndDay: false,
        }).value;

        const triggerDate = new Date(2025, 0, 1);

        const resultWith = engine.computeDeadline(triggerDate, ruleWithEndDay);
        const resultWithout = engine.computeDeadline(triggerDate, ruleWithoutEndDay);

        expect(resultWithout.value.dueDate.getDate()).toBe(
          resultWith.value.dueDate.getDate() + 1
        );
      });
    });

    it('should return triggerDate and rule in result', () => {
      const rule = DeadlineRule.calendarDays('Test', 14, 'MOTION_FILED');
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.computeDeadline(triggerDate, rule);

      expect(result.value.triggerDate).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
      expect(result.value.rule).toBe(rule);
    });

    it('should count both business and calendar days', () => {
      const rule = DeadlineRule.calendarDays('Test', 14, 'CASE_OPENED');
      const triggerDate = new Date(2025, 0, 6); // Monday

      const result = engine.computeDeadline(triggerDate, rule);

      expect(result.value.calendarDaysCount).toBe(14);
      expect(result.value.businessDaysCount).toBeLessThan(14); // Due to weekends
    });
  });

  describe('createDeadline', () => {
    it('should create a Deadline entity', () => {
      const caseId = CaseId.generate();
      const rule = DeadlineRule.usFederalResponseToComplaint();
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.createDeadline(caseId, triggerDate, rule, 'Response to Complaint');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Deadline);
      expect(result.value.title).toBe('Response to Complaint');
      expect(result.value.caseId).toBe(caseId);
    });

    it('should set optional properties', () => {
      const caseId = CaseId.generate();
      const rule = DeadlineRule.usFederalResponseToComplaint();
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.createDeadline(caseId, triggerDate, rule, 'Response', {
        description: 'Important deadline',
        assignedTo: 'user-123',
        priority: 'HIGH',
      });

      expect(result.value.description).toBe('Important deadline');
      expect(result.value.assignedTo).toBe('user-123');
      expect(result.value.priority).toBe('HIGH');
    });
  });

  describe('createDeadlinesFromRules', () => {
    it('should create multiple deadlines from rules', () => {
      const caseId = CaseId.generate();
      const rules = [
        DeadlineRule.usFederalResponseToComplaint(),
        DeadlineRule.usFederalDiscoveryResponse(),
        DeadlineRule.usFederalMotionResponse(),
      ];
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.createDeadlinesFromRules(caseId, triggerDate, rules);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(3);
      expect(result.value[0].title).toBe('Response to Complaint');
      expect(result.value[1].title).toBe('Discovery Response');
      expect(result.value[2].title).toBe('Motion Response');
    });

    it('should assign all deadlines to the same user', () => {
      const caseId = CaseId.generate();
      const rules = [
        DeadlineRule.usFederalResponseToComplaint(),
        DeadlineRule.usFederalMotionResponse(),
      ];
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.createDeadlinesFromRules(
        caseId,
        triggerDate,
        rules,
        'attorney-123'
      );

      expect(result.value[0].assignedTo).toBe('attorney-123');
      expect(result.value[1].assignedTo).toBe('attorney-123');
    });

    it('should return empty array for empty rules', () => {
      const caseId = CaseId.generate();
      const triggerDate = new Date(2025, 0, 1);

      const result = engine.createDeadlinesFromRules(caseId, triggerDate, []);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });
  });

  describe('generateReminderSchedule', () => {
    it('should generate reminder schedule for deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      const schedule = engine.generateReminderSchedule(deadline);

      expect(schedule.deadlineId).toBe(deadline.id.value);
      expect(schedule.reminderDates.length).toBeGreaterThan(0);
      expect(schedule.intervals.length).toBe(schedule.reminderDates.length);
    });

    it('should use custom reminder intervals', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      const schedule = engine.generateReminderSchedule(deadline, [14, 7, 3, 1]);

      expect(schedule.intervals).toContain(14);
      expect(schedule.intervals).toContain(7);
    });

    it('should only include future reminders', () => {
      const now = new Date(2025, 0, 20);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      const schedule = engine.generateReminderSchedule(deadline, [7, 3, 1]);

      // Only 1-day reminder should be in future (22 - 20 = 2 days remaining)
      for (const reminderDate of schedule.reminderDates) {
        expect(reminderDate > now).toBe(true);
      }
    });
  });

  describe('shouldSendReminder', () => {
    it('should return true when days remaining matches interval', () => {
      const now = new Date(2025, 0, 15);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22), // 7 days remaining
        title: 'Test',
      }).value;

      const result = engine.shouldSendReminder(deadline, [7, 3, 1]);

      expect(result.shouldSend).toBe(true);
      expect(result.daysUntilDue).toBe(7);
    });

    it('should return false when days remaining does not match', () => {
      const now = new Date(2025, 0, 14);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22), // 8 days remaining
        title: 'Test',
      }).value;

      const result = engine.shouldSendReminder(deadline, [7, 3, 1]);

      expect(result.shouldSend).toBe(false);
    });

    it('should return URGENT type for 1 day or less', () => {
      const now = new Date(2025, 0, 21);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22), // 1 day remaining
        title: 'Test',
      }).value;

      const result = engine.shouldSendReminder(deadline, [7, 3, 1]);

      expect(result.reminderType).toBe('URGENT');
    });

    it('should return FIRST type for first reminder', () => {
      const now = new Date(2025, 0, 15);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      const result = engine.shouldSendReminder(deadline, [7, 3, 1]);

      expect(result.reminderType).toBe('FIRST');
    });

    it('should return FOLLOW_UP type for subsequent reminders', () => {
      const now = new Date(2025, 0, 15);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      deadline.recordReminderSent(); // Simulate first reminder sent

      const result = engine.shouldSendReminder(deadline, [7, 3, 1]);

      expect(result.reminderType).toBe('FOLLOW_UP');
    });

    it('should return NONE for inactive deadline', () => {
      const now = new Date(2025, 0, 15);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22),
        title: 'Test',
      }).value;

      deadline.complete('user-123');

      const result = engine.shouldSendReminder(deadline);

      expect(result.shouldSend).toBe(false);
      expect(result.reminderType).toBe('NONE');
    });
  });

  describe('filterApproachingDeadlines', () => {
    it('should filter deadlines within threshold', () => {
      const now = new Date(2025, 0, 10);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadlines = [
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 12), // 2 days - approaching
          title: 'Approaching',
        }).value,
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 25), // 15 days - not approaching
          title: 'Far',
        }).value,
      ];

      const approaching = engine.filterApproachingDeadlines(deadlines, 3);

      expect(approaching).toHaveLength(1);
      expect(approaching[0].title).toBe('Approaching');
    });

    it('should exclude inactive deadlines', () => {
      const now = new Date(2025, 0, 10);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const completedDeadline = Deadline.create({
        caseId,
        rule: DeadlineRule.usFederalResponseToComplaint(),
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 12),
        title: 'Completed',
      }).value;
      completedDeadline.complete('user');

      const approaching = engine.filterApproachingDeadlines([completedDeadline]);

      expect(approaching).toHaveLength(0);
    });
  });

  describe('filterOverdueDeadlines', () => {
    it('should filter overdue deadlines', () => {
      const now = new Date(2025, 0, 25);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadlines = [
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 20), // Overdue
          title: 'Overdue',
        }).value,
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 30), // Not overdue
          title: 'On Time',
        }).value,
      ];

      const overdue = engine.filterOverdueDeadlines(deadlines);

      expect(overdue).toHaveLength(1);
      expect(overdue[0].title).toBe('Overdue');
    });
  });

  describe('sortByUrgency', () => {
    it('should sort by priority then due date', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadlines = [
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: now,
          dueDate: new Date(2025, 0, 30),
          title: 'Low Priority',
          priority: 'LOW',
        }).value,
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: now,
          dueDate: new Date(2025, 0, 5),
          title: 'Critical Priority',
          priority: 'CRITICAL',
        }).value,
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: now,
          dueDate: new Date(2025, 0, 10),
          title: 'High Priority',
          priority: 'HIGH',
        }).value,
      ];

      const sorted = engine.sortByUrgency(deadlines);

      expect(sorted[0].priority).toBe('CRITICAL');
      expect(sorted[1].priority).toBe('HIGH');
      expect(sorted[2].priority).toBe('LOW');
    });

    it('should sort by due date within same priority', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const caseId = CaseId.generate();
      const deadlines = [
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: now,
          dueDate: new Date(2025, 0, 15),
          title: 'Later',
          priority: 'HIGH',
        }).value,
        Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: now,
          dueDate: new Date(2025, 0, 5),
          title: 'Earlier',
          priority: 'HIGH',
        }).value,
      ];

      const sorted = engine.sortByUrgency(deadlines);

      expect(sorted[0].title).toBe('Earlier');
      expect(sorted[1].title).toBe('Later');
    });
  });

  describe('helper methods', () => {
    describe('isBusinessDay', () => {
      it('should return true for weekday non-holiday', () => {
        const monday = new Date(2025, 0, 6);

        expect(engine.isBusinessDay(monday)).toBe(true);
      });

      it('should return false for weekend', () => {
        const saturday = new Date(2025, 0, 4);

        expect(engine.isBusinessDay(saturday)).toBe(false);
      });

      it('should return false for holiday', () => {
        calendar.addHoliday(new Date(2025, 0, 6), 'Holiday');
        const holiday = new Date(2025, 0, 6);

        expect(engine.isBusinessDay(holiday)).toBe(false);
      });
    });

    describe('isHoliday', () => {
      it('should delegate to holiday calendar', () => {
        calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");

        expect(engine.isHoliday(new Date(2025, 0, 1))).toBe(true);
        expect(engine.isHoliday(new Date(2025, 0, 2))).toBe(false);
      });
    });

    describe('isWeekend', () => {
      it('should delegate to holiday calendar', () => {
        expect(engine.isWeekend(new Date(2025, 0, 4))).toBe(true); // Saturday
        expect(engine.isWeekend(new Date(2025, 0, 6))).toBe(false); // Monday
      });
    });

    describe('getNextBusinessDay', () => {
      it('should return next business day from weekday', () => {
        const monday = new Date(2025, 0, 6);

        const next = engine.getNextBusinessDay(monday);

        expect(next.getDate()).toBe(7); // Tuesday
      });

      it('should skip weekend', () => {
        const friday = new Date(2025, 0, 3);

        const next = engine.getNextBusinessDay(friday);

        expect(next.getDate()).toBe(6); // Monday
      });

      it('should skip holidays', () => {
        calendar.addHoliday(new Date(2025, 0, 7), 'Holiday');
        const monday = new Date(2025, 0, 6);

        const next = engine.getNextBusinessDay(monday);

        expect(next.getDate()).toBe(8); // Wednesday
      });
    });

    describe('countBusinessDaysUntil', () => {
      it('should count business days until deadline', () => {
        const now = new Date(2025, 0, 6); // Monday
        vi.setSystemTime(now);

        const caseId = CaseId.generate();
        const deadline = Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 10), // Friday
          title: 'Test',
        }).value;

        const count = engine.countBusinessDaysUntil(deadline);

        expect(count).toBe(5); // Mon-Fri
      });

      it('should return 0 for past deadline', () => {
        const now = new Date(2025, 0, 15);
        vi.setSystemTime(now);

        const caseId = CaseId.generate();
        const deadline = Deadline.create({
          caseId,
          rule: DeadlineRule.usFederalResponseToComplaint(),
          triggerDate: new Date(2025, 0, 1),
          dueDate: new Date(2025, 0, 10),
          title: 'Test',
        }).value;

        const count = engine.countBusinessDaysUntil(deadline);

        expect(count).toBe(0);
      });
    });
  });

  describe('validateRule', () => {
    it('should validate valid rule', () => {
      const rule = DeadlineRule.usFederalResponseToComplaint();

      const result = engine.validateRule(rule);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.computedDueDate).toBeInstanceOf(Date);
    });

    it('should return errors for invalid days count', () => {
      // DeadlineRule.create() validates daysCount at creation time
      // So we test that creation fails for invalid values
      const createResult = DeadlineRule.create({
        name: 'Invalid',
        daysCount: 5000, // > 3650
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      // Creation should fail for invalid days count
      expect(createResult.isFailure).toBe(true);
      expect(createResult.error.message).toContain('exceeds maximum');
    });
  });
});

describe('factory functions', () => {
  describe('createDeadlineEngine', () => {
    it('should create engine with custom config', () => {
      const engine = createDeadlineEngine({
        warningThresholdDays: 5,
      });

      const config = engine.getConfig();
      expect(config.warningThresholdDays).toBe(5);
    });
  });

  describe('defaultDeadlineEngine', () => {
    it('should be a DeadlineEngine instance', () => {
      expect(defaultDeadlineEngine).toBeInstanceOf(DeadlineEngine);
    });
  });
});

describe('DeadlineCalculationError', () => {
  it('should have correct error code and message', () => {
    const error = new DeadlineCalculationError('Something went wrong');

    expect(error.code).toBe('DEADLINE_CALCULATION_ERROR');
    expect(error.message).toContain('Deadline calculation failed');
    expect(error.message).toContain('Something went wrong');
  });
});
