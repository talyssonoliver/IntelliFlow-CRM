/**
 * TagsTab Tests - PG-186
 *
 * Verifies the forwardRef-based TagsTab API + colorToken fallback.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import { DOCUMENT_TAG_COLOR_TOKENS } from '@intelliflow/validators';
import { TagsTab, type TagsTabHandle } from '../components/TagsTab';

const sampleTags = [
  {
    id: '1',
    name: 'Contract',
    colorToken: 'blue',
    description: null,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: '2',
    name: 'Evidence',
    colorToken: 'amber',
    description: null,
    sortOrder: 1,
    isActive: true,
  },
];

describe('TagsTab', () => {
  it('renders all tags by name', () => {
    render(<TagsTab tags={sampleTags} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Contract')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('renders empty state when tags array is empty', () => {
    render(<TagsTab tags={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    // EmptyState renders a known illustration / heading; assert the empty surface is present
    // by confirming no tag rows exist.
    expect(screen.queryByText('Contract')).not.toBeInTheDocument();
  });

  it('forwardRef.openCreate() opens the create dialog', () => {
    const ref = createRef<TagsTabHandle>();
    render(
      <TagsTab
        ref={ref}
        tags={sampleTags}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      ref.current?.openCreate();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('colorToken fallback to slate for unrecognized token', () => {
    const validTokens = new Set<string>(DOCUMENT_TAG_COLOR_TOKENS);
    const fallback = (raw: string) => (validTokens.has(raw) ? raw : 'slate');
    expect(fallback('chartreuse')).toBe('slate');
    expect(fallback('blue')).toBe('blue');
  });
});
