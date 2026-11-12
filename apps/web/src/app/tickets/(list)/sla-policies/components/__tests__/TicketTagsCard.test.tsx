// @vitest-environment jsdom
import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketTagsCard, type TicketTagsCardHandle } from '../TicketTagsCard';

vi.mock('@/lib/trpc', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    trpc: {
      ticketSettings: {
        tags: { create: { useMutation: mutation }, delete: { useMutation: mutation } },
      },
    },
  };
});

describe('TicketTagsCard empty state', () => {
  it('opens the new-tag dialog from the empty state CTA', () => {
    render(<TicketTagsCard tags={[]} onRefresh={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByRole('region', { name: 'pinned empty state' }));
    fireEvent.click(screen.getByRole('button', { name: /Create a tag/ }));
    expect(screen.getByText('New ticket tag')).toBeInTheDocument();
  });

  it('opens the same dialog through the imperative handle', () => {
    const ref = createRef<TicketTagsCardHandle>();
    render(<TicketTagsCard ref={ref} tags={[]} onRefresh={vi.fn()} />);
    act(() => ref.current!.openCreate());
    expect(screen.getByText('New ticket tag')).toBeInTheDocument();
  });
});
