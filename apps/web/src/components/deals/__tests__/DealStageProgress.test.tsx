/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealStageProgress, formatCurrency } from '../DealStageProgress';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('DealStageProgress (MVP-003)', () => {
  it('shows the value in pounds', () => {
    render(
      <DealStageProgress value={4200} stage="PROSPECTING" probability={10} onAddValue={vi.fn()} />
    );
    expect(screen.getByText(formatCurrency(4200))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add value' })).toBeNull();
    expect(screen.getByText(/Stage 1 of 5/)).toBeInTheDocument();
  });

  it('offers "Add value" instead of £0 while the value is not known, and opens the edit form', () => {
    const onAddValue = vi.fn();
    render(
      <DealStageProgress value={0} stage="PROSPECTING" probability={10} onAddValue={onAddValue} />
    );
    expect(screen.queryByText('£0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    expect(onAddValue).toHaveBeenCalledTimes(1);
  });

  it('shows £0 when no edit is possible (a closed deal)', () => {
    render(<DealStageProgress value={0} stage="CLOSED_LOST" probability={0} />);
    expect(screen.getByText('£0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add value' })).toBeNull();
    expect(screen.getAllByText('Lost').length).toBeGreaterThan(0);
  });

  it('colours the bar green for a won deal and red for a lost one', () => {
    const won = render(<DealStageProgress value={100} stage="CLOSED_WON" probability={100} />);
    expect(won.container.querySelector('.bg-green-500')).not.toBeNull();
    expect(screen.getAllByText('Won').length).toBeGreaterThan(0);
    won.unmount();
    const lost = render(<DealStageProgress value={100} stage="CLOSED_LOST" probability={0} />);
    expect(lost.container.querySelector('.bg-red-500')).not.toBeNull();
  });
});
