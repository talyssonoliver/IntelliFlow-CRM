/**
 * Shared settings TagsTab — PG-201 defaults, PG-208 text and id overrides.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import { TagsTab, type SettingsTagView, type TagsTabHandle } from '../tags-tab';
import { colorLabel, swatchClass, toColorToken } from '@/lib/color-tokens';

const TAG: SettingsTagView = {
  id: 't1',
  name: 'Follow-up',
  colorToken: 'teal',
  description: null,
  sortOrder: 0,
  isActive: true,
};

function renderTags(tags: SettingsTagView[], texts?: Parameters<typeof TagsTab>[0]['texts']) {
  const ref = createRef<TagsTabHandle>();
  render(
    <TagsTab
      ref={ref}
      tags={tags}
      canEdit
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn()}
      texts={texts}
    />
  );
  return ref;
}

describe('shared TagsTab', () => {
  it('keeps the scheduled-report texts and ids by default', async () => {
    const ref = renderTags([TAG]);
    expect(screen.getByRole('list', { name: 'Schedule tags' })).toBeInTheDocument();
    act(() => ref.current?.openCreate());
    expect(await screen.findByText(/Tags group scheduled reports\./)).toBeInTheDocument();
    expect(document.getElementById('schedule-tag-name')).not.toBeNull();
  });

  it('uses the caller texts and id prefix', async () => {
    const texts = {
      listLabel: 'Automation tags',
      emptyDescription: 'Tags group automation rules.',
      dialogDescription: 'Tags label the tasks a rule creates.',
      idPrefix: 'automation-tag',
    };
    const ref = renderTags([], texts);
    expect(screen.getByText('Tags group automation rules.')).toBeInTheDocument();
    act(() => ref.current?.openCreate());
    expect(await screen.findByText('Tags label the tasks a rule creates.')).toBeInTheDocument();
    expect(document.getElementById('automation-tag-name')).not.toBeNull();
    expect(document.getElementById('automation-tag-color')).not.toBeNull();
    expect(document.getElementById('automation-tag-description')).not.toBeNull();
  });

  it('uses the shared palette helpers (lib/color-tokens)', () => {
    expect(toColorToken('nope')).toBe('slate');
    expect(swatchClass('teal')).toBe('bg-teal-500');
    expect(colorLabel('teal')).toBe('Teal');
    expect(colorLabel('nope')).toBe('Slate');
  });
});

describe('shared TagsTab read-only empty state', () => {
  it('offers no create action and ignores openCreate', () => {
    const ref = createRef<TagsTabHandle>();
    render(
      <TagsTab
        ref={ref}
        tags={[]}
        canEdit={false}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.mouseEnter(screen.getByRole('region'));
    expect(screen.queryByRole('button', { name: /tag/i })).not.toBeInTheDocument();
    act(() => ref.current?.openCreate());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
