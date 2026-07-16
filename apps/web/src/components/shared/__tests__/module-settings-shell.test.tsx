/**
 * ModuleSettingsShell tests — PG-191
 * The shared module-settings chrome: skeleton / error card / header actions /
 * section grid (locked while saving) / reset ConfirmationDialog.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ModuleSettingsShell,
  DEFAULT_SETTINGS_SKELETON,
  type ModuleSettingsShellProps,
} from '../module-settings-shell';

function setup(overrides: Partial<ModuleSettingsShellProps> = {}) {
  const onSave = vi.fn();
  const onResetOpenChange = vi.fn();
  const onResetConfirm = vi.fn();
  const props: ModuleSettingsShellProps = {
    breadcrumbs: [
      { label: 'Dashboard', href: '/' },
      { label: 'Widgets', href: '/widgets' },
      { label: 'Widget Settings' },
    ],
    title: 'Widget Settings',
    description: 'Configure widget defaults.',
    errorTitle: 'Failed to load widget settings',
    isLoading: false,
    errorMessage: null,
    isSaving: false,
    canSave: true,
    onSave,
    resetOpen: false,
    onResetOpenChange,
    onResetConfirm,
    resetDescription: 'This will restore widget defaults.',
    children: <div data-testid="section">a section</div>,
    ...overrides,
  };
  render(<ModuleSettingsShell {...props} />);
  return { onSave, onResetOpenChange, onResetConfirm };
}

describe('ModuleSettingsShell (PG-191)', () => {
  it('renders the skeleton while loading (and not the sections)', () => {
    setup({ isLoading: true });
    expect(screen.getByTestId('module-settings-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('section')).not.toBeInTheDocument();
  });

  it('renders one skeleton placeholder per configured entry', () => {
    setup({ isLoading: true, skeleton: ['lg:col-span-6 h-48', 'lg:col-span-12 h-64'] });
    const skeleton = screen.getByTestId('module-settings-skeleton');
    // 2 configured placeholders + the 2 header bars
    expect(skeleton.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('exposes a sensible default skeleton layout', () => {
    expect(DEFAULT_SETTINGS_SKELETON.length).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS_SKELETON.every((c) => c.includes('lg:col-span-'))).toBe(true);
  });

  it('renders the error card (title + message) instead of sections', () => {
    setup({ errorMessage: 'boom' });
    expect(screen.getByText('Failed to load widget settings')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByTestId('section')).not.toBeInTheDocument();
  });

  it('renders header, breadcrumbs and sections when healthy', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Widget Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('section')).toBeInTheDocument();
  });

  it('calls onSave from the Save action', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('disables Save when canSave is false', () => {
    setup({ canSave: false });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('shows the "Saving…" label and locks the sections while saving', () => {
    const { container } = { container: document.body };
    setup({ isSaving: true });
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    expect(container.querySelector('fieldset')).toBeDisabled();
  });

  it('opens the reset dialog from the Reset action', () => {
    const { onResetOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(onResetOpenChange).toHaveBeenCalledWith(true);
  });

  it('confirms reset through the ConfirmationDialog', async () => {
    const { onResetConfirm } = setup({ resetOpen: true });
    fireEvent.click(await screen.findByRole('button', { name: /^reset$/i }));
    expect(onResetConfirm).toHaveBeenCalled();
  });
});
