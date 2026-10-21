/**
 * @vitest-environment jsdom
 *
 * PG-199 — ordered fallback chain editor (AC-002): add, reorder, remove, limit,
 * empty state, 44 px targets and live announcements.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import axe from 'axe-core';
import { FallbackList } from '../FallbackList';
import { CATALOG } from '../../__tests__/model-config-fixtures';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

const OPTIONS = CATALOG.filter((m) => m.purposes.includes('qualification'));

function Harness({ initial, disabled }: { initial: string[]; disabled?: boolean }) {
  const [ids, setIds] = React.useState(initial);
  return (
    <>
      <FallbackList
        purpose="qualification"
        title="Qualification"
        ids={ids}
        options={OPTIONS}
        max={3}
        disabled={disabled}
        errors={{ 1: 'A fallback cannot be the primary model' }}
        onChange={setIds}
      />
      <output data-testid="ids">{ids.join('|')}</output>
    </>
  );
}

const ids = () => screen.getByTestId('ids').textContent;
const live = () => document.querySelector('output[aria-live="polite"]')?.textContent;

describe('FallbackList', () => {
  it('shows the canonical empty state with no button inside it', () => {
    render(<Harness initial={[]} />);
    const empty = screen.getByLabelText('No qualification fallbacks');
    expect(within(empty).queryByRole('button')).toBeNull();
    // Fallback wording, not the generic rules copy, and no extra tab stop.
    expect(within(empty).getByText('No fallbacks')).toBeInTheDocument();
    expect(within(empty).queryByText(/no rules configured/i)).toBeNull();
    expect(empty.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText(/built-in fallback runs/i)).toBeInTheDocument();
  });

  it('adds a chosen model at the end and announces it', () => {
    render(<Harness initial={[]} />);
    fireEvent.change(screen.getByLabelText('Add a qualification fallback model'), {
      target: { value: 'gpt-4o' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add fallback' }));
    expect(ids()).toBe('gpt-4o');
    expect(live()).toBe('gpt-4o added as fallback 1 of 1.');
  });

  it('offers only models not already in the chain, with prices', () => {
    render(<Harness initial={['gpt-4o']} />);
    const select = screen.getByLabelText('Add a qualification fallback model');
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels.some((l) => l?.startsWith('gpt-4o '))).toBe(false);
    expect(labels).toContain('mistral-medium — $4.00 / 1M tokens');
  });

  it('does nothing when Add is pressed without a choice', () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add fallback' }));
    expect(ids()).toBe('');
    expect(live()).toBe('Choose a model to add first.');
    fireEvent.click(screen.getByRole('button', { name: 'Add fallback' }));
    // The same message again is still re-announced.
    expect(live()).toBe('Choose a model to add first.​');
  });

  it('reorders with labelled 44 px buttons that stay focusable at the ends', () => {
    render(<Harness initial={['gpt-4o', 'mistral-medium']} />);
    const up1 = screen.getByRole('button', { name: 'Move fallback 1 up' });
    expect(up1.getAttribute('aria-disabled')).toBe('true');
    expect(up1.className).toContain('h-11');
    expect(up1.className).toContain('w-11');
    fireEvent.click(up1);
    expect(ids()).toBe('gpt-4o|mistral-medium');
    expect(live()).toBe('gpt-4o is already first.');

    fireEvent.click(screen.getByRole('button', { name: 'Move fallback 2 up' }));
    expect(ids()).toBe('mistral-medium|gpt-4o');
    expect(live()).toBe('mistral-medium moved to position 1 of 2.');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Move fallback 1 down' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move fallback 1 down' }));
    expect(ids()).toBe('gpt-4o|mistral-medium');
    expect(
      screen.getByRole('button', { name: 'Move fallback 2 down' }).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('removes an entry and announces what remains', () => {
    render(<Harness initial={['gpt-4o', 'mistral-medium']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove fallback 1' }));
    expect(ids()).toBe('mistral-medium');
    expect(live()).toBe('gpt-4o removed, 1 fallback remains.');
  });

  it('stops at the limit and says so', () => {
    render(<Harness initial={['gpt-4o', 'mistral-medium', 'llama-3.3-70b-versatile']} />);
    const add = screen.getByRole('button', { name: 'Add fallback' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(add);
    expect(live()).toBe('Maximum of 3 fallbacks reached.');
  });

  it('shows a field error on its entry', () => {
    render(<Harness initial={['gpt-4o', 'mistral-medium']} />);
    const item = screen.getByText('A fallback cannot be the primary model');
    expect(item.id).toBe('qualification-fallback-1-error');
  });

  it('is read-only when disabled', () => {
    render(<Harness initial={['gpt-4o', 'mistral-medium']} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove fallback 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move fallback 2 up' }));
    expect(ids()).toBe('gpt-4o|mistral-medium');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness initial={['gpt-4o']} />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
