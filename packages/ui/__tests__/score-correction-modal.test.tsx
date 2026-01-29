// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe } from 'vitest-axe';
import { ScoreCorrectionModal } from '../src/components/score';

describe('ScoreCorrectionModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    originalScore: 75,
    onSubmit: vi.fn(),
    isSubmitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render modal when open', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Correct AI Score')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(<ScoreCorrectionModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display original score', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByText('Original')).toBeInTheDocument();
      // Score appears in both original and corrected displays initially
      const scores = screen.getAllByText('75');
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it('should have score slider', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should have category selector', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByText(/why was the score incorrect/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should have reason textarea', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByPlaceholderText(/provide more context/i)).toBeInTheDocument();
    });

    it('should have cancel and submit buttons', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit correction/i })).toBeInTheDocument();
    });
  });

  describe('Score Adjustment', () => {
    it('should initialize slider with original score', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '75');
    });

    it('should show corrected score value', async () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      const slider = screen.getByRole('slider');

      // Use keyboard events to change the Radix UI slider value
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      // Both original and corrected should be visible
      await waitFor(() => {
        const scores = screen.getAllByText(/^\d+$/);
        expect(scores.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should display magnitude indicator when score changed', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);

      // Use keyboard events to change the Radix UI slider value
      const slider = screen.getByRole('slider');
      slider.focus();
      // Press ArrowRight multiple times to change value significantly
      for (let i = 0; i < 20; i++) {
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
      }

      await waitFor(() => {
        expect(screen.getByText(/20 points/i)).toBeInTheDocument();
      });
    });
  });

  describe('Category Selection', () => {
    it('should allow selecting a category', async () => {
      const user = userEvent.setup();
      render(<ScoreCorrectionModal {...defaultProps} />);

      const combobox = screen.getByRole('combobox');
      await user.click(combobox);

      await waitFor(() => {
        expect(screen.getByText('Score was too high')).toBeInTheDocument();
        expect(screen.getByText('Score was too low')).toBeInTheDocument();
        expect(screen.getByText('Incorrect factor weighting')).toBeInTheDocument();
        expect(screen.getByText('AI lacked relevant information')).toBeInTheDocument();
        expect(screen.getByText('Input data was poor')).toBeInTheDocument();
        expect(screen.getByText('Other reason')).toBeInTheDocument();
      });
    });
  });

  describe('Reason Input', () => {
    it('should allow entering reason text', async () => {
      render(<ScoreCorrectionModal {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/provide more context/i);
      // Use fireEvent for faster input instead of userEvent.type which is slow
      fireEvent.change(textarea, { target: { value: 'Lead was already a customer' } });

      expect(textarea).toHaveValue('Lead was already a customer');
    });

    it('should show character count', async () => {
      render(<ScoreCorrectionModal {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/provide more context/i);
      // Use fireEvent for faster input
      fireEvent.change(textarea, { target: { value: 'Test reason' } });

      expect(screen.getByText(/11\/1000/)).toBeInTheDocument();
    });

    it('should respect max length', async () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      const textarea = screen.getByPlaceholderText(/provide more context/i);
      expect(textarea).toHaveAttribute('maxLength', '1000');
    });
  });

  describe('Form Validation', () => {
    it('should disable submit when score not changed', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /submit correction/i })).toBeDisabled();
    });

    it('should disable submit when no category selected', async () => {
      render(<ScoreCorrectionModal {...defaultProps} />);

      // Change score but don't select category using keyboard
      const slider = screen.getByRole('slider');
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      expect(screen.getByRole('button', { name: /submit correction/i })).toBeDisabled();
    });

    it('should enable submit when score changed and category selected', async () => {
      const user = userEvent.setup();
      render(<ScoreCorrectionModal {...defaultProps} />);

      // Change score using keyboard
      const slider = screen.getByRole('slider');
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      // Select category
      const combobox = screen.getByRole('combobox');
      await user.click(combobox);
      await user.click(screen.getByText('Score was too low'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit correction/i })).not.toBeDisabled();
      });
    });
  });

  describe('Submission', () => {
    it('should call onSubmit with correction data', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ScoreCorrectionModal {...defaultProps} onSubmit={onSubmit} />);

      // Change score using keyboard (from 75 to 76)
      const slider = screen.getByRole('slider');
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      // Select category
      const combobox = screen.getByRole('combobox');
      await user.click(combobox);
      await user.click(screen.getByText('Score was too low'));

      // Add reason using fireEvent for speed
      const textarea = screen.getByPlaceholderText(/provide more context/i);
      fireEvent.change(textarea, { target: { value: 'Customer upgrade potential' } });

      // Submit
      await user.click(screen.getByRole('button', { name: /submit correction/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        correctedScore: 76,
        category: 'SCORE_TOO_LOW',
        reason: 'Customer upgrade potential',
      });
    });

    it('should call onSubmit without reason if empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ScoreCorrectionModal {...defaultProps} onSubmit={onSubmit} />);

      // Change score using keyboard (from 75 to 74)
      const slider = screen.getByRole('slider');
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });

      // Select category
      const combobox = screen.getByRole('combobox');
      await user.click(combobox);
      await user.click(screen.getByText('Score was too high'));

      // Submit without reason
      await user.click(screen.getByRole('button', { name: /submit correction/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        correctedScore: 74,
        category: 'SCORE_TOO_HIGH',
        reason: undefined,
      });
    });

    it('should show submitting state', () => {
      render(<ScoreCorrectionModal {...defaultProps} isSubmitting />);
      expect(screen.getByRole('button', { name: /submitting/i })).toBeInTheDocument();
    });

    it('should disable buttons during submission', () => {
      render(<ScoreCorrectionModal {...defaultProps} isSubmitting />);
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when cancel clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<ScoreCorrectionModal {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalled();
    });

    it('should reset form when reopened', async () => {
      const { rerender } = render(<ScoreCorrectionModal {...defaultProps} />);

      // Change score using keyboard
      const slider = screen.getByRole('slider');
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowRight' });

      // Close and reopen
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={false} />);
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={true} />);

      // Score should be reset to original
      await waitFor(() => {
        const newSlider = screen.getByRole('slider');
        expect(newSlider).toHaveAttribute('aria-valuenow', '75');
      });
    });
  });

  describe('Magnitude Labels', () => {
    it('should show minor for small corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);
      const slider = screen.getByRole('slider');
      slider.focus();
      // 5 arrow presses for small correction (5 points)
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
      }

      await waitFor(() => {
        expect(screen.getByText(/minor/i)).toBeInTheDocument();
      });
    });

    it('should show moderate for medium corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);
      const slider = screen.getByRole('slider');
      slider.focus();
      // 20 arrow presses for medium correction (20 points)
      for (let i = 0; i < 20; i++) {
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
      }

      await waitFor(() => {
        expect(screen.getByText(/moderate/i)).toBeInTheDocument();
      });
    });

    it('should show major for large corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);
      const slider = screen.getByRole('slider');
      slider.focus();
      // 40 arrow presses for large correction (40 points)
      for (let i = 0; i < 40; i++) {
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
      }

      await waitFor(() => {
        expect(screen.getByText(/major/i)).toBeInTheDocument();
      });
    });

    it('should show severe for very large corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={20} />);
      const slider = screen.getByRole('slider');
      slider.focus();
      // Press End key to go to max (100), a 80-point change
      fireEvent.keyDown(slider, { key: 'End' });

      await waitFor(() => {
        expect(screen.getByText(/severe/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<ScoreCorrectionModal {...defaultProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have accessible labels for all inputs', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      // Check slider is accessible
      expect(screen.getByRole('slider')).toBeInTheDocument();
      // Check category selector is accessible
      expect(screen.getByLabelText(/why was the score incorrect/i)).toBeInTheDocument();
      // Check reason textarea is accessible
      expect(screen.getByLabelText(/additional details/i)).toBeInTheDocument();
    });

    it('should have dialog description', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByText(/adjust the score and let us know why/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle original score of 0', () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={0} />);
      // Score appears in both original and corrected displays
      const scores = screen.getAllByText('0');
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle original score of 100', () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={100} />);
      // Score appears in both original and corrected displays
      const scores = screen.getAllByText('100');
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle rapid open/close', async () => {
      const { rerender } = render(<ScoreCorrectionModal {...defaultProps} isOpen={true} />);
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={false} />);
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
