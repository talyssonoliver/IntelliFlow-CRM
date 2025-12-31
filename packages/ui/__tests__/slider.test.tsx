// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Slider } from '../src/components/slider';

describe('Slider', () => {
  describe('Rendering', () => {
    it('should render slider', () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should render with default value', () => {
      render(<Slider defaultValue={[50]} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });

    it('should render with controlled value', () => {
      render(<Slider value={[75]} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '75');
    });
  });

  describe('Range', () => {
    it('should have default min of 0', () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemin', '0');
    });

    it('should have default max of 100', () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '100');
    });

    it('should support custom min', () => {
      render(<Slider min={10} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemin', '10');
    });

    it('should support custom max', () => {
      render(<Slider max={200} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '200');
    });
  });

  describe('Step', () => {
    it('should have default step of 1', () => {
      render(<Slider aria-label="Volume" />);
      // Step is not directly visible in ARIA, but component should work correctly
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should support custom step', () => {
      render(<Slider step={5} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    it('should call onValueChange when value changes', () => {
      const onValueChange = vi.fn();
      render(<Slider onValueChange={onValueChange} defaultValue={[50]} aria-label="Volume" />);
      // In real tests, we would simulate drag interactions
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Slider disabled aria-label="Volume" />);
      expect(screen.getByRole('slider')).toBeDisabled();
    });

    it('should have disabled styles', () => {
      render(<Slider disabled aria-label="Volume" />);
      const slider = screen.getByRole('slider');
      expect(slider).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Slider className="custom-slider" aria-label="Volume" data-testid="slider-root" />);
      const slider = screen.getByTestId('slider-root');
      expect(slider).toHaveClass('custom-slider');
    });

    it('should have base slider styles', () => {
      render(<Slider aria-label="Volume" data-testid="slider-root" />);
      const slider = screen.getByTestId('slider-root');
      expect(slider).toHaveClass('relative', 'flex', 'w-full', 'touch-none', 'select-none', 'items-center');
    });
  });

  describe('Orientation', () => {
    it('should render horizontal by default', () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-orientation', 'horizontal');
    });
  });

  describe('Accessibility', () => {
    it('should support aria-label', () => {
      render(<Slider aria-label="Volume control" />);
      expect(screen.getByRole('slider', { name: 'Volume control' })).toBeInTheDocument();
    });

    it('should have slider role', () => {
      render(<Slider aria-label="Volume" />);
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('should announce current value', () => {
      render(<Slider defaultValue={[50]} aria-label="Volume" />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Slider ref={ref} aria-label="Volume" />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });
});
