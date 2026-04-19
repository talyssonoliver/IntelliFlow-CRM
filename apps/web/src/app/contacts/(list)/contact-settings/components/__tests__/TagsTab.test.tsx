import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { TagsTab, type TagRow, type TagsTabHandle } from '../TagsTab';

const tags: TagRow[] = [
  {
    id: 'tag-1',
    name: 'VIP',
    colorToken: 'amber',
    description: 'High value',
    sortOrder: 0,
    isActive: true,
  },
];

/**
 * TagsTab exposes `openCreate()` via imperative handle (mirror of the
 * /accounts/account-settings TagsTab). Parent SectionHeader renders the
 * "New Tag" button and calls `ref.current.openCreate()` on click.
 */
describe('TagsTab', () => {
  it('renders existing tags', () => {
    render(<TagsTab tags={tags} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('High value')).toBeInTheDocument();
  });

  it('shows empty state when no tags', () => {
    render(<TagsTab tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/No tags yet/i)).toBeInTheDocument();
  });

  it('opens the new-tag dialog when ref.openCreate is invoked', () => {
    const ref = createRef<TagsTabHandle>();
    render(
      <TagsTab ref={ref} tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(ref.current?.openCreate).toBeTypeOf('function');
    act(() => {
      ref.current?.openCreate();
    });
    expect(screen.getByRole('heading', { name: /^New tag$/i })).toBeInTheDocument();
  });

  it('rejects empty name on submit', async () => {
    const ref = createRef<TagsTabHandle>();
    const onCreate = vi.fn();
    render(
      <TagsTab ref={ref} tags={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    act(() => {
      ref.current?.openCreate();
    });
    const createBtn = screen.getByRole('button', { name: /^Create$/ });
    fireEvent.click(createBtn);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Name is required/i);
  });
});
