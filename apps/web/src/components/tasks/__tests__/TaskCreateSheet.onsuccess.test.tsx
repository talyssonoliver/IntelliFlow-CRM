// @vitest-environment jsdom
/**
 * TaskCreateSheet: the create mutation's onSuccess gives immediate feedback and
 * returns the refresh (including any refresh the parent hands back).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

const toast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast,
  Sheet: () => null,
  SheetContent: () => null,
  SheetTitle: () => null,
  SheetDescription: () => null,
}));
vi.mock('../EntitySearchField', () => ({ EntitySearchField: () => null }));

import { TaskCreateSheet } from '../TaskCreateSheet';

describe('TaskCreateSheet create onSuccess', () => {
  beforeEach(() => {
    capture.reset();
    toast.mockReset();
  });

  it('closes the sheet, refreshes the task queries and awaits the parent refresh', async () => {
    const onOpenChange = vi.fn();
    let parentRefreshed = false;
    const onSuccess = vi.fn(async () => {
      parentRefreshed = true;
    });
    render(<TaskCreateSheet open onOpenChange={onOpenChange} onSuccess={onSuccess} />);

    const result = capture.mutations['task.create'].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task created' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(capture.invalidations).toEqual(['task.list', 'task.getByEntity', 'task.getReminders']);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(parentRefreshed).toBe(true);
  });

  it('works without a parent onSuccess callback', async () => {
    render(<TaskCreateSheet open onOpenChange={vi.fn()} />);
    await capture.mutations['task.create'].onSuccess?.();
    expect(capture.invalidations).toHaveLength(3);
  });
});
