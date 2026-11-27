/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealStageProgress, formatCurrency, stageMoveToastTitle } from '../DealStageProgress';

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

describe('DealStageProgress stage buttons (MVP-012 #32)', () => {
  it('makes each stage a button when the deal can be moved; the current stage is disabled', () => {
    const onSelectStage = vi.fn();
    render(
      <DealStageProgress
        value={100}
        stage="QUALIFICATION"
        probability={20}
        onSelectStage={onSelectStage}
      />
    );
    const group = screen.getByRole('group', { name: /move this deal/i });
    expect(group.querySelectorAll('button')).toHaveLength(5);
    const current = screen.getByRole('button', { name: 'Qualification' });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Proposal' }));
    expect(onSelectStage).toHaveBeenCalledWith('PROPOSAL');
    fireEvent.click(screen.getByRole('button', { name: 'Prospecting' }));
    expect(onSelectStage).toHaveBeenLastCalledWith('PROSPECTING');
  });

  it('keeps the labels plain text with no handler (a closed deal): nothing looks clickable', () => {
    render(<DealStageProgress value={100} stage="CLOSED_WON" probability={100} />);
    expect(screen.queryByRole('group', { name: /move this deal/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Proposal' })).toBeNull();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });

  it('lays the labels out so they never run together: wrapping with a gap on a phone', () => {
    render(
      <DealStageProgress value={100} stage="PROPOSAL" probability={60} onSelectStage={vi.fn()} />
    );
    const group = screen.getByRole('group', { name: /move this deal/i });
    expect(group.className).toContain('flex-wrap');
    expect(group.className).toContain('gap-2');
    // A full 44px tap target at every width, not only on a phone.
    const button = screen.getByRole('button', { name: 'Needs Analysis' });
    expect(button.className).toContain('min-h-11');
    expect(button.className).not.toContain('sm:min-h-0');
  });

  it('words the toast for each target', () => {
    expect(stageMoveToastTitle('CLOSED_WON')).toBe('Deal marked as Won');
    expect(stageMoveToastTitle('CLOSED_LOST')).toBe('Deal marked as Lost');
    expect(stageMoveToastTitle('NEEDS_ANALYSIS')).toBe('Moved to Needs Analysis');
  });
});

describe('DealStageProgress offers only the moves the API accepts (MVP-012 #32)', () => {
  const allowed = ['QUALIFICATION', 'CLOSED_LOST'] as const;

  it('enables the stages the rules allow and disables the rest, saying why', () => {
    const onSelectStage = vi.fn();
    render(
      <DealStageProgress
        value={100}
        stage="PROSPECTING"
        probability={10}
        onSelectStage={onSelectStage}
        allowedStages={allowed}
      />
    );
    expect(screen.getByRole('button', { name: 'Qualification' })).toBeEnabled();
    for (const name of ['Needs Analysis', 'Proposal', 'Negotiation']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'A deal moves one stage at a time');
      fireEvent.click(button);
    }
    expect(onSelectStage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Qualification' }));
    expect(onSelectStage).toHaveBeenCalledWith('QUALIFICATION');
  });

  it('disables every stage while a move is in flight', () => {
    render(
      <DealStageProgress
        value={100}
        stage="QUALIFICATION"
        probability={20}
        onSelectStage={vi.fn()}
        allowedStages={['NEEDS_ANALYSIS', 'PROSPECTING']}
        moving
      />
    );
    for (const button of screen.getByRole('group').querySelectorAll('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('offers every other stage when no rules are given (display only callers)', () => {
    render(
      <DealStageProgress value={100} stage="PROPOSAL" probability={60} onSelectStage={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Prospecting' })).toBeEnabled();
  });
});
