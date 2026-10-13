/**
 * Scheduled report helpers — PG-201
 *
 * Pure helpers behind analytics.scheduledReports: next-run computation (cron +
 * IANA timezone, fixed clock), the minimum-interval guard, preset -> column
 * derivation, and row normalisation to the explicit ScheduledReportView contract.
 */

import { describe, it, expect } from 'vitest';
import {
  computeNextRun,
  isIntervalAllowed,
  offsetTransitionDays,
  buildScheduleColumns,
  normalizeScheduleRow,
  isTemplateVisible,
  InvalidCronError,
  type ScheduleRowWithTemplate,
} from '../scheduled-reports.schedule';

const FROM = new Date('2026-10-13T10:00:00Z'); // Tuesday

function row(overrides: Partial<ScheduleRowWithTemplate> = {}): ScheduleRowWithTemplate {
  return {
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportId: null,
    templateId: 'tpl-1',
    name: 'Weekly pipeline',
    description: null,
    frequency: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: null,
    timeOfDay: '09:00',
    cronExpression: '0 9 * * 1',
    timezone: 'Europe/London',
    recipients: ['lead@example.invalid'],
    format: 'pdf',
    colorToken: 'blue',
    tags: ['Finance'],
    createdBy: 'user-1',
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-10-19T08:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    template: { id: 'tpl-1', name: 'Pipeline', createdBy: 'user-1', sharingScope: 'private' },
    ...overrides,
  };
}

describe('computeNextRun', () => {
  it('returns the next daily fire time in the schedule timezone', () => {
    expect(computeNextRun('30 9 * * *', 'UTC', FROM).toISOString()).toBe(
      '2026-10-14T09:30:00.000Z'
    );
  });

  it('returns the next weekly fire time', () => {
    // Next Monday 09:00 London (BST ends 25 Oct, so 19 Oct is still UTC+1).
    expect(computeNextRun('0 9 * * 1', 'Europe/London', FROM).toISOString()).toBe(
      '2026-10-19T08:00:00.000Z'
    );
  });

  it('crosses the Europe/London DST change correctly', () => {
    const from = new Date('2026-10-24T12:00:00Z');
    // 09:00 London on Sun 25 Oct is GMT (UTC+0) after the change.
    expect(computeNextRun('0 9 * * 0', 'Europe/London', from).toISOString()).toBe(
      '2026-10-25T09:00:00.000Z'
    );
  });

  it('skips months without the requested day', () => {
    const from = new Date('2026-02-01T00:00:00Z');
    expect(computeNextRun('0 6 31 * *', 'UTC', from).toISOString()).toBe(
      '2026-03-31T06:00:00.000Z'
    );
  });

  it('honours the quarterly month list', () => {
    expect(computeNextRun('0 6 15 1,4,7,10 *', 'UTC', FROM).toISOString()).toBe(
      '2026-10-15T06:00:00.000Z'
    );
  });

  it('works in a non-European timezone', () => {
    expect(computeNextRun('0 9 * * *', 'America/New_York', FROM).toISOString()).toBe(
      '2026-10-13T13:00:00.000Z'
    );
  });

  it('throws InvalidCronError for an expression cron-parser rejects', () => {
    expect(() => computeNextRun('99 9 * * *', 'UTC', FROM)).toThrow(InvalidCronError);
    expect(() => computeNextRun('0 9 * * *', 'Not/AZone', FROM)).toThrow(InvalidCronError);
  });
});

describe('isIntervalAllowed', () => {
  it('rejects schedules that fire more often than hourly', () => {
    expect(isIntervalAllowed('*/5 * * * *', 'UTC', FROM)).toBe(false);
    expect(isIntervalAllowed('0,30 9 * * *', 'UTC', FROM)).toBe(false);
  });

  it('rejects an hourly schedule that a half-hour DST shift would run 30 minutes apart', () => {
    // Australia/Lord_Howe moves its clock by 30 minutes (next change 2027-04-03).
    expect(isIntervalAllowed('30 * * * *', 'Australia/Lord_Howe', FROM)).toBe(false);
  });

  it('accepts hourly and slower schedules', () => {
    expect(isIntervalAllowed('0 * * * *', 'UTC', FROM)).toBe(true);
    expect(isIntervalAllowed('0 9 * * *', 'UTC', FROM)).toBe(true);
    expect(isIntervalAllowed('0 6 15 1,4,7,10 *', 'UTC', FROM)).toBe(true);
  });
});

describe('offsetTransitionDays', () => {
  it('finds the two Europe/London DST changes in the coming year', () => {
    expect(
      offsetTransitionDays('Europe/London', FROM).map((d) => d.toISOString().slice(0, 10))
    ).toEqual(['2026-10-24', '2027-03-27']);
  });

  it('finds none for UTC', () => {
    expect(offsetTransitionDays('UTC', FROM)).toEqual([]);
  });

  it('throws InvalidCronError for an unknown timezone', () => {
    expect(() => offsetTransitionDays('Not/AZone', FROM)).toThrow(InvalidCronError);
  });
});

describe('buildScheduleColumns', () => {
  it('derives the cron for a preset and keeps the legacy columns consistent', () => {
    expect(
      buildScheduleColumns({ cadence: 'weekly', dayOfWeek: 2, dayOfMonth: 10, timeOfDay: '08:15' })
    ).toEqual({
      frequency: 'weekly',
      dayOfWeek: 2,
      dayOfMonth: null,
      timeOfDay: '08:15',
      cronExpression: '15 8 * * 2',
    });
    expect(
      buildScheduleColumns({ cadence: 'quarterly', dayOfMonth: 15, timeOfDay: '06:00' })
    ).toEqual({
      frequency: 'quarterly',
      dayOfWeek: null,
      dayOfMonth: 15,
      timeOfDay: '06:00',
      cronExpression: '0 6 15 1,4,7,10 *',
    });
  });

  it('ignores a client cron for presets', () => {
    expect(
      buildScheduleColumns({ cadence: 'daily', timeOfDay: '09:00', cronExpression: '* * * * *' })
        .cronExpression
    ).toBe('0 9 * * *');
  });

  it('stores a custom cron with the preset columns cleared', () => {
    expect(
      buildScheduleColumns({
        cadence: 'custom',
        cronExpression: '0 9 * * 1-5',
        dayOfWeek: 3,
        timeOfDay: '07:00',
      })
    ).toEqual({
      frequency: 'custom',
      dayOfWeek: null,
      dayOfMonth: null,
      timeOfDay: null,
      cronExpression: '0 9 * * 1-5',
    });
  });

  it('returns a null cron when a preset is incomplete', () => {
    expect(
      buildScheduleColumns({ cadence: 'weekly', timeOfDay: '09:00' }).cronExpression
    ).toBeNull();
  });
});

describe('isTemplateVisible', () => {
  it('shows own templates and shared templates, hides other users private ones', () => {
    expect(isTemplateVisible({ createdBy: 'u1', sharingScope: 'private' }, 'u1')).toBe(true);
    expect(isTemplateVisible({ createdBy: 'u2', sharingScope: 'team' }, 'u1')).toBe(true);
    expect(isTemplateVisible({ createdBy: 'u2', sharingScope: 'private' }, 'u1')).toBe(false);
  });
});

describe('normalizeScheduleRow', () => {
  it('maps a row to the view contract', () => {
    const view = normalizeScheduleRow(row(), 'user-1', FROM);
    expect(view).toEqual({
      id: 'sched-1',
      name: 'Weekly pipeline',
      description: null,
      templateId: 'tpl-1',
      templateName: 'Pipeline',
      templateHidden: false,
      reportId: null,
      cadence: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: '09:00',
      cronExpression: '0 9 * * 1',
      timezone: 'Europe/London',
      recipients: ['lead@example.invalid'],
      format: 'pdf',
      colorToken: 'blue',
      tags: ['Finance'],
      isActive: true,
      lastRunAt: null,
      nextRunAt: new Date('2026-10-19T08:00:00Z'),
      createdBy: 'user-1',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('hides the name of another user private template', () => {
    const view = normalizeScheduleRow(row(), 'user-2');
    expect(view.templateName).toBeNull();
    expect(view.templateHidden).toBe(true);
    expect(view.templateId).toBe('tpl-1');
  });

  it('reports no template without hiding anything', () => {
    const view = normalizeScheduleRow(row({ templateId: null, template: null }), 'user-1');
    expect(view.templateName).toBeNull();
    expect(view.templateHidden).toBe(false);
  });

  it('normalises legacy values instead of crashing', () => {
    const view = normalizeScheduleRow(
      row({
        name: null,
        frequency: 'hourly',
        format: 'docx',
        recipients: 'oops',
      }),
      'user-1'
    );
    expect(view.name).toBe('Untitled schedule');
    expect(view.cadence).toBe('custom');
    expect(view.format).toBe('pdf');
    expect(view.recipients).toEqual([]);
  });

  it('keeps only string recipients from a mixed legacy array', () => {
    const view = normalizeScheduleRow(
      row({ recipients: ['a@example.invalid', 7, null] }),
      'user-1'
    );
    expect(view.recipients).toEqual(['a@example.invalid']);
  });

  describe('next run on read (nothing advances the stored value before IFC-308)', () => {
    const LATER = new Date('2026-11-04T12:00:00Z'); // Wednesday, after the stored 2026-10-19 run

    it('computes the next occurrence from cron + timezone instead of a stale stored value', () => {
      const view = normalizeScheduleRow(row(), 'user-1', LATER);
      // Monday 2026-11-09 09:00 Europe/London (GMT) = 09:00Z
      expect(view.nextRunAt).toEqual(new Date('2026-11-09T09:00:00Z'));
    });

    it('never shows a past time for an active row', () => {
      const view = normalizeScheduleRow(
        row({ cronExpression: '30 7 1 * *', frequency: 'monthly', timezone: 'America/New_York' }),
        'user-1',
        LATER
      );
      expect(view.nextRunAt!.getTime()).toBeGreaterThan(LATER.getTime());
      expect(view.nextRunAt).toEqual(new Date('2026-12-01T12:30:00Z'));
    });

    it('shows no next run for a paused row, whatever is stored', () => {
      const view = normalizeScheduleRow(row({ isActive: false }), 'user-1', FROM);
      expect(view.nextRunAt).toBeNull();
    });

    it('falls back to a future stored value when the cron cannot be read', () => {
      const view = normalizeScheduleRow(row({ cronExpression: 'not a cron' }), 'user-1', FROM);
      expect(view.nextRunAt).toEqual(new Date('2026-10-19T08:00:00Z'));
    });

    it('drops a past stored value when there is no usable cron', () => {
      const view = normalizeScheduleRow(row({ cronExpression: null }), 'user-1', LATER);
      expect(view.nextRunAt).toBeNull();
    });
  });
});
