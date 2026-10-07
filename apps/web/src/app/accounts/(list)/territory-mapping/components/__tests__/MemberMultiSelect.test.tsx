/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Inline popover so the listbox is always in the DOM.
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MemberMultiSelect } from '../MemberMultiSelect';

const options = [
  { id: 'u1', name: 'Ada', title: 'Manager' },
  { id: 'u2', name: 'Rex', title: null },
];

describe('MemberMultiSelect', () => {
  it('exposes a labelled checkbox group and the count in the trigger name', () => {
    render(<MemberMultiSelect options={options} selectedIds={['u2']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Members, 1 selected' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Territory members' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /Rex/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: /Ada/ }).getAttribute('aria-checked')).toBe(
      'false'
    );
    expect(screen.getByText('Manager')).toBeDefined();
  });

  it('adds in pick order and removes on toggle', () => {
    const onChange = vi.fn();
    render(<MemberMultiSelect options={options} selectedIds={['u2']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ada/ }));
    expect(onChange).toHaveBeenLastCalledWith(['u2', 'u1']);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rex/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('summarises unknown selections and empty state', () => {
    const { rerender } = render(
      <MemberMultiSelect options={options} selectedIds={['gone']} onChange={() => {}} />
    );
    expect(screen.getByText('1 selected')).toBeDefined();
    rerender(<MemberMultiSelect options={[]} selectedIds={[]} onChange={() => {}} />);
    expect(screen.getByText('No members')).toBeDefined();
    expect(screen.getByText('No users to add.')).toBeDefined();
  });

  it('shows loading and error states', () => {
    const { rerender } = render(
      <MemberMultiSelect options={[]} selectedIds={[]} onChange={() => {}} isLoading />
    );
    expect(screen.getByText('Loading users…')).toBeDefined();
    rerender(<MemberMultiSelect options={[]} selectedIds={[]} onChange={() => {}} isError />);
    expect(screen.getByText(/Could not load users/)).toBeDefined();
  });
});
