import { describe, it, expect } from 'vitest';
import { DeadlineRule, InvalidDeadlineRuleError } from '../DeadlineRule';

describe('DeadlineRule', () => {
  describe('create', () => {
    it('should create a valid DeadlineRule with required fields', () => {
      const result = DeadlineRule.create({
        name: 'Test Deadline',
        daysCount: 14,
        dayCountType: 'CALENDAR',
        trigger: 'DOCUMENT_RECEIVED',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Test Deadline');
      expect(result.value.daysCount).toBe(14);
      expect(result.value.dayCountType).toBe('CALENDAR');
      expect(result.value.trigger).toBe('DOCUMENT_RECEIVED');
    });

    it('should create with all optional fields', () => {
      const result = DeadlineRule.create({
        name: 'Full Rule',
        description: 'A complete deadline rule',
        daysCount: 30,
        dayCountType: 'BUSINESS',
        trigger: 'CASE_FILED',
        jurisdiction: 'US_FEDERAL',
        excludeHolidays: true,
        includeEndDay: false,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.description).toBe('A complete deadline rule');
      expect(result.value.jurisdiction).toBe('US_FEDERAL');
      expect(result.value.excludeHolidays).toBe(true);
      expect(result.value.includeEndDay).toBe(false);
    });

    it('should use default values for optional fields', () => {
      const result = DeadlineRule.create({
        name: 'Minimal Rule',
        daysCount: 7,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.description).toBe('');
      expect(result.value.jurisdiction).toBe('CUSTOM');
      expect(result.value.excludeHolidays).toBe(false);
      expect(result.value.includeEndDay).toBe(true);
    });

    it('should trim name and description', () => {
      const result = DeadlineRule.create({
        name: '  Trimmed Name  ',
        description: '  Trimmed Description  ',
        daysCount: 10,
        dayCountType: 'CALENDAR',
        trigger: 'MOTION_FILED',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Trimmed Name');
      expect(result.value.description).toBe('Trimmed Description');
    });

    it('should fail for empty name', () => {
      const result = DeadlineRule.create({
        name: '',
        daysCount: 10,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidDeadlineRuleError);
      expect(result.error.message).toContain('Name is required');
    });

    it('should fail for whitespace-only name', () => {
      const result = DeadlineRule.create({
        name: '   ',
        daysCount: 10,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for negative days count', () => {
      const result = DeadlineRule.create({
        name: 'Negative Days',
        daysCount: -5,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('non-negative');
    });

    it('should fail for days count exceeding maximum', () => {
      const result = DeadlineRule.create({
        name: 'Too Many Days',
        daysCount: 4000, // > 3650 (10 years)
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('exceeds maximum');
    });

    it('should allow zero days count', () => {
      const result = DeadlineRule.create({
        name: 'Same Day Deadline',
        daysCount: 0,
        dayCountType: 'CALENDAR',
        trigger: 'HEARING_SCHEDULED',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.daysCount).toBe(0);
    });

    it('should allow maximum days count (3650)', () => {
      const result = DeadlineRule.create({
        name: 'Max Days',
        daysCount: 3650,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('static factory methods', () => {
    describe('usFederalResponseToComplaint', () => {
      it('should create correct US Federal response to complaint rule', () => {
        const rule = DeadlineRule.usFederalResponseToComplaint();

        expect(rule.name).toBe('Response to Complaint');
        expect(rule.daysCount).toBe(21);
        expect(rule.dayCountType).toBe('CALENDAR');
        expect(rule.trigger).toBe('DOCUMENT_RECEIVED');
        expect(rule.jurisdiction).toBe('US_FEDERAL');
      });
    });

    describe('usFederalDiscoveryResponse', () => {
      it('should create correct US Federal discovery response rule', () => {
        const rule = DeadlineRule.usFederalDiscoveryResponse();

        expect(rule.name).toBe('Discovery Response');
        expect(rule.daysCount).toBe(30);
        expect(rule.trigger).toBe('DISCOVERY_SERVED');
        expect(rule.jurisdiction).toBe('US_FEDERAL');
      });
    });

    describe('usFederalMotionResponse', () => {
      it('should create correct US Federal motion response rule', () => {
        const rule = DeadlineRule.usFederalMotionResponse();

        expect(rule.name).toBe('Motion Response');
        expect(rule.daysCount).toBe(14);
        expect(rule.trigger).toBe('MOTION_FILED');
        expect(rule.jurisdiction).toBe('US_FEDERAL');
      });
    });

    describe('ukAcknowledgementOfService', () => {
      it('should create correct UK acknowledgement of service rule', () => {
        const rule = DeadlineRule.ukAcknowledgementOfService();

        expect(rule.name).toBe('Acknowledgement of Service');
        expect(rule.daysCount).toBe(14);
        expect(rule.jurisdiction).toBe('UK');
      });
    });

    describe('ukDefenceDeadline', () => {
      it('should create correct UK defence deadline rule', () => {
        const rule = DeadlineRule.ukDefenceDeadline();

        expect(rule.name).toBe('Defence Filing');
        expect(rule.daysCount).toBe(28);
        expect(rule.jurisdiction).toBe('UK');
      });
    });

    describe('businessDays', () => {
      it('should create custom business days rule', () => {
        const rule = DeadlineRule.businessDays('Custom Business', 5, 'CASE_OPENED');

        expect(rule.name).toBe('Custom Business');
        expect(rule.daysCount).toBe(5);
        expect(rule.dayCountType).toBe('BUSINESS');
        expect(rule.excludeHolidays).toBe(true);
        expect(rule.trigger).toBe('CASE_OPENED');
      });
    });

    describe('calendarDays', () => {
      it('should create custom calendar days rule', () => {
        const rule = DeadlineRule.calendarDays('Custom Calendar', 10, 'MOTION_FILED');

        expect(rule.name).toBe('Custom Calendar');
        expect(rule.daysCount).toBe(10);
        expect(rule.dayCountType).toBe('CALENDAR');
        expect(rule.excludeHolidays).toBe(false);
        expect(rule.trigger).toBe('MOTION_FILED');
      });
    });
  });

  describe('toValue', () => {
    it('should return all properties as an object', () => {
      const result = DeadlineRule.create({
        name: 'Test Rule',
        description: 'Test Description',
        daysCount: 14,
        dayCountType: 'BUSINESS',
        trigger: 'CUSTOM',
        jurisdiction: 'EU',
        excludeHolidays: true,
        includeEndDay: false,
      });

      const value = result.value.toValue();

      expect(value).toEqual({
        name: 'Test Rule',
        description: 'Test Description',
        daysCount: 14,
        dayCountType: 'BUSINESS',
        trigger: 'CUSTOM',
        jurisdiction: 'EU',
        excludeHolidays: true,
        includeEndDay: false,
      });
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const rule = DeadlineRule.usFederalResponseToComplaint();
      const json = rule.toJSON();

      expect(json.name).toBe('Response to Complaint');
      expect(json.daysCount).toBe(21);
      expect(json.dayCountType).toBe('CALENDAR');
      expect(json.trigger).toBe('DOCUMENT_RECEIVED');
      expect(json.jurisdiction).toBe('US_FEDERAL');
      expect(json.excludeHolidays).toBe(false);
      expect(json.includeEndDay).toBe(true);
    });
  });

  describe('InvalidDeadlineRuleError', () => {
    it('should have correct error code', () => {
      const error = new InvalidDeadlineRuleError('test message');

      expect(error.code).toBe('INVALID_DEADLINE_RULE');
      expect(error.message).toContain('Invalid deadline rule');
      expect(error.message).toContain('test message');
    });
  });

  describe('type definitions', () => {
    it('should accept all valid DayCountType values', () => {
      const calendarResult = DeadlineRule.create({
        name: 'Calendar',
        daysCount: 10,
        dayCountType: 'CALENDAR',
        trigger: 'CASE_OPENED',
      });
      expect(calendarResult.isSuccess).toBe(true);

      const businessResult = DeadlineRule.create({
        name: 'Business',
        daysCount: 10,
        dayCountType: 'BUSINESS',
        trigger: 'CASE_OPENED',
      });
      expect(businessResult.isSuccess).toBe(true);
    });

    it('should accept all valid DeadlineTrigger values', () => {
      const triggers = [
        'CASE_OPENED',
        'CASE_FILED',
        'DOCUMENT_RECEIVED',
        'HEARING_SCHEDULED',
        'MOTION_FILED',
        'DISCOVERY_SERVED',
        'CUSTOM',
      ] as const;

      for (const trigger of triggers) {
        const result = DeadlineRule.create({
          name: `Trigger ${trigger}`,
          daysCount: 10,
          dayCountType: 'CALENDAR',
          trigger,
        });
        expect(result.isSuccess).toBe(true);
      }
    });

    it('should accept all valid Jurisdiction values', () => {
      const jurisdictions = ['US_FEDERAL', 'UK', 'EU', 'BRAZIL', 'CUSTOM'] as const;

      for (const jurisdiction of jurisdictions) {
        const result = DeadlineRule.create({
          name: `Jurisdiction ${jurisdiction}`,
          daysCount: 10,
          dayCountType: 'CALENDAR',
          trigger: 'CASE_OPENED',
          jurisdiction,
        });
        expect(result.isSuccess).toBe(true);
      }
    });
  });
});
