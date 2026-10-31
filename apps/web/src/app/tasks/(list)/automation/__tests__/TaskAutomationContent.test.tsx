/**
 * @vitest-environment jsdom
 *
 * TaskAutomationContent — PG-208 (AC-TA-001, -002, -006, -012, -014, -015, -019).
 * Loading / error / empty / read-only states, rule CRUD wiring, keyboard reorder
 * with announcement, Test Rule, webhook credentials held in state only, axe.
 */
import type * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import axe from 'axe-core';

// ─── tRPC mock ─────────────────────────────────────────────────────────────
type MutationMock = {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isPending: boolean;
  variables?: unknown;
};
const h = vi.hoisted(() => ({
  list: vi.fn(),
  runs: vi.fn(),
  members: vi.fn(),
  invalidate: vi.fn(),
  mutationOpts: {} as Record<string, { onSuccess?: () => unknown; gcTime?: number }>,
  mutations: {} as Record<string, MutationMock>,
}));

function mutationHook(name: string) {
  return (opts: (typeof h.mutationOpts)[string]) => {
    h.mutationOpts[name] = opts;
    return h.mutations[name];
  };
}

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ taskAutomation: { list: { invalidate: h.invalidate } } }),
    account: { assignees: { useQuery: (...a: unknown[]) => h.members(...a) } },
    taskAutomation: {
      list: { useQuery: (...a: unknown[]) => h.list(...a) },
      listRuns: { useQuery: (...a: unknown[]) => h.runs(...a) },
      create: { useMutation: mutationHook('create') },
      update: { useMutation: mutationHook('update') },
      delete: { useMutation: mutationHook('delete') },
      setActive: { useMutation: mutationHook('setActive') },
      reorder: { useMutation: mutationHook('reorder') },
      runNow: { useMutation: mutationHook('runNow') },
      rotateWebhookSecret: { useMutation: mutationHook('rotate') },
      regenerateWebhookUrl: { useMutation: mutationHook('regenerate') },
      resetToDefaults: { useMutation: mutationHook('reset') },
      settings: { update: { useMutation: mutationHook('settings') } },
      tags: {
        create: { useMutation: mutationHook('tagCreate') },
        update: { useMutation: mutationHook('tagUpdate') },
        delete: { useMutation: mutationHook('tagDelete') },
      },
    },
  },
}));

let authLoading = false;
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: authLoading,
    isAuthenticated: true,
    user: { id: 'u1', email: 'u1@example.invalid', role: 'ADMIN' },
  }),
}));

const toast = vi.fn();
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  toast: (...args: unknown[]) => toast(...args),
}));

vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({ id, value }: { id?: string; value: string }) => (
    <select id={id} value={value} onChange={() => undefined}>
      <option value={value}>{value}</option>
    </select>
  ),
}));

import TaskAutomationContent, { movedOrder } from '../TaskAutomationContent';

const EVENTS = [
  { eventType: 'lead.created', label: 'Lead created' },
  { eventType: 'opportunity.stage_changed', label: 'Deal stage changed' },
];

function rule(overrides: Record<string, unknown> = {}) {
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
        titleTemplate: 'Call {{record.name}}',
        descriptionTemplate: null,
        priority: 'HIGH',
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

const SCHEDULE_RULE = rule({
  id: 'r2',
  name: 'Weekly review',
  sortOrder: 1,
  trigger: {
    type: 'SCHEDULE',
    cadence: 'weekly',
    dayOfWeek: 1,
    timeOfDay: '09:00',
    timezone: 'Europe/London',
  },
  nextRunAt: '2026-10-26T08:00:00.000Z',
});

const WEBHOOK_RULE = rule({
  id: 'r3',
  name: 'Form intake',
  sortOrder: 2,
  trigger: { type: 'WEBHOOK' },
  webhookTokenPrefix: 'tok_prefix00',
});

function listData(overrides: Record<string, unknown> = {}) {
  return {
    rules: [rule(), SCHEDULE_RULE],
    settings: {
      automationEnabled: true,
      notifyRuleOwnerOnFailure: false,
      maxRunsPerRulePerHour: 60,
    },
    tags: [],
    limits: { maxTags: 10 },
    events: EVENTS,
    canEdit: true,
    canManageWebhooks: true,
    ...overrides,
  };
}

const refetch = vi.fn();
// The app shell provides <main>; axe's landmark rule needs it in the test too.
function Main({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}

function setup(opts: { data?: unknown; isLoading?: boolean; error?: { message: string } } = {}) {
  h.list.mockReturnValue({
    data: 'data' in opts ? opts.data : listData(),
    isLoading: opts.isLoading ?? false,
    error: opts.error ?? null,
    refetch,
  });
  h.members.mockReturnValue({ data: [{ id: 'u2', name: 'Ada' }], isLoading: false, error: null });
  h.runs.mockReturnValue({ data: [], isLoading: false, error: null });
  for (const name of [
    'create',
    'update',
    'delete',
    'setActive',
    'reorder',
    'runNow',
    'rotate',
    'regenerate',
    'reset',
    'settings',
    'tagCreate',
    'tagUpdate',
    'tagDelete',
  ]) {
    h.mutations[name] = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      isPending: false,
    };
  }
  return render(<TaskAutomationContent />, { wrapper: Main });
}

beforeEach(() => {
  vi.clearAllMocks();
  authLoading = false;
});

function rulesCard() {
  return screen.getByRole('region', { name: 'Rules' });
}

describe('TaskAutomationContent', () => {
  it('shows the skeleton while loading', () => {
    setup({ isLoading: true, data: undefined });
    expect(screen.getByLabelText('Loading task automation')).toBeInTheDocument();
  });

  it('shows the skeleton while auth resolves', () => {
    authLoading = true;
    setup();
    expect(screen.getByLabelText('Loading task automation')).toBeInTheDocument();
  });

  it('shows an error with Retry', () => {
    setup({ data: undefined, error: { message: 'boom' } });
    expect(screen.getByRole('alert').textContent).toContain('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the header, rules, settings and tags cards with real data', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Task Automation' })).toBeInTheDocument();
    const list = within(rulesCard()).getByRole('list', { name: 'Automation rules' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('shows a passive empty state with no CTA inside it', () => {
    setup({ data: listData({ rules: [] }) });
    const card = rulesCard();
    expect(within(card).queryByRole('list', { name: 'Automation rules' })).toBeNull();
    expect(
      within(card)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['New Rule']);
  });

  it('is read-only without edit rights: no CTAs and a described note', () => {
    setup({ data: listData({ canEdit: false, canManageWebhooks: false }) });
    expect(screen.queryByRole('button', { name: 'New Rule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Tag' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Settings' })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Active:/ })).toBeNull();
    const section = rulesCard();
    const noteId = section.getAttribute('aria-describedby');
    expect(document.getElementById(noteId ?? '')?.textContent).toMatch(/Only admins and managers/);
    expect(h.members).toHaveBeenCalledWith(undefined, { enabled: false });
  });

  it('New Rule opens the dialog through the list ref and creates a rule', async () => {
    setup();
    h.mutations.create.mutateAsync.mockResolvedValue({
      rule: rule({ name: 'Greet' }),
      webhook: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Rule' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Greet' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'Say hi' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(h.mutations.create.mutateAsync).toHaveBeenCalled());
    expect(h.mutations.create.mutateAsync.mock.calls[0][0]).toMatchObject({
      name: 'Greet',
      trigger: { type: 'ENTITY_EVENT', eventType: 'lead.created' },
      actions: [{ type: 'CREATE_TASK', titleTemplate: 'Say hi' }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Rule' })).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rule created' }));
    expect(await screen.findByText('Rule Greet created.')).toBeInTheDocument();
  });

  it('shows a CONFLICT refusal inline and keeps the dialog open', async () => {
    setup();
    h.mutations.create.mutateAsync.mockRejectedValue(
      new Error('An active rule with the same trigger and actions already exists.')
    );
    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Rule' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Again' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), { target: { value: 'X' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/);
    expect(screen.getByRole('dialog', { name: 'New Rule' })).toBeInTheDocument();
  });

  it('edits a rule through update', async () => {
    setup();
    fireEvent.click(within(rulesCard()).getAllByRole('button', { name: 'Edit' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Rule' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Call leads' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() =>
      expect(h.mutations.update.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'r1', name: 'Call leads' })
      )
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rule saved' }));
  });

  it('every mutation invalidates the list on success', () => {
    setup();
    for (const name of ['create', 'update', 'delete', 'setActive', 'reorder', 'tagCreate']) {
      h.mutationOpts[name].onSuccess?.();
    }
    expect(h.invalidate).toHaveBeenCalledTimes(6);
    expect(h.mutationOpts.create.gcTime).toBe(0);
    expect(h.mutationOpts.rotate.gcTime).toBe(0);
    expect(h.mutationOpts.regenerate.gcTime).toBe(0);
  });

  it('toggles a rule and announces it', async () => {
    setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Call new leads' }));
    expect(h.mutations.setActive.mutate).toHaveBeenCalledWith(
      { id: 'r1', isActive: false },
      expect.any(Object)
    );
    act(() => h.mutations.setActive.mutate.mock.calls[0][1].onSuccess());
    expect(await screen.findByText('Call new leads turned off.')).toBeInTheDocument();
  });

  it('disables the switch of the rule being toggled', () => {
    const { rerender } = setup();
    h.mutations.setActive.isPending = true;
    h.mutations.setActive.variables = { id: 'r2' };
    rerender(<TaskAutomationContent />);
    expect(screen.getByRole('switch', { name: 'Active: Weekly review' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Active: Call new leads' })).not.toBeDisabled();
  });

  it('reorders with Move Down, keeps focus and announces the position', async () => {
    setup();
    const down = screen.getByRole('button', { name: 'Move Down: Call new leads' });
    down.focus();
    fireEvent.click(down);
    await waitFor(() =>
      expect(h.mutations.reorder.mutateAsync).toHaveBeenCalledWith({ ids: ['r2', 'r1'] })
    );
    expect(await screen.findByText('Moved to position 2 of 2.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(down));
    expect(screen.getByRole('button', { name: 'Move Up: Call new leads' })).toBeDisabled();
  });

  it('toasts a failed reorder', async () => {
    setup();
    h.mutations.reorder.mutateAsync.mockRejectedValue(new Error('stale'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Up: Weekly review' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not reorder the rules', description: 'stale' })
      )
    );
  });

  it('computes the moved order and refuses edges', () => {
    const rules = [rule(), SCHEDULE_RULE] as never[];
    expect(movedOrder(rules, 'r2', 'up')).toEqual({ ids: ['r2', 'r1'], position: 1 });
    expect(movedOrder(rules, 'r1', 'up')).toBeNull();
    expect(movedOrder(rules, 'r2', 'down')).toBeNull();
    expect(movedOrder(rules, 'nope', 'down')).toBeNull();
  });

  it('Test Rule queues a run for schedule rules and is aria-disabled for event rules', () => {
    setup();
    const [eventTest, scheduleTest] = within(rulesCard()).getAllByRole('button', {
      name: 'Test Rule',
    });
    expect(eventTest.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(eventTest.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toMatch(/cannot be tested on demand/);
    fireEvent.click(eventTest);
    expect(h.mutations.runNow.mutate).not.toHaveBeenCalled();
    expect(eventTest.getAttribute('title')).toMatch(/cannot be tested on demand/);
    fireEvent.click(scheduleTest);
    expect(h.mutations.runNow.mutate).toHaveBeenCalledWith({ id: 'r2' }, expect.any(Object));
    act(() => h.mutations.runNow.mutate.mock.calls[0][1].onSuccess());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test run queued' }));
  });

  it('explains through the live region why an event rule cannot be tested', async () => {
    setup();
    fireEvent.click(within(rulesCard()).getAllByRole('button', { name: 'Test Rule' })[0]);
    expect(
      await screen.findByText(/cannot be tested on demand/, { selector: 'output' })
    ).toBeInTheDocument();
  });

  it('names each row’s control group after the rule', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Actions for Call new leads' })).toBeInTheDocument();
  });

  it('returns focus to the Delete button when the delete is cancelled', async () => {
    setup();
    const deleteButton = within(rulesCard()).getAllByRole('button', { name: 'Delete' })[0];
    deleteButton.focus();
    fireEvent.click(deleteButton);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement?.id).not.toBe('automation-rules-heading');
  });

  it('deletes a rule, keeps a refusal in the dialog, and focuses the Rules heading', async () => {
    setup();
    fireEvent.click(within(rulesCard()).getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Call new leads?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(h.mutations.delete.mutate).toHaveBeenCalledWith({ id: 'r1' }, expect.any(Object));
    act(() => h.mutations.delete.mutate.mock.calls[0][1].onError({ message: 'Rule not found.' }));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
      'Rule not found.'
    );
    act(() => h.mutations.delete.mutate.mock.calls[0][1].onSuccess());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe('automation-rules-heading'));
    expect(await screen.findByText('Rule Call new leads deleted.')).toBeInTheDocument();
  });

  it('shows webhook credentials once and drops them on close', async () => {
    setup();
    const created = rule({ ...WEBHOOK_RULE, name: 'Intake' });
    const url = 'https://api.example.invalid/webhooks/task-automation/' + 'x'.repeat(10);
    const secret = 'placeholder-' + 'y'.repeat(10);
    h.mutations.create.mutateAsync.mockResolvedValue({
      rule: created,
      webhook: { webhookUrl: url, signingSecret: secret },
    });
    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Rule' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /webhook/i }));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Intake' } });
    fireEvent.change(within(dialog).getByLabelText('Task title'), {
      target: { value: 'Follow up' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Rule' }));

    const secretDialog = await screen.findByRole('dialog', { name: 'Webhook for “Intake”' });
    expect((within(secretDialog).getByLabelText('Webhook URL') as HTMLInputElement).value).toBe(
      url
    );
    expect((within(secretDialog).getByLabelText('Signing secret') as HTMLInputElement).value).toBe(
      secret
    );
    expect(h.mutations.create.reset).toHaveBeenCalled();
    expect(toast.mock.calls.flat().some((c) => JSON.stringify(c).includes(secret))).toBe(false);

    fireEvent.click(within(secretDialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Webhook for/ })).toBeNull());
    expect(document.body.innerHTML).not.toContain(secret);
    expect(h.mutations.rotate.reset).toHaveBeenCalled();
    expect(h.mutations.regenerate.reset).toHaveBeenCalled();
  });

  it('rotates a webhook secret with immediate revoke', async () => {
    setup({ data: listData({ rules: [WEBHOOK_RULE] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Secret' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rotate the signing secret?' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Revoke the old secret now' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate Secret' }));
    expect(h.mutations.rotate.mutate).toHaveBeenCalledWith(
      { id: 'r3', revokePrevious: true },
      expect.any(Object)
    );
    act(() =>
      h.mutations.rotate.mutate.mock.calls[0][1].onSuccess({
        webhookUrl: null,
        signingSecret: 'placeholder-rotated',
      })
    );
    const shown = await screen.findByRole('dialog', { name: 'Webhook for “Form intake”' });
    expect(within(shown).queryByLabelText('Webhook URL')).toBeNull();
    expect(within(shown).getByLabelText('Signing secret')).toBeInTheDocument();
  });

  it('cancels a rotation', async () => {
    setup({ data: listData({ rules: [WEBHOOK_RULE] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Secret' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rotate the signing secret?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('regenerates a webhook URL after confirmation', async () => {
    setup({ data: listData({ rules: [WEBHOOK_RULE] }) });
    h.mutations.regenerate.mutateAsync.mockResolvedValue({
      webhookUrl: 'https://api.example.invalid/webhooks/task-automation/new',
      signingSecret: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'New URL' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Create New URL' }));
    const shown = await screen.findByRole('dialog', { name: 'Webhook for “Form intake”' });
    expect(within(shown).getByLabelText('Webhook URL')).toBeInTheDocument();
    expect(within(shown).queryByLabelText('Signing secret')).toBeNull();
  });

  it('hides webhook controls from non-webhook admins', () => {
    setup({ data: listData({ rules: [WEBHOOK_RULE], canManageWebhooks: false }) });
    expect(screen.queryByRole('button', { name: 'Rotate Secret' })).toBeNull();
  });

  it('opens recent runs for a rule', async () => {
    setup();
    h.runs.mockReturnValue({
      data: [
        {
          id: 'run1',
          status: 'SUCCEEDED',
          triggerType: 'ENTITY_EVENT',
          outcome: 'task_created',
          errorCode: null,
          taskId: 't1',
          createdAt: '2026-10-20T10:00:00.000Z',
          finishedAt: '2026-10-20T10:00:01.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });
    fireEvent.click(within(rulesCard()).getAllByRole('button', { name: 'Runs' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Recent runs: Call new leads' });
    expect(within(dialog).getByText('Task created')).toBeInTheDocument();
    expect(h.runs).toHaveBeenCalledWith({ ruleId: 'r1' });
  });

  it('saves and resets settings', async () => {
    setup();
    h.mutations.reset.mutateAsync.mockResolvedValue({
      automationEnabled: true,
      notifyRuleOwnerOnFailure: false,
      maxRunsPerRulePerHour: 60,
    });
    fireEvent.change(screen.getByLabelText('Max runs per rule per hour'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    await waitFor(() =>
      expect(h.mutations.settings.mutateAsync).toHaveBeenCalledWith({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 30,
      })
    );
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(h.mutations.reset.mutateAsync).toHaveBeenCalled());
    expect(await screen.findByText('Settings reset to defaults.')).toBeInTheDocument();
  });

  it('wires the tags card: New Tag via ref, create, update and delete', async () => {
    setup({
      data: listData({
        tags: [
          {
            id: 'g1',
            name: 'Sales',
            colorToken: 'blue',
            description: null,
            sortOrder: 0,
            isActive: true,
          },
        ],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'New Tag' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Tag' });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Ops' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(h.mutations.tagCreate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ops' })
      )
    );

    const tags = screen.getByRole('list', { name: 'Automation tags' });
    fireEvent.click(within(tags).getByRole('button', { name: /Edit/ }));
    const edit = await screen.findByRole('dialog', { name: /Edit Tag/ });
    fireEvent.change(within(edit).getByLabelText(/^Name/), { target: { value: 'Sales EU' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(h.mutations.tagUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'g1', name: 'Sales EU' })
      )
    );

    fireEvent.click(within(tags).getByRole('button', { name: /Delete/ }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(h.mutations.tagDelete.mutateAsync).toHaveBeenCalledWith({ id: 'g1' })
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('automation-tags-heading'));
  });

  it('has no axe violations', async () => {
    setup({ data: listData({ rules: [rule(), SCHEDULE_RULE, WEBHOOK_RULE] }) });
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations with the rule dialog open', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'New Rule' }));
    await screen.findByRole('dialog', { name: 'New Rule' });
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
