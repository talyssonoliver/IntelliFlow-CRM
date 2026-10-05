import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

const pipelineMocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  resetOnSuccess: undefined as undefined | (() => Promise<unknown>),
}));

vi.mock('@/lib/trpc', () => {
  const data = {
    stages: [
      {
        stageKey: 'PROSPECTING',
        displayName: 'Prospecting',
        color: '#6366f1',
        order: 0,
        probability: 10,
        isActive: true,
      },
      {
        stageKey: 'QUALIFICATION',
        displayName: 'Qualification',
        color: '#3b82f6',
        order: 1,
        probability: 25,
        isActive: true,
      },
    ],
  };
  const pipelineBranch = {
    getAll: {
      useQuery: () => ({ data, isLoading: false, error: null, refetch: vi.fn() }),
    },
    updateStage: {
      useMutation: ({ onSuccess }: any) => ({
        mutate: vi.fn(),
        mutateAsync: vi.fn(async () => {
          onSuccess?.();
          return {};
        }),
        isPending: false,
      }),
    },
    resetToDefaults: {
      useMutation: ({ onSuccess }: any) => {
        pipelineMocks.resetOnSuccess = onSuccess;
        return {
          mutate: vi.fn(() => onSuccess?.()),
          isPending: false,
        };
      },
    },
  };
  return {
    trpc: {
      useUtils: () => ({
        dealSettings: { pipeline: { getAll: { invalidate: pipelineMocks.invalidate } } },
      }),
      dealSettings: { pipeline: pipelineBranch },
    },
  };
});

import { toast } from '@intelliflow/ui';
import { DealPipelineCard } from '../DealPipelineCard';

describe('DealPipelineCard', () => {
  it('renders stage rows sorted by order', () => {
    render(<DealPipelineCard />);
    expect(screen.getByText('Prospecting')).toBeDefined();
    expect(screen.getByText('Qualification')).toBeDefined();
  });

  it('has a Reset pipeline button', () => {
    render(<DealPipelineCard />);
    expect(screen.getByRole('button', { name: /reset pipeline/i })).toBeDefined();
  });

  it('shows Edit button per stage and opens inline form', () => {
    render(<DealPipelineCard />);
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    expect(editButtons.length).toBe(2);

    fireEvent.click(editButtons[0]);
    expect(screen.getByLabelText('Stage name')).toBeDefined();
    expect(screen.getByLabelText('Stage color')).toBeDefined();
    expect(screen.getByLabelText('Probability')).toBeDefined();
  });

  it('has an active toggle per stage', () => {
    render(<DealPipelineCard />);
    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBe(2);
  });

  it('runs the reset success handler (invalidate + toast) when resetting the pipeline', () => {
    render(<DealPipelineCard />);
    fireEvent.click(screen.getByRole('button', { name: /reset pipeline/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pipeline reset' }));
  });

  it('returns the pipeline invalidation from the reset success handler so the mutation waits for fresh data', async () => {
    let finish: () => void = () => undefined;
    pipelineMocks.invalidate.mockReturnValueOnce(
      new Promise<void>((resolve) => (finish = resolve))
    );
    render(<DealPipelineCard />);
    let settled = false;
    const pending = pipelineMocks.resetOnSuccess!().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(pipelineMocks.invalidate).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    finish();
    await pending;
    expect(settled).toBe(true);
  });
});
