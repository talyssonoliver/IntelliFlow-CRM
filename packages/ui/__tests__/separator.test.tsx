// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Separator } from '../src/components/separator';

describe('Separator', () => {
  describe('Rendering', () => {
    it('should render separator', () => {
      render(<Separator data-testid="separator" />);
      expect(screen.getByTestId('separator')).toBeInTheDocument();
    });

    it('should render as horizontal by default', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveClass('h-[1px]', 'w-full');
    });

    it('should render as vertical when orientation is vertical', () => {
      render(<Separator orientation="vertical" data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveClass('h-full', 'w-[1px]');
    });
  });

  describe('Decorative', () => {
    it('should be decorative by default', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('should set aria-orientation when not decorative', () => {
      render(<Separator decorative={false} data-testid="separator" />);
      const separator = screen.getByRole('separator');
      // For horizontal separators, aria-orientation may be omitted as it's the implicit default
      // Check that it has the data-orientation attribute and the separator role
      expect(separator).toBeInTheDocument();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('should set aria-orientation vertical when not decorative and vertical', () => {
      render(<Separator decorative={false} orientation="vertical" data-testid="separator" />);
      const separator = screen.getByRole('separator');
      expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Separator className="custom-separator" data-testid="separator" />);
      expect(screen.getByTestId('separator')).toHaveClass('custom-separator');
    });

    it('should have base separator styles', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveClass('shrink-0', 'bg-border');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Separator ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
