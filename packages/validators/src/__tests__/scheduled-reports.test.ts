/**
 * Scheduled Report Validator Tests — PG-201
 */

import { describe, it, expect } from 'vitest';
import {
  scheduleCadenceSchema,
  scheduleDeliveryFormatSchema,
  REPORT_SCHEDULE_COLOR_TOKENS,
  reportScheduleColorTokenSchema,
  SCHEDULE_LIMITS,
  cronExpressionSchema,
  ianaTimezoneSchema,
  recipientsSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  setScheduledReportActiveSchema,
  scheduledReportIdSchema,
  scheduleNameConflictSchema,
  presetToCron,
  describeSchedule,
  createReportScheduleTagSchema,
  updateReportScheduleTagSchema,
  deleteReportScheduleTagSchema,
} from '../scheduled-reports';

const TEMPLATE_ID = 'clh3x2k8a0000qz8l1v2r3s4t';

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Weekly pipeline',
    templateId: TEMPLATE_ID,
    cadence: 'weekly',
    dayOfWeek: 1,
    timeOfDay: '09:00',
    timezone: 'Europe/London',
    recipients: ['lead@example.invalid'],
    format: 'pdf',
    ...overrides,
  };
}

function recipients(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `user${i}@example.invalid`);
}

describe('enums and constants', () => {
  it('accepts every cadence', () => {
    for (const v of ['daily', 'weekly', 'monthly', 'quarterly', 'custom']) {
      expect(scheduleCadenceSchema.safeParse(v).success).toBe(true);
    }
    expect(scheduleCadenceSchema.safeParse('hourly').success).toBe(false);
  });

  it('accepts every delivery format', () => {
    for (const v of ['pdf', 'csv', 'email_body', 'excel']) {
      expect(scheduleDeliveryFormatSchema.safeParse(v).success).toBe(true);
    }
    expect(scheduleDeliveryFormatSchema.safeParse('docx').success).toBe(false);
  });

  it('has the 18-token colour allowlist', () => {
    expect(REPORT_SCHEDULE_COLOR_TOKENS).toHaveLength(18);
    expect(reportScheduleColorTokenSchema.safeParse('slate').success).toBe(true);
    expect(reportScheduleColorTokenSchema.safeParse('neon').success).toBe(false);
  });

  it('exposes the agreed limits', () => {
    expect(SCHEDULE_LIMITS).toMatchObject({
      maxRecipients: 50,
      maxTags: 10,
      maxActivePerTenant: 100,
      minIntervalMinutes: 60,
    });
  });
});

describe('cronExpressionSchema', () => {
  it('accepts a 5-field expression', () => {
    expect(cronExpressionSchema.safeParse('0 9 * * 1-5').success).toBe(true);
    expect(cronExpressionSchema.safeParse('*/30 8,12 1 1,4,7,10 *').success).toBe(true);
  });

  it('normalises repeated spaces and tabs to single spaces (matches the DB CHECK)', () => {
    const r = cronExpressionSchema.safeParse('  0  9\t* *   1-5 ');
    expect(r.success && r.data).toBe('0 9 * * 1-5');
  });

  it('rejects 6-field and 4-field expressions', () => {
    expect(cronExpressionSchema.safeParse('0 0 9 * * 1').success).toBe(false);
    expect(cronExpressionSchema.safeParse('0 9 * *').success).toBe(false);
  });

  it('rejects illegal characters and over-long input', () => {
    expect(cronExpressionSchema.safeParse('0 9 * * MON').success).toBe(false);
    expect(cronExpressionSchema.safeParse(`0 9 * * ${'1,'.repeat(60)}1`).success).toBe(false);
  });
});

describe('ianaTimezoneSchema', () => {
  it('accepts IANA zones and UTC', () => {
    expect(ianaTimezoneSchema.safeParse('Europe/London').success).toBe(true);
    expect(ianaTimezoneSchema.safeParse('America/Argentina/Buenos_Aires').success).toBe(true);
    expect(ianaTimezoneSchema.safeParse('UTC').success).toBe(true);
  });

  it('rejects unknown zones, offsets and over-long values', () => {
    expect(ianaTimezoneSchema.safeParse('Not/AZone').success).toBe(false);
    expect(ianaTimezoneSchema.safeParse('+01:00').success).toBe(false);
    expect(ianaTimezoneSchema.safeParse(`Europe/${'x'.repeat(70)}`).success).toBe(false);
  });
});

describe('recipientsSchema', () => {
  it('requires at least one recipient', () => {
    expect(recipientsSchema.safeParse([]).success).toBe(false);
  });

  it('accepts 1 and 50 recipients, rejects 51', () => {
    expect(recipientsSchema.safeParse(recipients(1)).success).toBe(true);
    expect(recipientsSchema.safeParse(recipients(50)).success).toBe(true);
    expect(recipientsSchema.safeParse(recipients(51)).success).toBe(false);
  });

  it('rejects invalid and over-long addresses', () => {
    expect(recipientsSchema.safeParse(['not-an-email']).success).toBe(false);
    expect(recipientsSchema.safeParse([`${'a'.repeat(250)}@example.invalid`]).success).toBe(false);
  });

  it('trims and lower-cases addresses', () => {
    const r = recipientsSchema.safeParse(['  Lead@Example.Invalid ']);
    expect(r.success && r.data).toEqual(['lead@example.invalid']);
  });

  it('rejects case-insensitive duplicates at the second offender', () => {
    const r = recipientsSchema.safeParse([
      'a@example.invalid',
      'b@example.invalid',
      'A@example.invalid',
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual([2]);
      expect(r.error.issues[0].message).toMatch(/duplicate/i);
    }
  });
});

describe('createScheduledReportSchema', () => {
  it('accepts a valid weekly schedule', () => {
    expect(createScheduledReportSchema.safeParse(validCreate()).success).toBe(true);
  });

  it('requires a template reference', () => {
    expect(
      createScheduledReportSchema.safeParse(validCreate({ templateId: undefined })).success
    ).toBe(false);
  });

  it('requires dayOfWeek for weekly', () => {
    const r = createScheduledReportSchema.safeParse(validCreate({ dayOfWeek: undefined }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['dayOfWeek']);
  });

  it('requires dayOfMonth 1-28 for monthly and quarterly', () => {
    expect(
      createScheduledReportSchema.safeParse(
        validCreate({ cadence: 'monthly', dayOfWeek: undefined })
      ).success
    ).toBe(false);
    expect(
      createScheduledReportSchema.safeParse(validCreate({ cadence: 'monthly', dayOfMonth: 29 }))
        .success
    ).toBe(false);
    expect(
      createScheduledReportSchema.safeParse(validCreate({ cadence: 'quarterly', dayOfMonth: 15 }))
        .success
    ).toBe(true);
  });

  it('requires timeOfDay for presets', () => {
    const r = createScheduledReportSchema.safeParse(
      validCreate({ cadence: 'daily', timeOfDay: undefined })
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['timeOfDay']);
  });

  it('rejects a malformed timeOfDay', () => {
    expect(createScheduledReportSchema.safeParse(validCreate({ timeOfDay: '24:00' })).success).toBe(
      false
    );
  });

  it('requires cronExpression for custom', () => {
    const r = createScheduledReportSchema.safeParse(validCreate({ cadence: 'custom' }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['cronExpression']);
    expect(
      createScheduledReportSchema.safeParse(
        validCreate({ cadence: 'custom', cronExpression: '0 9 * * 1-5' })
      ).success
    ).toBe(true);
  });

  it('limits tags to 10 names of at most 50 characters, without duplicates', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(createScheduledReportSchema.safeParse(validCreate({ tags })).success).toBe(false);
    expect(
      createScheduledReportSchema.safeParse(validCreate({ tags: ['x'.repeat(51)] })).success
    ).toBe(false);
    expect(
      createScheduledReportSchema.safeParse(validCreate({ tags: ['Finance', 'finance'] })).success
    ).toBe(false);
    expect(createScheduledReportSchema.safeParse(validCreate({ tags: ['Finance'] })).success).toBe(
      true
    );
  });

  it('rejects server-owned fields', () => {
    for (const key of ['nextRunAt', 'lastRunAt', 'reportId', 'createdBy']) {
      expect(createScheduledReportSchema.safeParse(validCreate({ [key]: 'x' })).success).toBe(
        false
      );
    }
  });

  it('rejects an unknown colour token and an over-long name', () => {
    expect(createScheduledReportSchema.safeParse(validCreate({ colorToken: 'neon' })).success).toBe(
      false
    );
    expect(
      createScheduledReportSchema.safeParse(validCreate({ name: 'n'.repeat(101) })).success
    ).toBe(false);
    expect(createScheduledReportSchema.safeParse(validCreate({ name: '   ' })).success).toBe(false);
  });
});

describe('updateScheduledReportSchema', () => {
  it('requires an id and accepts a partial update', () => {
    expect(updateScheduledReportSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(
      updateScheduledReportSchema.safeParse({ id: 'rs-migrated-tenant1', name: 'x' }).success
    ).toBe(true);
  });

  it('requires cadence when any schedule field changes', () => {
    const r = updateScheduledReportSchema.safeParse({ id: 'abc', timeOfDay: '10:00' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['cadence']);
  });

  it('applies the cadence rules when cadence is present', () => {
    expect(
      updateScheduledReportSchema.safeParse({ id: 'abc', cadence: 'weekly', timeOfDay: '10:00' })
        .success
    ).toBe(false);
    expect(
      updateScheduledReportSchema.safeParse({
        id: 'abc',
        cadence: 'weekly',
        dayOfWeek: 2,
        timeOfDay: '10:00',
      }).success
    ).toBe(true);
  });

  it('rejects server-owned fields', () => {
    for (const key of ['nextRunAt', 'lastRunAt', 'reportId', 'createdBy']) {
      expect(updateScheduledReportSchema.safeParse({ id: 'abc', [key]: 'x' }).success).toBe(false);
    }
  });

  it('validates recipients and tags when present', () => {
    expect(updateScheduledReportSchema.safeParse({ id: 'abc', recipients: [] }).success).toBe(
      false
    );
    expect(updateScheduledReportSchema.safeParse({ id: 'abc', tags: ['a', 'A'] }).success).toBe(
      false
    );
  });
});

describe('id and toggle schemas', () => {
  it('accepts cuid and migrated ids, rejects empty', () => {
    expect(scheduledReportIdSchema.safeParse({ id: TEMPLATE_ID }).success).toBe(true);
    expect(scheduledReportIdSchema.safeParse({ id: 'rs-migrated-tenant1' }).success).toBe(true);
    expect(scheduledReportIdSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('requires a boolean for setActive', () => {
    expect(setScheduledReportActiveSchema.safeParse({ id: 'a', isActive: true }).success).toBe(
      true
    );
    expect(setScheduledReportActiveSchema.safeParse({ id: 'a', isActive: 'yes' }).success).toBe(
      false
    );
  });
});

describe('scheduleNameConflictSchema', () => {
  const existing = [
    { id: 's1', name: 'Weekly pipeline' },
    { id: 's2', name: 'Monthly revenue' },
  ];

  it('rejects a case-insensitive collision', () => {
    const r = scheduleNameConflictSchema(existing).safeParse('  weekly PIPELINE ');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/already exists/i);
  });

  it('excludes the schedule being edited', () => {
    expect(scheduleNameConflictSchema(existing, 's1').safeParse('Weekly pipeline').success).toBe(
      true
    );
  });

  it('accepts a new name', () => {
    expect(scheduleNameConflictSchema(existing).safeParse('Quarterly SLA').success).toBe(true);
  });
});

describe('presetToCron', () => {
  it('builds a cron for each preset', () => {
    expect(presetToCron({ cadence: 'daily', timeOfDay: '09:30' })).toBe('30 9 * * *');
    expect(presetToCron({ cadence: 'weekly', dayOfWeek: 1, timeOfDay: '08:00' })).toBe('0 8 * * 1');
    expect(presetToCron({ cadence: 'monthly', dayOfMonth: 1, timeOfDay: '07:15' })).toBe(
      '15 7 1 * *'
    );
    expect(presetToCron({ cadence: 'quarterly', dayOfMonth: 15, timeOfDay: '06:00' })).toBe(
      '0 6 15 1,4,7,10 *'
    );
  });

  it('returns null for custom or incomplete presets', () => {
    expect(presetToCron({ cadence: 'custom', timeOfDay: '09:00' })).toBeNull();
    expect(presetToCron({ cadence: 'weekly', timeOfDay: '09:00' })).toBeNull();
    expect(presetToCron({ cadence: 'monthly', timeOfDay: '09:00' })).toBeNull();
    expect(presetToCron({ cadence: 'daily' })).toBeNull();
    expect(presetToCron({ cadence: 'daily', timeOfDay: 'nine' })).toBeNull();
  });
});

describe('describeSchedule', () => {
  const tz = 'Europe/London';
  it('describes each cadence in plain English', () => {
    expect(describeSchedule({ cadence: 'daily', timeOfDay: '09:00', timezone: tz })).toBe(
      'Every day at 09:00 (Europe/London)'
    );
    expect(
      describeSchedule({ cadence: 'weekly', dayOfWeek: 0, timeOfDay: '09:00', timezone: tz })
    ).toBe('Every Sunday at 09:00 (Europe/London)');
    expect(
      describeSchedule({ cadence: 'monthly', dayOfMonth: 1, timeOfDay: '07:15', timezone: tz })
    ).toBe('Monthly on day 1 at 07:15 (Europe/London)');
    expect(
      describeSchedule({ cadence: 'quarterly', dayOfMonth: 15, timeOfDay: '06:00', timezone: tz })
    ).toBe('Quarterly (Jan, Apr, Jul, Oct) on day 15 at 06:00 (Europe/London)');
    expect(
      describeSchedule({ cadence: 'custom', cronExpression: '0 9 * * 1-5', timezone: tz })
    ).toBe('Custom schedule: 0 9 * * 1-5 (Europe/London)');
  });

  it('says when the schedule is incomplete', () => {
    expect(describeSchedule({ cadence: 'weekly', timezone: tz })).toBe('Schedule not set');
    expect(describeSchedule({ cadence: 'custom', timezone: tz })).toBe('Schedule not set');
  });
});

describe('tag schemas', () => {
  it('validates create', () => {
    expect(
      createReportScheduleTagSchema.safeParse({ name: 'Finance', colorToken: 'blue' }).success
    ).toBe(true);
    expect(createReportScheduleTagSchema.safeParse({ name: '', colorToken: 'blue' }).success).toBe(
      false
    );
    expect(createReportScheduleTagSchema.safeParse({ name: 'x'.repeat(51) }).success).toBe(false);
    expect(
      createReportScheduleTagSchema.safeParse({ name: 'ok', colorToken: 'neon' }).success
    ).toBe(false);
    expect(
      createReportScheduleTagSchema.safeParse({ name: 'ok', description: 'd'.repeat(201) }).success
    ).toBe(false);
  });

  it('validates update and delete', () => {
    expect(updateReportScheduleTagSchema.safeParse({ id: 't1', isActive: false }).success).toBe(
      true
    );
    expect(updateReportScheduleTagSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(deleteReportScheduleTagSchema.safeParse({ id: 't1' }).success).toBe(true);
    expect(deleteReportScheduleTagSchema.safeParse({}).success).toBe(false);
  });
});
