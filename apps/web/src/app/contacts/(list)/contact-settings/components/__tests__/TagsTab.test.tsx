import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagsTab, type TagRow } from '../TagsTab';

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

describe('TagsTab', () => {
  it('renders existing tags', () => {
    render(
      <TagsTab tags={tags} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('High value')).toBeInTheDocument();
  });

  it('shows empty state when no tags', () => {
    render(<TagsTab tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/No tags yet/i)).toBeInTheDocument();
  });

  it('opens new-tag dialog from New tag button', () => {
    render(<TagsTab tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New tag/i }));
    expect(screen.getByText(/^New tag$/, { selector: 'h2, [role="heading"]' }) ?? screen.getByText(/New tag/)).toBeTruthy();
  });

  it('rejects empty name on submit', async () => {
    const onCreate = vi.fn();
    render(<TagsTab tags={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New tag/i }));
    const createBtn = screen.getByRole('button', { name: /^Create$/ });
    fireEvent.click(createBtn);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Name is required/i);
  });
});
