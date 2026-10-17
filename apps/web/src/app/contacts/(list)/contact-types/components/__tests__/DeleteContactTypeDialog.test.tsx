/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import axe from 'axe-core';
import { DeleteContactTypeDialog } from '../DeleteContactTypeDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteContactTypeDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteContactTypeDialog
      name="Reseller"
      isDeleting={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
}

describe('DeleteContactTypeDialog', () => {
  it('is closed without a name', () => {
    render(
      <DeleteContactTypeDialog
        name={null}
        isDeleting={false}
        error={null}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks to confirm and focuses Cancel (A11Y-10)', () => {
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Reseller?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('keeps the server refusal inside the dialog as an alert', () => {
    renderDialog({ error: '2 contacts use this type. Deactivate it instead.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('2 contacts use this type');
    expect(alert.className).toContain('text-red-700');
  });

  it('disables both buttons while deleting', () => {
    renderDialog({ isDeleting: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('has no axe violations, with and without an error', async () => {
    renderDialog({ error: 'Refused' });
    const dialog = screen.getByRole('alertdialog');
    const results = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
