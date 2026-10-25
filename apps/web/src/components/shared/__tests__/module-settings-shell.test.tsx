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

  describe('per-page overrides (GH #576)', () => {
    it('renders loadingFallback instead of the default skeleton', () => {
      setup({ isLoading: true, loadingFallback: <div data-testid="custom-loading" /> });
      expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('module-settings-skeleton')).not.toBeInTheDocument();
    });

    it('renders errorFallback instead of the default error card and sections', () => {
      setup({ errorFallback: <button>Retry now</button> });
      expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
      expect(screen.queryByTestId('section')).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load widget settings')).not.toBeInTheDocument();
    });

    it('does not show errorFallback while loading', () => {
      setup({ isLoading: true, errorFallback: <button>Retry now</button> });
      expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
      expect(screen.getByTestId('module-settings-skeleton')).toBeInTheDocument();
    });

    it('uses custom reset dialog title and confirm label', async () => {
      setup({
        resetOpen: true,
        resetTitle: 'Reset widgets?',
        resetConfirmLabel: 'Reset to Defaults',
      });
      expect(await screen.findByText('Reset widgets?')).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: /^reset to defaults$/i }).length
      ).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /^reset$/i })).not.toBeInTheDocument();
    });

    it('merges resetAction / saveAction overrides onto the header actions', () => {
      setup({ resetAction: { disabled: true }, saveAction: { label: 'Store it' } });
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Store it' })).toBeInTheDocument();
    });

    it('applies headerClassName to the page header (default mb-6)', () => {
      const { container } = render(
        <ModuleSettingsShell
          breadcrumbs={[{ label: 'Widget Settings' }]}
          title="T"
          description="D"
          errorTitle="E"
          isLoading={false}
          isSaving={false}
          canSave
          onSave={() => {}}
          resetOpen={false}
          onResetOpenChange={() => {}}
          onResetConfirm={() => {}}
          resetDescription="R"
          headerClassName="custom-header"
        >
          <div />
        </ModuleSettingsShell>
      );
      expect(container.querySelector('.custom-header')).not.toBeNull();
      expect(container.querySelector('.mb-6')).toBeNull();
    });
  });

  describe('error state keeps the page h1 (PG-207)', () => {
    it('renders the page title as the h1 above the error card', () => {
      setup({ errorMessage: 'boom' });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Widget Settings' })
      ).toBeInTheDocument();
      expect(screen.getByText('Failed to load widget settings')).toBeInTheDocument();
    });
  });

  describe('hideActions (PG-207)', () => {
    it('shows Reset and Save by default', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('renders the header and sections with no Reset/Save for a read-only viewer', () => {
      setup({ hideActions: true });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Widget Settings' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('section')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset to Defaults' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    });
  });

  describe('leading (PG-207)', () => {
    it('renders leading content outside the fieldset that locks while saving', () => {
      setup({
        isSaving: true,
        leading: <button type="button">Connect mailbox</button>,
      });
      const leading = screen.getByRole('button', { name: 'Connect mailbox' });
      expect(leading).toBeEnabled();
      expect(leading.closest('fieldset')).toBeNull();
      expect(screen.getByTestId('section').closest('fieldset')).toBeDisabled();
    });
  });
});
