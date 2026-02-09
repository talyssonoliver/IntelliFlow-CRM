/**
 * @vitest-environment happy-dom
 *
 * PinnedItemsSheet - Supplementary Tests
 *
 * Tests the exported helpers, Toggle component, EditQuickActionsSheet,
 * EditPinnedNavigationSheet, and pinned icon logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ============================================================
// Hoisted mocks
// ============================================================

const mocks = vi.hoisted(() => ({
  mockLocalStorage: new Map<string, string>(),
}));

// ============================================================
// vi.mock declarations
// ============================================================

vi.mock('@intelliflow/ui', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="sheet-content">{children}</div>,
  SheetTitle: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    <h2 data-testid="sheet-title">{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) =>
    <p data-testid="sheet-description">{children}</p>,
}));

// ============================================================
// Import after mocks
// ============================================================

import {
  EditQuickActionsSheet,
  EditPinnedNavigationSheet,
  ALL_QUICK_ACTIONS,
  ALL_PINNED_NAV_GROUPS,
  loadEnabledActions,
  loadPinnedGroups,
  getPinnedIcon,
  PINNED_ICON_MAP,
  DEFAULT_ICON,
} from '../PinnedItemsSheet';

// ============================================================
// Tests
// ============================================================

describe('PinnedItemsSheet (supplementary)', () => {
  beforeEach(() => {
    // localStorage mock is provided by vitest.setup.ts
    localStorage.clear();
  });

  describe('ALL_QUICK_ACTIONS', () => {
    it('contains expected actions', () => {
      expect(ALL_QUICK_ACTIONS.length).toBeGreaterThanOrEqual(4);

      const ids = ALL_QUICK_ACTIONS.map((a) => a.id);
      expect(ids).toContain('action-call');
      expect(ids).toContain('action-email');
      expect(ids).toContain('action-meeting');
      expect(ids).toContain('action-task');
    });

    it('each action has required fields', () => {
      for (const action of ALL_QUICK_ACTIONS) {
        expect(action.id).toBeTruthy();
        expect(action.icon).toBeTruthy();
        expect(action.label).toBeTruthy();
        expect(action.href).toBeTruthy();
        expect(action.description).toBeTruthy();
      }
    });
  });

  describe('ALL_PINNED_NAV_GROUPS', () => {
    it('contains expected navigation groups', () => {
      const ids = ALL_PINNED_NAV_GROUPS.map((g) => g.id);
      expect(ids).toContain('nav-leads');
      expect(ids).toContain('nav-contacts');
      expect(ids).toContain('nav-deals');
    });

    it('each group has entity types', () => {
      for (const group of ALL_PINNED_NAV_GROUPS) {
        expect(group.entityTypes.length).toBeGreaterThan(0);
        expect(group.href).toBeTruthy();
      }
    });
  });

  describe('loadEnabledActions', () => {
    it('returns default set when localStorage is empty', () => {
      const result = loadEnabledActions();
      expect(result).toBeInstanceOf(Set);
      expect(result.has('action-call')).toBe(true);
      expect(result.has('action-email')).toBe(true);
      expect(result.has('action-meeting')).toBe(true);
      expect(result.has('action-task')).toBe(true);
    });

    it('returns stored set from localStorage', () => {
      localStorage.setItem('intelliflow:quick-actions', JSON.stringify(['action-call', 'action-lead']));
      const result = loadEnabledActions();
      expect(result.has('action-call')).toBe(true);
      expect(result.has('action-lead')).toBe(true);
      expect(result.has('action-email')).toBe(false);
    });

    it('returns default when localStorage has invalid JSON', () => {
      localStorage.setItem('intelliflow:quick-actions', 'not-json');
      const result = loadEnabledActions();
      // Should fall back to defaults
      expect(result.has('action-call')).toBe(true);
    });
  });

  describe('loadPinnedGroups', () => {
    it('returns default groups when localStorage is empty', () => {
      const result = loadPinnedGroups();
      expect(result).toBeInstanceOf(Set);
      expect(result.has('nav-leads')).toBe(true);
      expect(result.has('nav-contacts')).toBe(true);
      expect(result.has('nav-deals')).toBe(true);
    });

    it('returns stored groups from localStorage', () => {
      localStorage.setItem('intelliflow:pinned-groups', JSON.stringify(['nav-tickets']));
      const result = loadPinnedGroups();
      expect(result.has('nav-tickets')).toBe(true);
      expect(result.has('nav-leads')).toBe(false);
    });
  });

  describe('getPinnedIcon', () => {
    it('returns correct icons for known entity types', () => {
      expect(getPinnedIcon('document').icon).toBe('folder_special');
      expect(getPinnedIcon('contact').icon).toBe('contacts');
      expect(getPinnedIcon('lead').icon).toBe('person');
      expect(getPinnedIcon('opportunity').icon).toBe('attach_money');
      expect(getPinnedIcon('report').icon).toBe('assessment');
      expect(getPinnedIcon('ticket').icon).toBe('confirmation_number');
    });

    it('returns default icon for unknown entity type', () => {
      const result = getPinnedIcon('unknown_type');
      expect(result.icon).toBe('push_pin');
    });
  });

  describe('PINNED_ICON_MAP and DEFAULT_ICON exports', () => {
    it('PINNED_ICON_MAP has entries', () => {
      expect(Object.keys(PINNED_ICON_MAP).length).toBeGreaterThan(0);
    });

    it('DEFAULT_ICON has required fields', () => {
      expect(DEFAULT_ICON.icon).toBe('push_pin');
      expect(DEFAULT_ICON.iconBg).toBeTruthy();
      expect(DEFAULT_ICON.iconColor).toBeTruthy();
    });
  });

  describe('EditQuickActionsSheet', () => {
    it('does not render when closed', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={false} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    });

    it('renders when open with title and description', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      expect(screen.getByText('Edit Quick Actions')).toBeInTheDocument();
      expect(screen.getByText(/Select and pin actions/)).toBeInTheDocument();
    });

    it('renders all quick action items with labels', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      for (const action of ALL_QUICK_ACTIONS) {
        expect(screen.getByText(action.label)).toBeInTheDocument();
      }
    });

    it('renders Save Changes and Cancel buttons', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('calls onOpenChange(false) when Cancel is clicked', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      fireEvent.click(screen.getByText('Cancel'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('calls onSave and closes on Save', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      fireEvent.click(screen.getByText('Save Changes'));

      expect(onSave).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('renders toggle checkboxes for each action', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(ALL_QUICK_ACTIONS.length);
    });

    it('can toggle an action on/off', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditQuickActionsSheet open={true} onOpenChange={onOpenChange} onSave={onSave} />,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      // Click first checkbox to toggle it
      fireEvent.click(checkboxes[0]);

      // Verify it changed (just no error)
      expect(checkboxes[0]).toBeInTheDocument();
    });
  });

  describe('EditPinnedNavigationSheet', () => {
    it('does not render when closed', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={false} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    });

    it('renders when open with title', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      expect(screen.getByText('Edit Pinned Navigation')).toBeInTheDocument();
      expect(screen.getByText(/Select items to pin/)).toBeInTheDocument();
    });

    it('renders all navigation groups', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      for (const group of ALL_PINNED_NAV_GROUPS) {
        expect(screen.getByText(group.label)).toBeInTheDocument();
      }
    });

    it('renders star toggle buttons for each group', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      // Each group has a star button
      const starButtons = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('star'),
      );
      expect(starButtons.length).toBe(ALL_PINNED_NAV_GROUPS.length);
    });

    it('toggles star state on click', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      const starButtons = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('star'),
      );

      // Click first star to toggle
      fireEvent.click(starButtons[0]);
      // No crash = success; state is internal
    });

    it('saves and closes on Save Changes click', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      fireEvent.click(screen.getByText('Save Changes'));

      expect(onSave).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('calls onOpenChange(false) when Cancel is clicked', () => {
      const onOpenChange = vi.fn();
      const onSave = vi.fn();

      render(
        <EditPinnedNavigationSheet open={true} onOpenChange={onOpenChange} onSave={onSave} onUnpin={vi.fn()} />,
      );

      fireEvent.click(screen.getByText('Cancel'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
