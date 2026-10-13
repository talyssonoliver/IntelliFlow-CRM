/**
 * TagsTab Tests — PG-201 (forwardRef + useImperativeHandle, playbook §4)
 */

import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import { TagsTab, type TagsTabHandle } from '../TagsTab';
import type { ReportScheduleTagView } from '@intelliflow/validators';

function tag(overrides: Partial<ReportScheduleTagView> = {}): ReportScheduleTagView {
  return {
    id: 't1',
    name: 'Finance',
    colorToken: 'blue',
    description: 'Money reports',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

function renderTags(props: Partial<Parameters<typeof TagsTab>[0]> = {}) {
  const ref = createRef<TagsTabHandle>();
  const handlers = {
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  };
  render(<TagsTab ref={ref} tags={[tag()]} canEdit {...handlers} {...props} />);
  return { ref, ...handlers };
}

describe('TagsTab', () => {
  it('opens the create dialog through the forwarded ref and creates a tag', async () => {
    const { ref, onCreate } = renderTags();
    act(() => ref.current?.openCreate());
    expect(await screen.findByRole('heading', { name: 'New Tag' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Ops  ' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'teal' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Ops team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Ops',
        colorToken: 'teal',
        description: 'Ops team',
      })
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'New Tag' })).toBeNull());
  });

  it('keeps Create disabled until a name is entered', async () => {
    const { ref } = renderTags();
    act(() => ref.current?.openCreate());
    expect(await screen.findByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('edits a tag, normalising an unknown colour to slate', async () => {
    const { onUpdate } = renderTags({ tags: [tag({ colorToken: 'neon', description: null })] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit tag Finance' }));
    expect(await screen.findByRole('heading', { name: 'Edit Tag' })).toBeInTheDocument();
    expect(screen.getByLabelText('Colour')).toHaveValue('slate');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Money' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        id: 't1',
        name: 'Money',
        colorToken: 'slate',
        description: undefined,
      })
    );
  });

  it('keeps the dialog open when saving fails', async () => {
    const { ref } = renderTags({ onCreate: vi.fn().mockRejectedValue(new Error('taken')) });
    act(() => ref.current?.openCreate());
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Finance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New Tag' })).toBeInTheDocument()
    );
  });

  it('closes on Cancel without saving', async () => {
    const { ref, onCreate } = renderTags();
    act(() => ref.current?.openCreate());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'New Tag' })).toBeNull());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('asks the parent to delete a tag', () => {
    const { onDelete } = renderTags();
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Finance' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('marks inactive tags and hides actions for non-managers', () => {
    renderTags({ canEdit: false, tags: [tag({ isActive: false })] });
    expect(screen.getByText('(inactive)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit tag/i })).toBeNull();
  });

  it('shows a passive empty state without a button', () => {
    renderTags({ tags: [] });
    expect(screen.getByText('No tags yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
