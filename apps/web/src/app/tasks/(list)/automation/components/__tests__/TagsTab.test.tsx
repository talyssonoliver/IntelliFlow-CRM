/**
 * @vitest-environment jsdom
 *
 * Task automation TagsTab — PG-208 (AC-TA-015): forwardRef openCreate, this
 * page's texts and field ids, swatch fallback for a legacy colour token.
 */
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import { TagsTab, type TagsTabHandle } from '../TagsTab';

function renderTags(tags: Parameters<typeof TagsTab>[0]['tags']) {
  const ref = createRef<TagsTabHandle>();
  render(
    <TagsTab
      ref={ref}
      tags={tags}
      canEdit
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn()}
    />
  );
  return ref;
}

describe('task automation TagsTab', () => {
  it('opens the create dialog through the forwarded ref with this page’s ids', async () => {
    const ref = renderTags([]);
    expect(
      screen.getByText('Tags group automation rules, for example by team or process.')
    ).toBeInTheDocument();
    act(() => ref.current?.openCreate());
    expect(
      await screen.findByText(/Tags group automation rules\. The name is required/)
    ).toBeInTheDocument();
    expect(document.getElementById('automation-tag-name')).not.toBeNull();
  });

  it('lists tags and falls back to slate for a legacy colour token', () => {
    renderTags([
      {
        id: 'g1',
        name: 'Old',
        colorToken: 'chartreuse',
        description: null,
        sortOrder: 0,
        isActive: true,
      },
    ]);
    const list = screen.getByRole('list', { name: 'Automation tags' });
    const item = within(list).getByRole('listitem');
    expect(item.textContent).toContain('Old');
    expect(item.querySelector('[class*="slate"]')).not.toBeNull();
  });
});
