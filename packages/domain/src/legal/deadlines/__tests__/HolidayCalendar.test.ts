import { describe, it, expect } from 'vitest';
import { HolidayCalendar, InvalidHolidayCalendarError } from '../HolidayCalendar';

describe('HolidayCalendar', () => {
  describe('create', () => {
    it('should create a valid HolidayCalendar with name', () => {
      const result = HolidayCalendar.create('Test Calendar');

      expect(result.isSuccess).toBe(true);
      expect(result.value.getName()).toBe('Test Calendar');
    });

    it('should create with default UTC timezone', () => {
      const result = HolidayCalendar.create('Test Calendar');

      expect(result.isSuccess).toBe(true);
      expect(result.value.getTimezone()).toBe('UTC');
    });

    it('should create with custom timezone', () => {
      const result = HolidayCalendar.create('US Calendar', 'America/New_York');

      expect(result.isSuccess).toBe(true);
      expect(result.value.getTimezone()).toBe('America/New_York');
    });

    it('should trim calendar name', () => {
      const result = HolidayCalendar.create('  Trimmed Calendar  ');

      expect(result.isSuccess).toBe(true);
      expect(result.value.getName()).toBe('Trimmed Calendar');
    });

    it('should fail for empty name', () => {
      const result = HolidayCalendar.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidHolidayCalendarError);
      expect(result.error.message).toContain('name is required');
    });

    it('should fail for whitespace-only name', () => {
      const result = HolidayCalendar.create('   ');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('addHoliday', () => {
    it('should add a specific date holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const holidayDate = new Date(2025, 0, 1); // Jan 1, 2025

      calendar.addHoliday(holidayDate, "New Year's Day");

      expect(calendar.isHoliday(holidayDate)).toBe(true);
    });

    it('should return this for method chaining', () => {
      const calendar = HolidayCalendar.create('Test').value;

      const result = calendar
        .addHoliday(new Date(2025, 0, 1), "New Year's Day")
        .addHoliday(new Date(2025, 11, 25), 'Christmas');

      expect(result).toBe(calendar);
      expect(calendar.isHoliday(new Date(2025, 0, 1))).toBe(true);
      expect(calendar.isHoliday(new Date(2025, 11, 25))).toBe(true);
    });
  });

  describe('addRecurringHoliday', () => {
    it('should add a recurring annual holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;

      calendar.addRecurringHoliday(12, 25, 'Christmas');

      expect(calendar.isHoliday(new Date(2025, 11, 25))).toBe(true);
      expect(calendar.isHoliday(new Date(2026, 11, 25))).toBe(true);
      expect(calendar.isHoliday(new Date(2030, 11, 25))).toBe(true);
    });

    it('should throw for invalid month', () => {
      const calendar = HolidayCalendar.create('Test').value;

      expect(() => calendar.addRecurringHoliday(0, 1, 'Invalid')).toThrow(
        'Month must be between 1 and 12'
      );
      expect(() => calendar.addRecurringHoliday(13, 1, 'Invalid')).toThrow(
        'Month must be between 1 and 12'
      );
    });

    it('should throw for invalid day', () => {
      const calendar = HolidayCalendar.create('Test').value;

      expect(() => calendar.addRecurringHoliday(1, 0, 'Invalid')).toThrow(
        'Day must be between 1 and 31'
      );
      expect(() => calendar.addRecurringHoliday(1, 32, 'Invalid')).toThrow(
        'Day must be between 1 and 31'
      );
    });

    it('should return this for method chaining', () => {
      const calendar = HolidayCalendar.create('Test').value;

      const result = calendar
        .addRecurringHoliday(1, 1, "New Year's Day")
        .addRecurringHoliday(12, 25, 'Christmas');

      expect(result).toBe(calendar);
    });
  });

  describe('removeHoliday', () => {
    it('should remove an existing holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const date = new Date(2025, 0, 1);
      calendar.addHoliday(date, "New Year's Day");

      const removed = calendar.removeHoliday(date);

      expect(removed).toBe(true);
      expect(calendar.isHoliday(date)).toBe(false);
    });

    it('should return false when removing non-existent holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;

      const removed = calendar.removeHoliday(new Date(2025, 5, 15));

      expect(removed).toBe(false);
    });
  });

  describe('isHoliday', () => {
    it('should return true for specific holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 6, 4), 'Independence Day');

      expect(calendar.isHoliday(new Date(2025, 6, 4))).toBe(true);
    });

    it('should return true for recurring holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addRecurringHoliday(7, 4, 'Independence Day');

      expect(calendar.isHoliday(new Date(2025, 6, 4))).toBe(true);
      expect(calendar.isHoliday(new Date(2050, 6, 4))).toBe(true);
    });

    it('should return false for non-holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");

      expect(calendar.isHoliday(new Date(2025, 0, 2))).toBe(false);
    });
  });

  describe('getHolidayName', () => {
    it('should return name for specific holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");

      expect(calendar.getHolidayName(new Date(2025, 0, 1))).toBe("New Year's Day");
    });

    it('should return name for recurring holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addRecurringHoliday(12, 25, 'Christmas');

      expect(calendar.getHolidayName(new Date(2025, 11, 25))).toBe('Christmas');
    });

    it('should return null for non-holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;

      expect(calendar.getHolidayName(new Date(2025, 5, 15))).toBeNull();
    });

    it('should prefer specific holiday over recurring', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addRecurringHoliday(12, 25, 'Christmas');
      calendar.addHoliday(new Date(2025, 11, 25), 'Christmas 2025 - Special');

      expect(calendar.getHolidayName(new Date(2025, 11, 25))).toBe('Christmas 2025 - Special');
    });
  });

  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const saturday = new Date(2025, 0, 4); // Saturday, Jan 4, 2025

      expect(calendar.isWeekend(saturday)).toBe(true);
    });

    it('should return true for Sunday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const sunday = new Date(2025, 0, 5); // Sunday, Jan 5, 2025

      expect(calendar.isWeekend(sunday)).toBe(true);
    });

    it('should return false for weekday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const monday = new Date(2025, 0, 6); // Monday, Jan 6, 2025

      expect(calendar.isWeekend(monday)).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('should return true for weekday non-holiday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const tuesday = new Date(2025, 0, 7); // Tuesday, Jan 7, 2025

      expect(calendar.isBusinessDay(tuesday)).toBe(true);
    });

    it('should return false for weekend', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const saturday = new Date(2025, 0, 4);

      expect(calendar.isBusinessDay(saturday)).toBe(false);
    });

    it('should return false for holiday on weekday', () => {
      const calendar = HolidayCalendar.create('Test').value;
      // Jan 1, 2025 is a Wednesday
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");

      expect(calendar.isBusinessDay(new Date(2025, 0, 1))).toBe(false);
    });
  });

  describe('getHolidaysInRange', () => {
    it('should return holidays within date range', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");
      calendar.addHoliday(new Date(2025, 0, 20), 'MLK Day');
      calendar.addHoliday(new Date(2025, 1, 17), "Presidents' Day");

      const holidays = calendar.getHolidaysInRange(new Date(2025, 0, 1), new Date(2025, 0, 31));

      expect(holidays).toHaveLength(2);
      expect(holidays.map((h) => h.name)).toContain("New Year's Day");
      expect(holidays.map((h) => h.name)).toContain('MLK Day');
    });

    it('should include recurring holidays in range', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addRecurringHoliday(7, 4, 'Independence Day');

      const holidays = calendar.getHolidaysInRange(new Date(2025, 6, 1), new Date(2025, 6, 31));

      expect(holidays).toHaveLength(1);
      expect(holidays[0].name).toBe('Independence Day');
      expect(holidays[0].recurring).toBe(true);
    });

    it('should return empty array for range with no holidays', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");

      const holidays = calendar.getHolidaysInRange(new Date(2025, 5, 1), new Date(2025, 5, 30));

      expect(holidays).toHaveLength(0);
    });
  });

  describe('countBusinessDays', () => {
    it('should count business days between dates', () => {
      const calendar = HolidayCalendar.create('Test').value;
      // Jan 6-10, 2025 is Mon-Fri (5 business days)
      const startDate = new Date(2025, 0, 6);
      const endDate = new Date(2025, 0, 10);

      expect(calendar.countBusinessDays(startDate, endDate)).toBe(5);
    });

    it('should exclude weekends from count', () => {
      const calendar = HolidayCalendar.create('Test').value;
      // Jan 6-12, 2025 is Mon-Sun (5 business days)
      const startDate = new Date(2025, 0, 6);
      const endDate = new Date(2025, 0, 12);

      expect(calendar.countBusinessDays(startDate, endDate)).toBe(5);
    });

    it('should exclude holidays from count', () => {
      const calendar = HolidayCalendar.create('Test').value;
      calendar.addHoliday(new Date(2025, 0, 8), 'Holiday');
      // Jan 6-10, 2025 with holiday on Wed = 4 business days
      const startDate = new Date(2025, 0, 6);
      const endDate = new Date(2025, 0, 10);

      expect(calendar.countBusinessDays(startDate, endDate)).toBe(4);
    });

    it('should return 0 for same day if weekend', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const saturday = new Date(2025, 0, 4);

      expect(calendar.countBusinessDays(saturday, saturday)).toBe(0);
    });

    it('should return 1 for same day if business day', () => {
      const calendar = HolidayCalendar.create('Test').value;
      const monday = new Date(2025, 0, 6);

      expect(calendar.countBusinessDays(monday, monday)).toBe(1);
    });
  });

  describe('static factory methods', () => {
    describe('usFederalHolidays', () => {
      it('should create US Federal holidays calendar', () => {
        const calendar = HolidayCalendar.usFederalHolidays();

        expect(calendar.getName()).toBe('US Federal Holidays');
        expect(calendar.getTimezone()).toBe('America/New_York');
      });

      it('should include fixed US holidays', () => {
        const calendar = HolidayCalendar.usFederalHolidays();

        // New Year's Day
        expect(calendar.isHoliday(new Date(2025, 0, 1))).toBe(true);
        // Independence Day
        expect(calendar.isHoliday(new Date(2025, 6, 4))).toBe(true);
        // Veterans Day
        expect(calendar.isHoliday(new Date(2025, 10, 11))).toBe(true);
        // Christmas
        expect(calendar.isHoliday(new Date(2025, 11, 25))).toBe(true);
      });
    });

    describe('ukBankHolidays', () => {
      it('should create UK bank holidays calendar', () => {
        const calendar = HolidayCalendar.ukBankHolidays();

        expect(calendar.getName()).toBe('UK Bank Holidays');
        expect(calendar.getTimezone()).toBe('Europe/London');
      });

      it('should include fixed UK holidays', () => {
        const calendar = HolidayCalendar.ukBankHolidays();

        // New Year's Day
        expect(calendar.isHoliday(new Date(2025, 0, 1))).toBe(true);
        // Christmas
        expect(calendar.isHoliday(new Date(2025, 11, 25))).toBe(true);
        // Boxing Day
        expect(calendar.isHoliday(new Date(2025, 11, 26))).toBe(true);
      });
    });

    describe('empty', () => {
      it('should create empty calendar with default name', () => {
        const calendar = HolidayCalendar.empty();

        expect(calendar.getName()).toBe('Empty Calendar');
      });

      it('should create empty calendar with custom name', () => {
        const calendar = HolidayCalendar.empty('My Empty Calendar');

        expect(calendar.getName()).toBe('My Empty Calendar');
      });

      it('should have no holidays', () => {
        const calendar = HolidayCalendar.empty();

        expect(calendar.isHoliday(new Date(2025, 0, 1))).toBe(false);
        expect(calendar.isHoliday(new Date(2025, 11, 25))).toBe(false);
      });
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const calendar = HolidayCalendar.create('Test Calendar', 'America/Los_Angeles').value;
      calendar.addHoliday(new Date(2025, 0, 1), "New Year's Day");
      calendar.addRecurringHoliday(12, 25, 'Christmas');

      const json = calendar.toJSON();

      expect(json.name).toBe('Test Calendar');
      expect(json.timezone).toBe('America/Los_Angeles');
      expect(json.holidays).toHaveLength(1);
      expect((json.holidays as any[])[0].name).toBe("New Year's Day");
      expect(json.recurringHolidays).toHaveLength(1);
      expect((json.recurringHolidays as any[])[0]).toEqual({
        month: 12,
        day: 25,
        name: 'Christmas',
      });
    });
  });

  describe('InvalidHolidayCalendarError', () => {
    it('should have correct error code', () => {
      const error = new InvalidHolidayCalendarError('test message');

      expect(error.code).toBe('INVALID_HOLIDAY_CALENDAR');
      expect(error.message).toContain('Invalid holiday calendar');
      expect(error.message).toContain('test message');
    });
  });
});
