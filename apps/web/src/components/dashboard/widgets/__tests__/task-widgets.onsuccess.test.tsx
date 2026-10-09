/**
 * @vitest-environment jsdom
 */
/**
 * Completing a task from the dashboard widgets must refresh the task list and
 * the reminders.
 */
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capture } from '@/test/trpc-capture';

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));
vi.mock('@/components/tasks/TaskCreateSheet', () => ({ TaskCreateSheet: () => null }));

import { PendingTasksWidget } from '../PendingTasksWidget';
import { UpcomingTasksWidget } from '../UpcomingTasksWidget';

describe('task widgets - complete onSuccess', () => {
  beforeEach(() => {
    capture.reset();
  });

  it.each([
    ['PendingTasksWidget', PendingTasksWidget],
    ['UpcomingTasksWidget', UpcomingTasksWidget],
  ])('%s invalidates task list and reminders and waits for both', async (_name, Widget) => {
    render(<Widget />);
    await capture.mutations['task.complete'].onSuccess?.();
    expect(capture.invalidations).toEqual(['task.list', 'task.getReminders']);
  });
});
