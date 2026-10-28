/**
 * @vitest-environment jsdom
 *
 * RecentRunsDialog — PG-208 (AC-TA-012): loading, error, empty, outcome labels
 * and the created-task link.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const runs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trpc', () => ({
  trpc: { taskAutomation: { listRuns: { useQuery: (...a: unknown[]) => runs(...a) } } },
}));

import { RecentRunsDialog } from '../RecentRunsDialog';
import type { RuleItem } from '../../task-automation-labels';

const RULE = { id: 'r1', name: 'Call new leads' } as Pick<RuleItem, 'id' | 'name'>;

function renderDialog() {
  render(<RecentRunsDialog rule={RULE as RuleItem} onClose={vi.fn()} />);
  return screen.getByRole('dialog', { name: 'Recent runs: Call new leads' });
}

describe('RecentRunsDialog', () => {
  it('shows a skeleton while loading', () => {
    runs.mockReturnValue({ isLoading: true });
    const dialog = renderDialog();
    expect(within(dialog).queryByRole('list')).toBeNull();
    expect(runs).toHaveBeenCalledWith({ ruleId: 'r1' });
  });

  it('shows an error', () => {
    runs.mockReturnValue({ isLoading: false, error: { message: 'boom' } });
    expect(within(renderDialog()).getByRole('alert')).toHaveTextContent('boom');
  });

  it('says when the rule has not run', () => {
    runs.mockReturnValue({ isLoading: false, error: null, data: [] });
    expect(within(renderDialog()).getByText('This rule has not run yet.')).toBeInTheDocument();
  });

  it('lists runs with plain-language outcomes and the task link', () => {
    runs.mockReturnValue({
      isLoading: false,
      error: null,
      data: [
        {
          id: 'a',
          status: 'SUCCEEDED',
          triggerType: 'ENTITY_EVENT',
          outcome: 'task_created',
          errorCode: null,
          taskId: 't1',
          createdAt: '2026-10-20T10:00:00.000Z',
          finishedAt: null,
        },
        {
          id: 'b',
          status: 'SKIPPED',
          triggerType: 'ENTITY_EVENT',
          outcome: 'rate_capped',
          errorCode: null,
          taskId: null,
          createdAt: '2026-10-20T09:00:00.000Z',
          finishedAt: null,
        },
        {
          id: 'c',
          status: 'MYSTERY',
          triggerType: 'WEBHOOK',
          outcome: null,
          errorCode: null,
          taskId: null,
          createdAt: '2026-10-20T08:00:00.000Z',
          finishedAt: null,
        },
      ],
    });
    const list = within(renderDialog()).getByRole('list', { name: 'Recent runs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Task created')).toBeInTheDocument();
    expect(
      within(list).getByText('Skipped: the rule reached its hourly limit')
    ).toBeInTheDocument();
    expect(within(list).getByText('MYSTERY')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Open the task' })).toHaveAttribute(
      'href',
      '/tasks/t1'
    );
  });

  it('renders nothing without a rule', () => {
    render(<RecentRunsDialog rule={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
