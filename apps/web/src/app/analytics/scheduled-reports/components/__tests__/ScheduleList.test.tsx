/**
 * ScheduleList Tests — PG-201
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScheduleList, formatNextRun, formatLabel, type ScheduleItem } from '../ScheduleList';

function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
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
    nextRunAt: '2026-10-19T08:00:00.000Z',
    createdBy: 'u1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(props: Partial<Parameters<typeof ScheduleList>[0]> = {}) {
  const handlers = { onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <ScheduleList schedules={[schedule()]} canEdit pendingId={null} {...handlers} {...props} />
  );
  return handlers;
}

describe('ScheduleList', () => {
  it('shows the schedule copy in a passive empty state without a button', () => {
    renderList({ schedules: [] });
    expect(screen.getByText('No scheduled reports yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a row with name, template, cadence, format, recipients, tags and next run', () => {
    renderList();
    const row = screen.getByTestId('schedule-row-s1');
    expect(within(row).getByText('Weekly pipeline')).toBeInTheDocument();
    expect(within(row).getByText('Pipeline')).toBeInTheDocument();
    expect(within(row).getByText('Every Monday at 09:00 (Europe/London)')).toBeInTheDocument();
    expect(within(row).getByText('PDF')).toBeInTheDocument();
    expect(within(row).getByText('1 recipient')).toBeInTheDocument();
    expect(within(row).getByText('Finance')).toBeInTheDocument();
    expect(within(row).getByText(/^Next run: /)).toBeInTheDocument();
  });

  it('pluralises recipients and shows Paused for inactive schedules', () => {
    renderList({
      schedules: [
        schedule({ isActive: false, recipients: ['a@example.invalid', 'b@example.invalid'] }),
      ],
    });
    expect(screen.getByText('2 recipients')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('labels hidden, missing and report-definition references', () => {
    renderList({
      schedules: [
        schedule({ id: 'a', templateName: null, templateHidden: true }),
        schedule({ id: 'b', templateId: null, templateName: null }),
        schedule({ id: 'c', templateId: null, templateName: null, reportId: 'rep-1' }),
      ],
    });
    expect(screen.getByText('Private template')).toBeInTheDocument();
    expect(screen.getByText('No template — choose one to activate')).toBeInTheDocument();
    expect(screen.getByText('Report definition')).toBeInTheDocument();
  });

  it('wires the switch, edit and delete with named controls', () => {
    const { onToggle, onEdit, onDelete } = renderList();
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Weekly pipeline' }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly pipeline' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly pipeline' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('is read-only for non-managers', () => {
    renderList({ canEdit: false });
    expect(screen.getByRole('switch', { name: 'Active: Weekly pipeline' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('keeps the pending switch focusable but ignores repeat toggles', () => {
    const { onToggle } = renderList({ pendingId: 's1' });
    const toggle = screen.getByRole('switch', { name: 'Active: Weekly pipeline' });
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit Weekly pipeline' })).toBeDisabled();
  });
});

describe('formatNextRun / formatLabel', () => {
  it('formats in the schedule timezone', () => {
    expect(formatNextRun('2026-10-19T08:00:00.000Z', 'Europe/London')).toMatch(/09:00/);
  });

  it('falls back to ISO for an unknown timezone', () => {
    expect(formatNextRun('2026-10-19T08:00:00.000Z', 'Not/AZone')).toBe('2026-10-19T08:00:00.000Z');
  });

  it('labels every format', () => {
    expect((['pdf', 'csv', 'email_body', 'excel'] as const).map((f) => formatLabel(f))).toEqual([
      'PDF',
      'CSV',
      'Email body',
      'Excel',
    ]);
  });
});
