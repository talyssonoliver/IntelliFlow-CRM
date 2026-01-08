// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { ScoreCorrectionModal } from '../src/components/score/ScoreCorrectionModal';

expect.extend(toHaveNoViolations);

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
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    it('should have score slider', () => {
      render(<ScoreCorrectionModal {...defaultProps} />);
      expect(screen.getByRole('slider', { name: /corrected score/i })).toBeInTheDocument();
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
      fireEvent.change(slider, { target: { value: '85' } });

      // Both original and corrected should be visible
      await waitFor(() => {
        const scores = screen.getAllByText(/^\d+$/);
        expect(scores.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should display magnitude indicator when score changed', async () => {
      const user = userEvent.setup();
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);

      // Trigger slider change
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '70' } });

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

      // Change score but don't select category
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '85' } });

      expect(screen.getByRole('button', { name: /submit correction/i })).toBeDisabled();
    });

    it('should enable submit when score changed and category selected', async () => {
      const user = userEvent.setup();
      render(<ScoreCorrectionModal {...defaultProps} />);

      // Change score
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '85' } });

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

      // Change score
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '85' } });

      // Select category
      const combobox = screen.getByRole('combobox');
      await user.click(combobox);
      await user.click(screen.getByText('Score was too low'));

      // Add reason
      const textarea = screen.getByPlaceholderText(/provide more context/i);
      await user.type(textarea, 'Customer upgrade potential');

      // Submit
      await user.click(screen.getByRole('button', { name: /submit correction/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        correctedScore: 85,
        category: 'SCORE_TOO_LOW',
        reason: 'Customer upgrade potential',
      });
    });

    it('should call onSubmit without reason if empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<ScoreCorrectionModal {...defaultProps} onSubmit={onSubmit} />);

      // Change score
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '60' } });

      // Select category
      const combobox = screen.getByRole('combobox');
      await user.click(combobox);
      await user.click(screen.getByText('Score was too high'));

      // Submit without reason
      await user.click(screen.getByRole('button', { name: /submit correction/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        correctedScore: 60,
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

      // Change score
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '90' } });

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
      fireEvent.change(slider, { target: { value: '55' } });

      await waitFor(() => {
        expect(screen.getByText(/minor/i)).toBeInTheDocument();
      });
    });

    it('should show moderate for medium corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '70' } });

      await waitFor(() => {
        expect(screen.getByText(/moderate/i)).toBeInTheDocument();
      });
    });

    it('should show major for large corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={50} />);
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '90' } });

      await waitFor(() => {
        expect(screen.getByText(/major/i)).toBeInTheDocument();
      });
    });

    it('should show severe for very large corrections', async () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={20} />);
      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '90' } });

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
      expect(screen.getByLabelText(/what should the score be/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/why was the score incorrect/i)).toBeInTheDocument();
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
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle original score of 100', () => {
      render(<ScoreCorrectionModal {...defaultProps} originalScore={100} />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should handle rapid open/close', async () => {
      const { rerender } = render(<ScoreCorrectionModal {...defaultProps} isOpen={true} />);
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={false} />);
      rerender(<ScoreCorrectionModal {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
