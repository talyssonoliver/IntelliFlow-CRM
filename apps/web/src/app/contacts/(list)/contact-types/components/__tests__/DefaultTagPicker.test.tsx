/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import axe from 'axe-core';
import { DefaultTagPicker, type DefaultTagOption } from '../DefaultTagPicker';

function tags(count: number, extra: Partial<DefaultTagOption>[] = []): DefaultTagOption[] {
  const base = Array.from({ length: count }, (_, i) => ({
    id: `tag-${i}`,
    name: `Tag ${i}`,
    isActive: true,
  }));
  return [
    ...base,
    ...extra.map((e, i) => ({ id: `x-${i}`, name: `X ${i}`, isActive: true, ...e })),
  ];
}

describe('DefaultTagPicker (A11Y-4)', () => {
  it('renders real checkboxes in a fieldset with a legend, active tags only', () => {
    render(
      <DefaultTagPicker
        tags={tags(2, [{ name: 'Retired', isActive: false }])}
        value={[]}
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole('group', { name: 'Default tags' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByLabelText('Retired')).not.toBeInTheDocument();
  });

  it('keeps a linked tag that was deactivated: shown "(inactive)", removable and re-addable (codex 3a11a307)', () => {
    const onChange = vi.fn();
    const all = tags(1, [{ name: 'Retired', isActive: false }]);
    const { rerender } = render(
      <DefaultTagPicker tags={all} value={['x-0']} keptIds={['x-0']} onChange={onChange} />
    );
    const retired = screen.getByRole('checkbox', { name: 'Retired (inactive)' });
    expect(retired).toBeChecked();
    fireEvent.click(retired);
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<DefaultTagPicker tags={all} value={[]} keptIds={['x-0']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Retired (inactive)' }));
    expect(onChange).toHaveBeenLastCalledWith(['x-0']);
  });

  it('toggles a tag on and off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DefaultTagPicker tags={tags(2)} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tag 1' }));
    expect(onChange).toHaveBeenLastCalledWith(['tag-1']);
    rerender(<DefaultTagPicker tags={tags(2)} value={['tag-1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tag 1' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('at the cap of 10, the rest stay focusable but aria-disabled, with a linked hint and a live message', () => {
    const onChange = vi.fn();
    const all = tags(12);
    const selected = all.slice(0, 10).map((t) => t.id);
    render(<DefaultTagPicker tags={all} value={selected} onChange={onChange} />);

    const extra = screen.getByRole('checkbox', { name: 'Tag 11' });
    expect(extra).toHaveAttribute('aria-disabled', 'true');
    expect(extra).not.toBeDisabled();
    const hintId = extra.getAttribute('aria-describedby');
    expect(document.getElementById(hintId!)).toHaveTextContent('up to 10');
    fireEvent.click(extra);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Maximum of 10 default tags reached.');

    // A selected tag can still be removed at the cap.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tag 0' }));
    expect(onChange).toHaveBeenCalledWith(selected.slice(1));
  });

  it('explains when there are no tags yet', () => {
    render(<DefaultTagPicker tags={[]} value={[]} onChange={() => undefined} />);
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });

  it('disables everything when read-only', () => {
    render(<DefaultTagPicker tags={tags(1)} value={[]} onChange={() => undefined} disabled />);
    expect(screen.getByRole('checkbox', { name: 'Tag 0' })).toBeDisabled();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <DefaultTagPicker tags={tags(3)} value={['tag-0']} onChange={() => undefined} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
