// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { ConfidenceIndicator } from '../src/components/score/ConfidenceIndicator';

describe('ConfidenceIndicator', () => {
  describe('Rendering', () => {
    it('should render confidence percentage', () => {
      render(<ConfidenceIndicator confidence={0.85} />);
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should render label when showLabel is true', () => {
      render(<ConfidenceIndicator confidence={0.85} showLabel />);
      expect(screen.getByText('High Confidence')).toBeInTheDocument();
    });

    it('should render description when showDescription is true', () => {
      render(<ConfidenceIndicator confidence={0.85} showDescription />);
      expect(screen.getByText(/very confident/i)).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      render(<ConfidenceIndicator confidence={0.85} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Confidence Levels', () => {
    it('should apply success styling for high confidence (>= 0.8)', () => {
      render(<ConfidenceIndicator confidence={0.9} data-testid="indicator" />);
      const progressFill = screen.getByRole('progressbar').querySelector('[data-level="high"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply warning styling for medium confidence (0.5-0.8)', () => {
      render(<ConfidenceIndicator confidence={0.6} data-testid="indicator" />);
      const progressFill = screen.getByRole('progressbar').querySelector('[data-level="medium"]');
      expect(progressFill).toBeInTheDocument();
    });

    it('should apply destructive styling for low confidence (< 0.5)', () => {
      render(<ConfidenceIndicator confidence={0.3} data-testid="indicator" />);
      const progressFill = screen.getByRole('progressbar').querySelector('[data-level="low"]');
      expect(progressFill).toBeInTheDocument();
    });
  });

  describe('Labels', () => {
    it('should show "High Confidence" for >= 0.8', () => {
      render(<ConfidenceIndicator confidence={0.85} showLabel />);
      expect(screen.getByText('High Confidence')).toBeInTheDocument();
    });

    it('should show "Medium Confidence" for 0.5-0.8', () => {
      render(<ConfidenceIndicator confidence={0.65} showLabel />);
      expect(screen.getByText('Medium Confidence')).toBeInTheDocument();
    });

    it('should show "Low Confidence" for < 0.5', () => {
      render(<ConfidenceIndicator confidence={0.3} showLabel />);
      expect(screen.getByText('Low Confidence')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<ConfidenceIndicator confidence={0.85} size="sm" data-testid="indicator" />);
      const indicator = screen.getByTestId('indicator');
      expect(indicator).toHaveClass('text-xs');
    });

    it('should render medium size', () => {
      render(<ConfidenceIndicator confidence={0.85} size="md" data-testid="indicator" />);
      const indicator = screen.getByTestId('indicator');
      expect(indicator).toHaveClass('text-sm');
    });

    it('should render large size', () => {
      render(<ConfidenceIndicator confidence={0.85} size="lg" data-testid="indicator" />);
      const indicator = screen.getByTestId('indicator');
      expect(indicator).toHaveClass('text-base');
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(<ConfidenceIndicator confidence={0.85} data-testid="test-indicator" />);
      expect(screen.getByTestId('test-indicator')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ConfidenceIndicator
          confidence={0.85}
          className="custom-class"
          data-testid="indicator"
        />
      );
      expect(screen.getByTestId('indicator')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ConfidenceIndicator confidence={0.85} showLabel showDescription />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have appropriate aria-label', () => {
      render(<ConfidenceIndicator confidence={0.85} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('confidence')
      );
    });

    it('should have aria-valuenow reflecting confidence', () => {
      render(<ConfidenceIndicator confidence={0.85} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85');
    });
  });

  describe('Edge Cases', () => {
    it('should handle confidence of 0', () => {
      render(<ConfidenceIndicator confidence={0} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should handle confidence of 1', () => {
      render(<ConfidenceIndicator confidence={1} />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should round decimal percentages', () => {
      render(<ConfidenceIndicator confidence={0.856} />);
      expect(screen.getByText('86%')).toBeInTheDocument();
    });
  });
});
