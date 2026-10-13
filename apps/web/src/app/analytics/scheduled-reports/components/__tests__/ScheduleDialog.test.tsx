/**
 * ScheduleDialog Tests — PG-201
 * Create/edit, cadence presets vs custom cron, inline validation + focus,
 * duplicate-name superRefine, recipients parsing, accessibility wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

// Host-independent stand-in: the real selector lists the runtime's IANA zones.
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: string;
    onChange: (tz: string) => void;
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="Europe/London">Europe/London</option>
      <option value="America/New_York">America/New_York</option>
    </select>
  ),
}));

import { ScheduleDialog, parseRecipients } from '../ScheduleDialog';
import type { ScheduleItem } from '../ScheduleList';

const TEMPLATE_ID = 'clh3x2k8a0000qz8l1v2r3s4t';
const templates = [{ id: TEMPLATE_ID, name: 'Pipeline' }];
const tags = [
  {
    id: 't1',
    name: 'Finance',
    colorToken: 'blue',
    description: null,
    sortOrder: 0,
    isActive: true,
  },
];

function existingSchedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 's1',
    name: 'Weekly pipeline',
    description: 'Old description',
    templateId: TEMPLATE_ID,
    templateName: 'Pipeline',
    templateHidden: false,
    reportId: null,
    cadence: 'monthly',
    dayOfWeek: null,
    dayOfMonth: 15,
    timeOfDay: '07:00',
    cronExpression: '0 7 15 * *',
    timezone: 'Europe/London',
    recipients: ['lead@example.invalid'],
    format: 'csv',
    colorToken: 'teal',
    tags: [],
    isActive: false,
    lastRunAt: null,
    nextRunAt: null,
    createdBy: 'u1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(props: Partial<Parameters<typeof ScheduleDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ScheduleDialog
      open
      onOpenChange={onOpenChange}
      schedule={null}
      templates={templates}
      tags={tags}
      existingNames={[{ id: 'other', name: 'Monthly revenue' }]}
      isSaving={false}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onOpenChange };
}

function fillValidCreate() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Weekly pipeline' } });
  fireEvent.change(screen.getByLabelText(/^Report template/), { target: { value: TEMPLATE_ID } });
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Europe/London' } });
  fireEvent.change(screen.getByLabelText(/^Recipients/), {
    target: { value: 'Lead@Example.invalid\nops@example.invalid' },
  });
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));

describe('ScheduleDialog', () => {
  it('creates a weekly schedule with the full payload', async () => {
    const { onSubmit } = renderDialog();
    fillValidCreate();
    fireEvent.change(screen.getByLabelText('Day of the week'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '08:15' } });
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Finance' }));
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'create',
      input: {
        name: 'Weekly pipeline',
        templateId: TEMPLATE_ID,
        cadence: 'weekly',
        dayOfWeek: 2,
        timeOfDay: '08:15',
        timezone: 'Europe/London',
        recipients: ['lead@example.invalid', 'ops@example.invalid'],
        format: 'csv',
        colorToken: 'slate',
        tags: ['Finance'],
        isActive: true,
      },
    });
  });

  it('shows the cadence preview in a polite live region', () => {
    renderDialog();
    const preview = screen.getByTestId('schedule-preview');
    expect(preview).toHaveAttribute('aria-live', 'polite');
    expect(preview).toHaveTextContent('Every Monday at 09:00');
  });

  it('switches to a custom cron and previews it', async () => {
    const { onSubmit } = renderDialog();
    fillValidCreate();
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'custom' } });
    expect(screen.queryByLabelText('Time of day')).toBeNull();
    const cron = screen.getByLabelText('Cron expression');
    expect(cron).toHaveAttribute('aria-describedby', 'schedule-cron-hint');
    fireEvent.change(cron, { target: { value: '0 9 * * 1-5' } });
    expect(screen.getByTestId('schedule-preview')).toHaveTextContent(
      'Custom schedule: 0 9 * * 1-5 (Europe/London)'
    );
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].input).toMatchObject({
      cadence: 'custom',
      cronExpression: '0 9 * * 1-5',
    });
    expect(onSubmit.mock.calls[0][0].input).not.toHaveProperty('timeOfDay');
  });

  it('asks for a day of the month for monthly and quarterly', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'quarterly' } });
    expect(screen.queryByLabelText('Day of the week')).toBeNull();
    fireEvent.change(screen.getByLabelText('Day of the month'), { target: { value: '15' } });
    expect(screen.getByTestId('schedule-preview')).toHaveTextContent(
      'Quarterly (Jan, Apr, Jul, Oct) on day 15 at 09:00'
    );
  });

  it('shows inline errors, marks fields invalid and focuses the first one', async () => {
    const { onSubmit } = renderDialog();
    save();
    const name = screen.getByLabelText(/^Name/);
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveAttribute('aria-describedby', 'schedule-name-error');
    expect(screen.getByText('Choose a report template.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one recipient.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Recipients/)).toHaveAttribute(
      'aria-describedby',
      'schedule-recipients-hint schedule-recipients-error'
    );
    expect(document.activeElement).toBe(name);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name (case-insensitive) before calling the API', async () => {
    const { onSubmit } = renderDialog();
    fillValidCreate();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'MONTHLY revenue' } });
    save();
    expect(
      await screen.findByText('A scheduled report with this name already exists.')
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a duplicate recipient', async () => {
    renderDialog();
    fillValidCreate();
    fireEvent.change(screen.getByLabelText(/^Recipients/), {
      target: { value: 'a@example.invalid, A@example.invalid' },
    });
    save();
    expect(await screen.findByText(/Duplicate recipient/)).toBeInTheDocument();
  });

  it('edits an existing schedule and sends an update with its id', async () => {
    const { onSubmit } = renderDialog({ schedule: existingSchedule() });
    expect(screen.getByRole('heading', { name: 'Edit Scheduled Report' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Weekly pipeline');
    expect(screen.getByLabelText('Day of the month')).toHaveValue('15');
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: '' } });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      kind: 'update',
      input: expect.objectContaining({
        id: 's1',
        name: 'Weekly pipeline',
        description: '',
        cadence: 'monthly',
        dayOfMonth: 15,
        timeOfDay: '07:00',
        format: 'csv',
        colorToken: 'teal',
        isActive: false,
      }),
    });
    // The template is unchanged, so it is not re-sent (no visibility re-check).
    expect(onSubmit.mock.calls[0][0].input).not.toHaveProperty('templateId');
  });

  it('sends a newly chosen template on update', async () => {
    const other = 'clh3x2k8a0002qz8l1v2r3s4t';
    const { onSubmit } = renderDialog({
      schedule: existingSchedule(),
      templates: [...templates, { id: other, name: 'Revenue' }],
    });
    fireEvent.change(screen.getByLabelText(/^Report template/), { target: { value: other } });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].input).toMatchObject({ templateId: other });
  });

  it('marks required fields and names the format radio group', () => {
    renderDialog();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/^Recipients/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Delivery format' })).toBeInTheDocument();
    expect(screen.getByTestId('schedule-preview')).toHaveAttribute('aria-atomic', 'true');
  });

  it('names the no-templates message by the template label', () => {
    renderDialog({ templates: [] });
    const message = screen.getByText(/No report templates yet/);
    expect(message).toHaveAttribute('aria-labelledby', 'schedule-template-label');
  });

  it('keeps a template the user cannot see selectable for an existing schedule', () => {
    renderDialog({ schedule: existingSchedule({ templateId: 'clh3x2k8a0009qz8l1v2r3s4t' }) });
    expect(
      screen.getByRole('option', { name: 'Current template (not visible to you)' })
    ).toBeInTheDocument();
  });

  it('links to Report Templates when there are none', () => {
    renderDialog({ templates: [] });
    expect(screen.getByRole('link', { name: 'Create a report template' })).toHaveAttribute(
      'href',
      '/analytics/report-templates'
    );
  });

  it('explains when there are no tags', () => {
    renderDialog({ tags: [] });
    expect(screen.getByText('No tags yet. Create tags in the Tags card.')).toBeInTheDocument();
  });

  it('shows the API error and keeps the dialog when saving fails', async () => {
    renderDialog({ onSubmit: vi.fn().mockRejectedValue(new Error('Name already taken')) });
    fillValidCreate();
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Name already taken');
  });

  it('shows a generic error for a non-Error rejection', async () => {
    renderDialog({ onSubmit: vi.fn().mockRejectedValue('boom') });
    fillValidCreate();
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('The schedule could not be saved.');
  });

  it('toggles active, unticks a tag and changes the colour', async () => {
    const { onSubmit } = renderDialog({ schedule: existingSchedule({ tags: ['Finance'] }) });
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Finance' }));
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'rose' } });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].input).toMatchObject({
      isActive: true,
      tags: [],
      colorToken: 'rose',
    });
  });

  it('Cancel closes the dialog and is disabled while saving', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables the actions while saving', () => {
    renderDialog({ isSaving: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('parseRecipients', () => {
  it('splits on newlines, commas and semicolons and drops blanks', () => {
    expect(parseRecipients(' a@example.invalid,\n\nb@example.invalid; c@example.invalid ')).toEqual(
      ['a@example.invalid', 'b@example.invalid', 'c@example.invalid']
    );
  });
});
