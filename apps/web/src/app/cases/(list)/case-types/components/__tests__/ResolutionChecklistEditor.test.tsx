/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';
import {
  ResolutionChecklistEditor,
  newChecklistItem,
  type ChecklistDraftItem,
} from '../ResolutionChecklistEditor';

function Harness({
  initial,
  errors,
  disabled,
}: {
  initial: string[];
  errors?: Record<number, string>;
  disabled?: boolean;
}) {
  const [items, setItems] = React.useState<ChecklistDraftItem[]>(() =>
    initial.map((title) => newChecklistItem(title))
  );
  return (
    <>
      <ResolutionChecklistEditor
        items={items}
        onChange={setItems}
        errors={errors}
        disabled={disabled}
      />
      <output data-testid="titles">{items.map((i) => i.title).join('|')}</output>
    </>
  );
}

const titles = () => screen.getByTestId('titles').textContent;
const live = () => document.querySelector('output[aria-live="polite"]')?.textContent;

describe('ResolutionChecklistEditor', () => {
  it('labels every step and its controls', () => {
    render(<Harness initial={['Conflict check', 'Engagement letter']} />);
    expect(screen.getByRole('list', { name: 'Resolution checklist' })).toBeDefined();
    expect((screen.getByLabelText('Checklist step 2') as HTMLInputElement).value).toBe(
      'Engagement letter'
    );
    expect(
      screen.getByRole('button', { name: 'Move step 1 up' }).getAttribute('aria-disabled')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Move step 2 down' }).getAttribute('aria-disabled')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Remove step 1' })).toBeDefined();
  });

  it('edits a step', () => {
    render(<Harness initial={['A']} />);
    fireEvent.change(screen.getByLabelText('Checklist step 1'), { target: { value: 'B' } });
    expect(titles()).toBe('B');
  });

  it('adds a step, announces it and focuses the new input', () => {
    render(<Harness initial={['A']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));
    });
    expect(titles()).toBe('A|');
    expect(live()).toBe('Step added, position 2.');
    expect(document.activeElement).toBe(screen.getByLabelText('Checklist step 2'));
  });

  it('moves a step down, announces the position and keeps focus usable', () => {
    render(<Harness initial={['A', 'B', 'C']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    });
    expect(titles()).toBe('B|A|C');
    expect(live()).toBe('Step moved to position 2 of 3.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move step 2 down' }));
  });

  it('moving to an end puts focus on the opposite control', () => {
    render(<Harness initial={['A', 'B']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }));
    });
    expect(titles()).toBe('B|A');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move step 1 down' }));
  });

  it('ignores a move past either end (aria-disabled stays focusable)', () => {
    render(<Harness initial={['A', 'B']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 down' }));
    expect(titles()).toBe('A|B');
  });

  it('removes a step, announces it and focuses the next input', () => {
    render(<Harness initial={['A', 'B']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    });
    expect(titles()).toBe('B');
    expect(live()).toBe('Step 1 removed, 1 step remains.');
    expect(document.activeElement).toBe(screen.getByLabelText('Checklist step 1'));
  });

  it('focuses Add Step after removing the last step', () => {
    render(<Harness initial={['A']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    });
    expect(titles()).toBe('');
    expect(live()).toBe('Step 1 removed, 0 steps remain.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Step' }));
  });

  it('stops at 20 steps', () => {
    render(<Harness initial={Array.from({ length: 20 }, (_, i) => `Step ${i}`)} />);
    const add = screen.getByRole('button', { name: 'Add Step' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(add);
    expect(titles()?.split('|')).toHaveLength(20);
    expect(live()).toBe('Maximum of 20 steps reached.');
    expect(screen.getByText(/Maximum 20 steps/)).toBeDefined();
  });

  it('shows step errors linked to their input', () => {
    render(<Harness initial={['A', 'a']} errors={{ 1: 'Same as step 1.' }} />);
    const input = screen.getByLabelText('Checklist step 2');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(errorId)?.textContent).toBe('Same as step 1.');
  });

  it('does nothing while disabled', () => {
    const onChange = vi.fn();
    render(
      <ResolutionChecklistEditor
        items={[newChecklistItem('A'), newChecklistItem('B')]}
        onChange={onChange}
        disabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Harness initial={['A', 'B']} errors={{ 1: 'Same as step 1.' }} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
