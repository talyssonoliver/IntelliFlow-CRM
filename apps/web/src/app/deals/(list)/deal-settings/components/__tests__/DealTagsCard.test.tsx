import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import { DealTagsCard, swatchClass, type TagsTabHandle, type DealTagRow } from '../DealTagsCard';

const rows: DealTagRow[] = [
  {
    id: 't1',
    name: 'Strategic',
    colorToken: 'blue',
    description: 'Top-tier',
    sortOrder: 0,
    isActive: true,
  },
];

describe('DealTagsCard', () => {
  it('renders empty state when no tags', () => {
    render(<DealTagsCard tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/No tags yet/i)).toBeDefined();
  });

  it('renders tag rows', () => {
    render(<DealTagsCard tags={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Strategic')).toBeDefined();
  });

  it('opens create dialog via ref', () => {
    const ref = createRef<TagsTabHandle>();
    render(
      <DealTagsCard ref={ref} tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    act(() => {
      ref.current?.openCreate();
    });
    expect(screen.getByText('Add tag')).toBeDefined();
  });

  it('deletes a tag', () => {
    const onDelete = vi.fn();
    render(<DealTagsCard tags={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});

describe('swatchClass helper', () => {
  it('returns the class for a known token', () => {
    expect(swatchClass('blue')).toContain('blue');
  });
  it('falls back to slate for unknown tokens', () => {
    expect(swatchClass('not-a-real-token')).toContain('slate');
  });
});
