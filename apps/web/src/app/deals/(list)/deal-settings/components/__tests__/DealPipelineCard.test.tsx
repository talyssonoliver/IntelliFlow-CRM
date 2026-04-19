import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

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
  return {
    trpc: {
      useUtils: () => ({ pipelineConfig: { getAll: { invalidate: vi.fn() } } }),
      pipelineConfig: {
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
          useMutation: ({ onSuccess }: any) => ({
            mutate: vi.fn(() => onSuccess?.()),
            isPending: false,
          }),
        },
      },
    },
  };
});

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
});
