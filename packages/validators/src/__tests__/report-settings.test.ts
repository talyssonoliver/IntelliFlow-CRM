/**
 * Report Settings Validator Tests — PG-187
 */

import { describe, it, expect } from 'vitest';
import {
  defaultRangeSchema,
  currencyCodeSchema,
  scheduledDeliverySchema,
  scheduledDeliveryFrequencySchema,
  scheduledDeliveryFormatSchema,
  updateReportSettingsSchema,
  DEFAULT_REPORT_SETTINGS,
} from '../report-settings';

describe('defaultRangeSchema', () => {
  it('accepts each of 7d/14d/30d/90d', () => {
    for (const v of ['7d', '14d', '30d', '90d'] as const) {
      expect(defaultRangeSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects "1y"', () => {
    expect(defaultRangeSchema.safeParse('1y').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(defaultRangeSchema.safeParse('').success).toBe(false);
  });

  it('rejects numeric-only string "30"', () => {
    expect(defaultRangeSchema.safeParse('30').success).toBe(false);
  });
});

describe('currencyCodeSchema', () => {
  it('accepts valid ISO 4217 codes (USD/EUR/GBP)', () => {
    for (const v of ['USD', 'EUR', 'GBP']) {
      expect(currencyCodeSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects lowercase codes', () => {
    expect(currencyCodeSchema.safeParse('usd').success).toBe(false);
  });

  it('rejects numeric strings', () => {
    expect(currencyCodeSchema.safeParse('1234').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(currencyCodeSchema.safeParse('').success).toBe(false);
  });
});

describe('scheduledDeliverySchema', () => {
  const validEnabled = {
    enabled: true,
    frequency: 'weekly' as const,
    dayOfWeek: 1,
    time: '09:00',
    recipients: ['ops@example.com'],
    format: 'pdf' as const,
  };

  const validDisabled = {
    enabled: false,
    frequency: 'weekly' as const,
    time: '09:00',
    recipients: [],
    format: 'pdf' as const,
  };

  it('accepts disabled-with-empty-recipients (happy path)', () => {
    expect(scheduledDeliverySchema.safeParse(validDisabled).success).toBe(true);
  });

  it('accepts enabled-with-recipients (happy path)', () => {
    expect(scheduledDeliverySchema.safeParse(validEnabled).success).toBe(true);
  });

  it('superRefine: rejects enabled=true with recipients=[]', () => {
    const result = scheduledDeliverySchema.safeParse({
      ...validEnabled,
      recipients: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'recipients')).toBe(true);
    }
  });

  it('rejects invalid time format', () => {
    expect(scheduledDeliverySchema.safeParse({ ...validEnabled, time: '25:99' }).success).toBe(
      false
    );
  });

  it('rejects invalid email in recipients', () => {
    expect(
      scheduledDeliverySchema.safeParse({ ...validEnabled, recipients: ['not-an-email'] }).success
    ).toBe(false);
  });
});

describe('scheduledDeliveryFrequencySchema.options', () => {
  it('exposes exactly daily/weekly/monthly', () => {
    expect([...scheduledDeliveryFrequencySchema.options]).toEqual(['daily', 'weekly', 'monthly']);
  });
});

describe('scheduledDeliveryFormatSchema.options', () => {
  it('exposes exactly pdf/csv/excel', () => {
    expect([...scheduledDeliveryFormatSchema.options]).toEqual(['pdf', 'csv', 'excel']);
  });
});

describe('updateReportSettingsSchema', () => {
  it('accepts empty partial (no-op update)', () => {
    expect(updateReportSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts { defaultRange }', () => {
    expect(updateReportSettingsSchema.safeParse({ defaultRange: '7d' }).success).toBe(true);
  });

  it('accepts { currency }', () => {
    expect(updateReportSettingsSchema.safeParse({ currency: 'EUR' }).success).toBe(true);
  });

  it('accepts { scheduledDelivery } with full valid payload', () => {
    expect(
      updateReportSettingsSchema.safeParse({
        scheduledDelivery: {
          enabled: true,
          frequency: 'daily',
          time: '08:30',
          recipients: ['a@b.co'],
          format: 'csv',
        },
      }).success
    ).toBe(true);
  });
});

describe('DEFAULT_REPORT_SETTINGS', () => {
  it('uses 30d / USD / disabled scheduledDelivery', () => {
    expect(DEFAULT_REPORT_SETTINGS.defaultRange).toBe('30d');
    expect(DEFAULT_REPORT_SETTINGS.currency).toBe('USD');
    expect(DEFAULT_REPORT_SETTINGS.scheduledDelivery.enabled).toBe(false);
    expect(DEFAULT_REPORT_SETTINGS.scheduledDelivery.recipients).toEqual([]);
  });
});
