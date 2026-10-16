/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import axe from 'axe-core';
import { DeleteCaseTypeDialog } from '../DeleteCaseTypeDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteCaseTypeDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteCaseTypeDialog
      name="Advisory"
      isDeleting={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
}

describe('DeleteCaseTypeDialog', () => {
  it('is closed without a name', () => {
    renderDialog({ name: null });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks for confirmation and deletes', () => {
    const { onConfirm } = renderDialog();
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(screen.getByText('Delete Advisory?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('keeps a server refusal inside the dialog as an alert', () => {
    renderDialog({ error: '3 cases use this type. Deactivate it instead.' });
    expect(screen.getByRole('alert').textContent).toBe(
      '3 cases use this type. Deactivate it instead.'
    );
  });

  it('cancels', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('has no axe violations, with or without a server error', async () => {
    renderDialog({ error: '3 cases use this type. Deactivate it instead.' });
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('disables actions while deleting', () => {
    renderDialog({ isDeleting: true });
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
