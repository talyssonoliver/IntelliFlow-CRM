/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { SuppressionDto } from '@intelliflow/validators';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: { mutateAsync: vi.fn(), isPending: false },
  remove: { mutateAsync: vi.fn(), isPending: false },
  invalidate: vi.fn(),
  fetchNextPage: vi.fn(),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ emailSettings: { suppression: { list: { invalidate: api.invalidate } } } }),
    emailSettings: {
      suppression: {
        list: { useInfiniteQuery: (...args: unknown[]) => api.list(...args) },
        add: { useMutation: () => api.add },
        remove: { useMutation: () => api.remove },
      },
    },
  },
}));

import { SuppressionListCard } from '../SuppressionListCard';

const row = (over: Partial<SuppressionDto> = {}): SuppressionDto => ({
  id: 'sup-1',
  email: 'gone@example.invalid',
  reason: 'HARD_BOUNCE',
  source: 'DSN',
  createdAt: '2026-10-19T10:00:00.000Z',
  ...over,
});

function listReturns(items: SuppressionDto[], extra: Record<string, unknown> = {}) {
  api.list.mockReturnValue({
    data: { pages: [{ items, nextCursor: null }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: api.fetchNextPage,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.invalidate.mockResolvedValue(undefined);
  listReturns([]);
});

describe('SuppressionListCard', () => {
  it('pages through the list 50 at a time', () => {
    render(<SuppressionListCard announce={vi.fn()} />);
    expect(api.list).toHaveBeenCalledWith(
      { limit: 50 },
      expect.objectContaining({ getNextPageParam: expect.any(Function) })
    );
    const options = api.list.mock.calls[0][1] as {
      getNextPageParam: (p: { nextCursor: string | null }) => unknown;
    };
    expect(options.getNextPageParam({ nextCursor: 'c1' })).toBe('c1');
    expect(options.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });

  it('shows a passive empty state with no action', () => {
    render(<SuppressionListCard announce={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Suppression list' })).toBeInTheDocument();
    expect(screen.getByText('No suppressed addresses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create|new/i })).not.toBeInTheDocument();
  });

  it('lists addresses with a readable reason', () => {
    listReturns([
      row(),
      row({ id: 'sup-2', email: 'soft@example.invalid', reason: 'SOFT_BOUNCE_LIMIT' }),
      row({ id: 'sup-3', email: 'manual@example.invalid', reason: 'MANUAL', source: 'MANUAL' }),
    ]);
    render(<SuppressionListCard announce={vi.fn()} />);
    expect(screen.getByText('gone@example.invalid')).toBeInTheDocument();
    expect(screen.getByText('Hard bounce')).toBeInTheDocument();
    expect(screen.getByText('Repeated soft bounces')).toBeInTheDocument();
    expect(screen.getByText('Added manually')).toBeInTheDocument();
  });

  it('adds an address and announces it', async () => {
    api.add.mutateAsync.mockResolvedValue(row({ email: 'new@example.invalid', reason: 'MANUAL' }));
    const announce = vi.fn();
    render(<SuppressionListCard announce={announce} />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'New@Example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));
    await waitFor(() =>
      expect(api.add.mutateAsync).toHaveBeenCalledWith({ email: 'new@example.invalid' })
    );
    expect(api.invalidate).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('new@example.invalid added to the suppression list.');
    expect(screen.getByLabelText('Email address')).toHaveValue('');
  });

  it('refuses an invalid address in place', async () => {
    render(<SuppressionListCard announce={vi.fn()} />);
    const input = screen.getByLabelText('Email address');
    fireEvent.change(input, { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(input).toHaveAccessibleDescription('Enter a valid email address.');
    expect(document.activeElement).toBe(input);
    expect(api.add.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a server error for a failed add', async () => {
    api.add.mutateAsync.mockRejectedValue(new Error('This address is already suppressed.'));
    render(<SuppressionListCard announce={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'dup@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This address is already suppressed.'
    );
  });

  it('confirms before removing, then removes', async () => {
    listReturns([row()]);
    api.remove.mutateAsync.mockResolvedValue({ removed: true });
    const announce = vi.fn();
    render(<SuppressionListCard announce={announce} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove gone@example.invalid' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Email to gone@example.invalid will be sent again.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Address' }));
    await waitFor(() => expect(api.remove.mutateAsync).toHaveBeenCalledWith({ id: 'sup-1' }));
    expect(announce).toHaveBeenCalledWith(
      'gone@example.invalid removed from the suppression list.'
    );
  });

  it('loads more when there is another page', () => {
    listReturns([row()], { hasNextPage: true });
    render(<SuppressionListCard announce={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show More' }));
    expect(api.fetchNextPage).toHaveBeenCalled();
  });

  it('shows a load error', () => {
    listReturns([], { data: undefined, error: { message: 'boom' } });
    render(<SuppressionListCard announce={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The suppression list could not be loaded.'
    );
  });

  it('has no axe violations empty and with rows', async () => {
    for (const items of [[], [row()]]) {
      listReturns(items);
      const { container, unmount } = render(<SuppressionListCard announce={vi.fn()} />);
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });
});
