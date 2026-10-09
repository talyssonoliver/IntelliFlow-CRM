// @vitest-environment jsdom
/**
 * RelatedTasksCard: after a task is created from the card's sheet, or completed
 * from the list, the entity's task list must be refreshed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

const sheet = vi.hoisted(() => ({
  onSuccess: undefined as undefined | (() => void | Promise<unknown>),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast,
}));

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@/components/tasks/TaskCreateSheet', () => ({
  TaskCreateSheet: (props: { onSuccess?: () => void | Promise<unknown> }) => {
    sheet.onSuccess = props.onSuccess;
    return null;
  },
}));

import { RelatedTasksCard } from '../RelatedTasksCard';

describe('RelatedTasksCard onSuccess handlers', () => {
  beforeEach(() => {
    capture.reset();
    toast.mockReset();
    sheet.onSuccess = undefined;
  });

  it('refreshes the entity task list after the create sheet succeeds', async () => {
    render(<RelatedTasksCard entityType="lead" entityId="lead-1" />);
    await sheet.onSuccess?.();
    expect(capture.invalidations).toEqual(['task.getByEntity']);
    expect(toast).not.toHaveBeenCalled();
  });

  it('tells the user when refreshing the entity task list fails', async () => {
    capture.invalidateError = new Error('network down');
    render(<RelatedTasksCard entityType="lead" entityId="lead-1" />);
    await sheet.onSuccess?.();
    expect(toast).toHaveBeenCalledWith({
      title: 'Failed to refresh tasks',
      description: 'network down',
      variant: 'destructive',
    });
  });

  it('falls back to a generic message when the refresh failure is not an Error', async () => {
    capture.invalidateError = 'boom';
    render(<RelatedTasksCard entityType="lead" entityId="lead-1" />);
    await sheet.onSuccess?.();
    expect(toast).toHaveBeenCalledWith({
      title: 'Failed to refresh tasks',
      description: 'Please reload the page.',
      variant: 'destructive',
    });
  });

  it('refreshes the entity task list and the global list after completing a task', async () => {
    render(<RelatedTasksCard entityType="lead" entityId="lead-1" />);
    await capture.mutations['task.complete'].onSuccess?.();
    expect(toast).toHaveBeenCalledWith({ title: 'Task completed' });
    expect(capture.invalidations).toEqual(['task.getByEntity', 'task.list']);
  });
});
