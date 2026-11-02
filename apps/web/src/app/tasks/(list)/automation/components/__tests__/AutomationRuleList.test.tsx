/**
 * @vitest-environment jsdom
 *
 * AutomationRuleList — PG-208 (AC-TA-002, -012, -013): summaries, owner rule,
 * last-run badge (no_eligible_owner prominent), suppressed count, next run,
 * tag chips with a legacy-colour fallback, controls, read-only, empty state.
 */
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';

import {
  AutomationRuleList,
  type AutomationRuleListHandle,
  type AutomationRuleListProps,
} from '../AutomationRuleList';
import type { RuleItem } from '../../task-automation-labels';

function rule(overrides: Partial<RuleItem> = {}): RuleItem {
  return {
    id: 'r1',
    name: 'Call new leads',
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
      { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u2'] },
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

function renderList(props: Partial<AutomationRuleListProps> = {}) {
  const ref = createRef<AutomationRuleListHandle>();
  const handlers = {
    onSave: vi.fn().mockResolvedValue(undefined),
    onToggle: vi.fn(),
    onMove: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onShowRuns: vi.fn(),
    onTest: vi.fn(),
    onRotateSecret: vi.fn(),
    onRegenerateUrl: vi.fn(),
  };
  render(
    <AutomationRuleList
      ref={ref}
      rules={[rule()]}
      events={[{ eventType: 'lead.created', label: 'Lead created' }]}
      tags={[]}
      members={[]}
      canEdit
      canManageWebhooks
      defaultTimezone="UTC"
      maxTags={10}
      isSaving={false}
      pendingToggleId={null}
      isReordering={false}
      {...handlers}
      {...props}
    />
  );
  return { ref, ...handlers };
}

describe('AutomationRuleList', () => {
  it('summarises the trigger, actions and owner rule', () => {
    renderList();
    expect(
      screen.getByText('Lead created → Create Task, then Assign Round-Robin')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tasks are created for: the record owner \(the rule creator/)
    ).toBeInTheDocument();
    expect(screen.getByText('Not run yet')).toBeInTheDocument();
  });

  it('shows the last run, suppressed runs, next run and an Off badge', () => {
    renderList({
      rules: [
        rule({
          isActive: false,
          lastRunAt: '2026-10-20T10:00:00.000Z',
          lastRunStatus: 'SUCCEEDED',
          lastRunOutcome: 'pool_empty_fallback_owner',
          suppressedCount: 3,
        }),
        rule({
          id: 'r2',
          name: 'Weekly',
          trigger: { type: 'SCHEDULE', cadence: 'daily', timeOfDay: '09:00', timezone: 'UTC' },
          nextRunAt: '2026-10-21T09:00:00.000Z',
          suppressedCount: 1,
          lastRunAt: '2026-10-20T09:00:00.000Z',
          lastRunStatus: 'FAILED',
          lastRunOutcome: null,
        }),
      ],
    });
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText(/Succeeded — No one in the round-robin group/)).toBeInTheDocument();
    expect(screen.getByText(/3 runs were skipped/)).toBeInTheDocument();
    expect(screen.getByText(/1 run was skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Next run/)).toBeInTheDocument();
    expect(screen.getByText(/: Failed$/)).toBeInTheDocument();
    expect(screen.getByText(/the person who created the rule/)).toBeInTheDocument();
  });

  it('shows a no_eligible_owner last run prominently', () => {
    renderList({
      rules: [
        rule({
          lastRunAt: '2026-10-20T10:00:00.000Z',
          lastRunStatus: 'SKIPPED',
          lastRunOutcome: 'no_eligible_owner',
        }),
      ],
    });
    const line = screen.getByText(/neither the record owner nor the rule creator/);
    expect(line.className).toMatch(/text-red-700/);
    expect(within(line).getByText('error')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders tag chips, with slate for a legacy colour token', () => {
    renderList({
      rules: [rule({ tags: ['Sales', 'Legacy'] })],
      tags: [
        {
          id: 'g1',
          name: 'Sales',
          colorToken: 'blue',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
        {
          id: 'g2',
          name: 'Legacy',
          colorToken: 'mauve',
          description: null,
          sortOrder: 1,
          isActive: true,
        },
      ],
    });
    const chips = screen.getByRole('list', { name: 'Tags of Call new leads' });
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2);
    const swatches = chips.querySelectorAll('span[aria-hidden="true"]');
    expect(swatches[1].className).toMatch(/slate/);
  });

  it('wires the row controls', () => {
    const handlers = renderList({
      rules: [
        rule({ id: 'r1', name: 'A', trigger: { type: 'WEBHOOK' } }),
        rule({ id: 'r2', name: 'B' }),
      ],
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Active: A' }));
    expect(handlers.onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Runs' })[0]);
    expect(handlers.onShowRuns).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Test Rule' })[0]);
    expect(handlers.onTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Secret' }));
    expect(handlers.onRotateSecret).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'New URL' }));
    expect(handlers.onRegenerateUrl).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
    expect(screen.getByRole('button', { name: 'Move Up: A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Down: B' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Up: B' }));
    expect(handlers.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), 'up');
  });

  it('leaves a manager only Runs, Test Rule and Move on a webhook rule', () => {
    const handlers = renderList({
      canManageWebhooks: false,
      rules: [
        rule({ id: 'r1', name: 'A', trigger: { type: 'WEBHOOK' } }),
        rule({ id: 'r2', name: 'B' }),
      ],
    });
    const webhookRow = screen.getByRole('group', { name: 'Actions for A' });
    for (const name of ['Edit', 'Delete', 'Rotate Secret', 'New URL']) {
      expect(within(webhookRow).queryByRole('button', { name })).toBeNull();
    }
    expect(within(webhookRow).queryByRole('switch')).toBeNull();
    expect(within(webhookRow).getByText('Only admins can change webhook rules')).toBeVisible();
    fireEvent.click(within(webhookRow).getByRole('button', { name: 'Runs' }));
    expect(handlers.onShowRuns).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    fireEvent.click(within(webhookRow).getByRole('button', { name: 'Test Rule' }));
    expect(handlers.onTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    fireEvent.click(within(webhookRow).getByRole('button', { name: 'Move Down: A' }));
    expect(handlers.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'down');

    // The manager keeps every control on an ordinary rule.
    const otherRow = screen.getByRole('group', { name: 'Actions for B' });
    expect(within(otherRow).getByRole('switch', { name: 'Active: B' })).toBeEnabled();
    expect(within(otherRow).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(otherRow).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('keeps the switch beside the buttons and disables it while pending', () => {
    renderList({ pendingToggleId: 'r1', isReordering: true });
    const toggle = screen.getByRole('switch', { name: 'Active: Call new leads' });
    expect(toggle).toBeDisabled();
    expect(toggle.closest('button')?.contains(screen.getByRole('button', { name: 'Edit' }))).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Move Down: Call new leads' })).toBeDisabled();
  });

  it('moves focus to the other move button at an edge', async () => {
    const { onMove } = renderList({
      rules: [rule({ id: 'r1', name: 'A' }), rule({ id: 'r2', name: 'B' })],
    });
    onMove.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Move Up: B' }));
    // Data is unchanged in this test, so B is still second: Move Up stays enabled.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Up: B' }))
    );
  });

  it('ignores a failed move', async () => {
    const { onMove } = renderList({
      rules: [rule({ id: 'r1', name: 'A' }), rule({ id: 'r2', name: 'B' })],
    });
    onMove.mockRejectedValue(new Error('nope'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Down: A' }));
    await vi.waitFor(() => expect(onMove).toHaveBeenCalled());
  });

  it('is read-only without edit rights', () => {
    renderList({ canEdit: false });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Call new leads')).toBeInTheDocument();
  });

  it('shows the passive empty state and opens the create dialog through the ref', async () => {
    const { ref } = renderList({ rules: [] });
    expect(screen.queryByRole('list', { name: 'Automation rules' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    act(() => ref.current?.openCreate());
    expect(await screen.findByRole('dialog', { name: 'New Rule' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the dialog after a save and shows a fallback message for non-Error refusals', async () => {
    const { ref, onSave } = renderList();
    onSave.mockRejectedValueOnce('nope');
    act(() => ref.current?.openCreate());
    const dialog = await screen.findByRole('dialog', { name: 'New Rule' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'N' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'T' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The rule could not be saved.'
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
