/**
 * @vitest-environment jsdom
 *
 * AutomationRuleDialog — PG-208 (AC-TA-003, -007, -019): trigger switching,
 * stage filter only for stage changes, fixed action order, inline errors with
 * aria wiring, duplicate-rule warning, help texts (M5, M7, M13), keyboard submit.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="Europe/London">Europe/London</option>
      <option value="Asia/Tokyo">Asia/Tokyo</option>
    </select>
  ),
}));

import { AutomationRuleDialog, type AutomationRuleDialogProps } from '../AutomationRuleDialog';
import type { RuleItem } from '../../task-automation-labels';

const EVENTS = [
  { eventType: 'lead.created', label: 'Lead created' },
  { eventType: 'opportunity.stage_changed', label: 'Deal stage changed' },
];

function existing(overrides: Partial<RuleItem> = {}): RuleItem {
  return {
    id: 'r1',
    name: 'Existing',
    description: null,
    isActive: true,
    sortOrder: 0,
    tags: [],
    trigger: { type: 'ENTITY_EVENT', eventType: 'lead.created' },
    actions: [
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Call',
        descriptionTemplate: null,
        priority: 'MEDIUM',
        dueInDays: 1,
        linkToRecord: true,
      },
    ],
    webhookTokenPrefix: null,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunOutcome: null,
    suppressedCount: 0,
    createdBy: 'u1',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(props: Partial<AutomationRuleDialogProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <AutomationRuleDialog
      open
      onOpenChange={onOpenChange}
      rule={null}
      rules={[]}
      events={EVENTS}
      tags={[]}
      members={[
        { id: 'u2', name: 'Ada' },
        { id: 'u3', name: 'Rex' },
      ]}
      canManageWebhooks
      defaultTimezone="Europe/London"
      isSaving={false}
      serverError={null}
      maxTags={2}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('AutomationRuleDialog', () => {
  it('labels the Trigger and Actions fieldsets and explains when rules apply', () => {
    const { dialog } = renderDialog();
    expect(within(dialog).getByRole('group', { name: 'Trigger' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Actions' })).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Rules apply to events that happen after you save/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/produce tasks owned by the\s+system user/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('0 = end of today (UTC). Leave empty for no due date.')
    ).toBeInTheDocument();
  });

  it('shows the stage filter only for "Deal stage changed"', () => {
    const { dialog } = renderDialog();
    expect(within(dialog).queryByLabelText('To stage (optional)')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Event'), {
      target: { value: 'opportunity.stage_changed' },
    });
    const stage = within(dialog).getByLabelText('To stage (optional)');
    fireEvent.change(stage, { target: { value: 'PROPOSAL' } });
    expect((stage as HTMLSelectElement).value).toBe('PROPOSAL');
    fireEvent.change(stage, { target: { value: '__any__' } });
    expect((stage as HTMLSelectElement).value).toBe('__any__');
    // Title and description pickers both offer the stage variable now.
    expect(within(dialog).getAllByText('{{stage.new}}')).toHaveLength(2);
  });

  it('switches to a schedule trigger with cadence, timezone and its due-date help', async () => {
    const { dialog, onSubmit } = renderDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'On a schedule' }));
    expect(within(dialog).getByLabelText('Cadence')).toBeInTheDocument();
    expect(within(dialog).getByText(/in the rule’s timezone/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Link the task to the record')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Cadence'), { target: { value: 'weekly' } });
    fireEvent.change(within(dialog).getByLabelText('Day of the week'), { target: { value: '5' } });
    fireEvent.change(within(dialog).getByLabelText('Timezone'), {
      target: { value: 'Asia/Tokyo' },
    });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Friday review' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), {
      target: { value: 'Review {{schedule.date}}' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].trigger).toEqual({
      type: 'SCHEDULE',
      cadence: 'weekly',
      timezone: 'Asia/Tokyo',
      dayOfWeek: 5,
      timeOfDay: '09:00',
    });
    expect(onSubmit.mock.calls[0][1]).toBeNull();
  });

  it('explains the webhook trigger and hides it from non-webhook admins', () => {
    const { dialog } = renderDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: /webhook/i }));
    expect(within(dialog).getByText(/shown once/)).toBeInTheDocument();
  });

  it('offers no webhook option without webhook rights', () => {
    const { dialog } = renderDialog({ canManageWebhooks: false });
    expect(within(dialog).queryByRole('radio', { name: /webhook/i })).toBeNull();
  });

  it('locks the trigger type when editing and saves with the rule id', async () => {
    const { dialog, onSubmit } = renderDialog({ rule: existing() });
    expect(within(dialog).getByRole('heading', { name: 'Edit Rule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'On a schedule' })).toBeDisabled();
    expect(within(dialog).getByText(/cannot change after a rule is created/)).toBeInTheDocument();
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Existing');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.any(Object), 'r1'));
  });

  it('numbers the optional actions in their fixed order and submits all three', async () => {
    const { dialog, onSubmit } = renderDialog();
    expect(within(dialog).getByText('2. Assign Round-Robin')).toBeInTheDocument();
    expect(within(dialog).getByText('2. Notify')).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Assign the task in turn to a group' })
    );
    expect(within(dialog).getByText('3. Notify')).toBeInTheDocument();
    expect(within(dialog).getByText(/in the order picked/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Rex/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Send an in-app notification' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'The task owner' }));
    fireEvent.change(within(dialog).getByLabelText('Message (optional)'), {
      target: { value: 'Heads up' },
    });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Route leads' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'Call' } });
    fireEvent.change(within(dialog).getByLabelText('Task description (optional)'), {
      target: { value: 'About {{record.name}}' },
    });
    fireEvent.change(within(dialog).getByLabelText('Due in days (optional)'), {
      target: { value: '0' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Link the task to the record' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const input = onSubmit.mock.calls[0][0];
    expect(input.actions).toEqual([
      {
        type: 'CREATE_TASK',
        titleTemplate: 'Call',
        descriptionTemplate: 'About {{record.name}}',
        priority: 'MEDIUM',
        dueInDays: 0,
        linkToRecord: false,
      },
      { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u3'] },
      {
        type: 'NOTIFY',
        recipients: { assignee: true, owner: true, userIds: [] },
        message: 'Heads up',
      },
    ]);
  });

  it('shows inline errors wired with aria-invalid / aria-describedby and focuses the first', async () => {
    const { dialog, onSubmit } = renderDialog();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Send an in-app notification' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'The task assignee' }));
    fireEvent.change(within(dialog).getByLabelText('Due in days (optional)'), {
      target: { value: 'soon' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    const name = within(dialog).getByLabelText('Name');
    expect(await within(dialog).findByText('Enter a name.')).toBeInTheDocument();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('rule-name-error');
    const title = within(dialog).getByLabelText('Task title');
    expect(title.getAttribute('aria-describedby')).toBe('rule-title-error');
    expect(
      within(dialog).getByLabelText('Due in days (optional)').getAttribute('aria-describedby')
    ).toBe('rule-due-help rule-due-error');
    expect(within(dialog).getByText('Choose at least one recipient.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('warns when an active rule already does the same thing', () => {
    const { dialog } = renderDialog({ rules: [existing()] });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'Call' } });
    expect(
      within(dialog).getByText(/The active rule “Existing” already does this/)
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Event'), {
      target: { value: 'opportunity.stage_changed' },
    });
    expect(within(dialog).queryByText(/already does this/)).toBeNull();
  });

  it('shows the server refusal and keeps the dialog when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('conflict'));
    const { dialog } = renderDialog({ onSubmit, serverError: 'An active rule already does this.' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'An active rule already does this.'
    );
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'N' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'T' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('submits from the keyboard (Enter in a field) and cancels', async () => {
    const { dialog, onSubmit, onOpenChange } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Keyboard' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'Call' } });
    fireEvent.submit(within(dialog).getByLabelText('Name').closest('form') as HTMLFormElement);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('picks catalogue tags up to the limit', async () => {
    const tags = ['A', 'B', 'C'].map((name, i) => ({
      id: `g${i}`,
      name,
      colorToken: 'blue',
      description: null,
      sortOrder: i,
      isActive: true,
    }));
    const { dialog, onSubmit } = renderDialog({ tags });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'A' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'B' }));
    expect(within(dialog).getByRole('checkbox', { name: 'C' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'A' }));
    expect(within(dialog).getByRole('checkbox', { name: 'C' })).not.toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Tagged' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'T' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].tags).toEqual(['B']);
  });

  it('says when there are no tags and disables the form while saving', () => {
    const { dialog } = renderDialog({ isSaving: true });
    expect(within(dialog).getByText(/No tags yet/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
