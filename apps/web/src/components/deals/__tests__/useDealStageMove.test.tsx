/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useDealStageMove } from '../useDealStageMove';

vi.mock('@intelliflow/ui', () => ({
  ConfirmationDialog: ({ open, title, description, confirmLabel, onConfirm, onOpenChange }: any) =>
    open ? (
      <div role="alertdialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
        {/* Like the real dialog: await onConfirm, then ask to close. */}
        <button
          onClick={async () => {
            await onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

function setup(stage: any = 'NEEDS_ANALYSIS', isPending = false) {
  const mutate = vi.fn();
  const hook = renderHook(() =>
    useDealStageMove({
      dealId: 'deal-1',
      dealName: 'Studio Pilates Demo',
      stage,
      mutation: { isPending, mutate },
    })
  );
  return { mutate, hook };
}

describe('useDealStageMove (MVP-012 #32)', () => {
  it('shows nothing until a stage is requested, then asks with the deal and both stages named', () => {
    const { hook } = setup();
    const { container } = render(<>{hook.result.current.dialog}</>);
    expect(container.firstChild).toBeNull();
    act(() => hook.result.current.requestMove('PROPOSAL'));
    render(<>{hook.result.current.dialog}</>);
    expect(screen.getByRole('heading', { name: 'Move to Proposal?' })).toBeInTheDocument();
    expect(
      screen.getByText(/"Studio Pilates Demo" will move from Needs Analysis to Proposal/)
    ).toBeInTheDocument();
    expect(screen.getByText(/recorded on the deal's activity/)).toBeInTheDocument();
  });

  it('moves the deal only on confirm, then closes', () => {
    const { mutate, hook } = setup();
    act(() => hook.result.current.requestMove('PROSPECTING'));
    const view = render(<>{hook.result.current.dialog}</>);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(mutate).toHaveBeenCalledWith(
      { id: 'deal-1', targetStage: 'PROSPECTING' },
      expect.objectContaining({ onSettled: expect.any(Function) })
    );
    // It stays open, working, until the move settles; only then does it close.
    view.rerender(<>{hook.result.current.dialog}</>);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => mutate.mock.calls[0]![1].onSettled());
    view.rerender(<>{hook.result.current.dialog}</>);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does nothing on cancel', () => {
    const { mutate, hook } = setup();
    act(() => hook.result.current.requestMove('NEGOTIATION'));
    render(<>{hook.result.current.dialog}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('ignores a request while a move is in flight, and reports that it is moving', () => {
    const { mutate, hook } = setup('QUALIFICATION', true);
    expect(hook.result.current.moving).toBe(true);
    act(() => hook.result.current.requestMove('NEEDS_ANALYSIS'));
    const { container } = render(<>{hook.result.current.dialog}</>);
    expect(container.firstChild).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});
