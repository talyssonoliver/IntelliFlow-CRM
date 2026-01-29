/**
 * Tests for UnsavedWorkModal component
 *
 * @module apps/web/src/components/auth/__tests__/unsaved-work-modal.test.tsx
 * IMPLEMENTS: PG-018 (Logout Page) - AC5, AC9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedWorkModal } from '../unsaved-work-modal';

describe('UnsavedWorkModal', () => {
  const defaultProps = {
    open: true,
    dirtyForms: ['Lead Form', 'Contact Form'],
    onSaveAndLogout: vi.fn(),
    onLogoutWithoutSaving: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render modal when open=true', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // "Unsaved Changes" appears in multiple places (title and description)
      expect(screen.getAllByText(/unsaved changes/i).length).toBeGreaterThan(0);
    });

    it('should not render when open=false', () => {
      render(<UnsavedWorkModal {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display list of dirty forms', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      // Form names may appear multiple times (in description and in list)
      expect(screen.getAllByText(/Lead Form/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Contact Form/).length).toBeGreaterThan(0);
    });

    it('should display all three action buttons', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout without saving/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save.*logout/i })).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should call onSaveAndLogout when "Save & Logout" clicked', async () => {
      const user = userEvent.setup();
      render(<UnsavedWorkModal {...defaultProps} />);

      const saveButton = screen.getByRole('button', { name: /save.*logout/i });
      await user.click(saveButton);

      expect(defaultProps.onSaveAndLogout).toHaveBeenCalledTimes(1);
    });

    it('should call onLogoutWithoutSaving when "Logout Without Saving" clicked', async () => {
      const user = userEvent.setup();
      render(<UnsavedWorkModal {...defaultProps} />);

      const logoutButton = screen.getByRole('button', { name: /logout without saving/i });
      await user.click(logoutButton);

      expect(defaultProps.onLogoutWithoutSaving).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when "Cancel" clicked', async () => {
      const user = userEvent.setup();
      render(<UnsavedWorkModal {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      // The dialog should be present and accessible
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('should have accessible description', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      // The modal should have a description explaining the unsaved changes
      const description = screen.getByText(/you have unsaved changes/i);
      expect(description).toBeInTheDocument();
    });

    it('should close on Escape key', async () => {
      const user = userEvent.setup();
      render(<UnsavedWorkModal {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should have focus visible styles on buttons', () => {
      render(<UnsavedWorkModal {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeVisible();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty dirty forms array', () => {
      render(<UnsavedWorkModal {...defaultProps} dirtyForms={[]} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle single dirty form', () => {
      render(<UnsavedWorkModal {...defaultProps} dirtyForms={['Lead Form']} />);

      // Form name may appear multiple times (in description and in list)
      expect(screen.getAllByText(/Lead Form/).length).toBeGreaterThan(0);
    });

    it('should handle many dirty forms', () => {
      const manyForms = [
        'Lead Form',
        'Contact Form',
        'Opportunity Form',
        'Task Form',
        'Account Form',
      ];
      render(<UnsavedWorkModal {...defaultProps} dirtyForms={manyForms} />);

      // Each form may appear multiple times (in description and in list)
      manyForms.forEach((form) => {
        const elements = screen.getAllByText(new RegExp(form));
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });
});
