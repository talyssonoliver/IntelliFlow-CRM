// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UpcomingTasksWidget } from '../UpcomingTasksWidget';

// Mock TaskCreateSheet to avoid deep tRPC dependency chain
vi.mock('@/components/tasks/TaskCreateSheet', () => ({
  TaskCreateSheet: () => null,
}));

// Mock the tRPC API
vi.mock('@/lib/api', () => ({
  api: {
    task: {
      list: {
        useQuery: vi.fn(() => ({
          data: { tasks: [] },
          isLoading: false,
        })),
      },
      complete: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
        })),
      },
      create: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
        })),
      },
    },
    useUtils: vi.fn(() => ({
      task: {
        list: {
          invalidate: vi.fn(),
        },
        getReminders: {
          invalidate: vi.fn(),
        },
      },
    })),
  },
}));

describe('UpcomingTasksWidget', () => {
  it('renders widget title and view all link', () => {
    render(<UpcomingTasksWidget />);

    expect(screen.getByText('Upcoming Tasks')).toBeInTheDocument();
    expect(screen.getByText('View All')).toHaveAttribute('href', '/tasks');
  });
});
