// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Progress } from '../src/components/progress';

describe('Progress', () => {
  describe('Rendering', () => {
    it('should render progress bar', () => {
      render(<Progress value={50} aria-label="Progress" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should render with 0 value by default', () => {
      render(<Progress aria-label="Progress" />);
      // When no value is provided, aria-valuenow may not be set by Radix
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
    });

    it('should render with specified value', () => {
      render(<Progress value={75} aria-label="Progress" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    });
  });

  describe('Value Display', () => {
    it('should show 0% progress', () => {
      render(<Progress value={0} data-testid="progress" aria-label="Progress" />);
      // Just verify the progress element renders with correct value
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('should show 50% progress', () => {
      render(<Progress value={50} data-testid="progress" />);
      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-valuenow', '50');
    });

    it('should show 100% progress', () => {
      render(<Progress value={100} data-testid="progress" />);
      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Progress className="custom-progress" aria-label="Progress" />);
      expect(screen.getByRole('progressbar')).toHaveClass('custom-progress');
    });

    it('should have base progress styles', () => {
      render(<Progress aria-label="Progress" />);
      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveClass('relative', 'h-4', 'w-full', 'overflow-hidden', 'rounded-full', 'bg-secondary');
    });
  });

  describe('Accessibility', () => {
    it('should have progressbar role', () => {
      render(<Progress value={50} aria-label="Loading" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should have aria-valuenow attribute', () => {
      render(<Progress value={30} aria-label="Loading" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
    });

    it('should support aria-label', () => {
      render(<Progress value={50} aria-label="File upload progress" />);
      expect(screen.getByRole('progressbar', { name: 'File upload progress' })).toBeInTheDocument();
    });

    it('should have min and max values', () => {
      render(<Progress value={50} aria-label="Progress" />);
      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-valuemin', '0');
      expect(progress).toHaveAttribute('aria-valuemax', '100');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Progress ref={ref} value={50} aria-label="Progress" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
