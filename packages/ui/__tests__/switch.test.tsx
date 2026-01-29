// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Switch } from '../src/components/switch';

describe('Switch', () => {
  describe('Rendering', () => {
    it('should render switch', () => {
      render(<Switch aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('should render unchecked by default', () => {
      render(<Switch aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
    });

    it('should render checked when checked prop is true', () => {
      render(<Switch checked aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('Interaction', () => {
    it('should toggle when clicked', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Switch onCheckedChange={onCheckedChange} aria-label="Toggle" />);

      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('should toggle off when checked and clicked', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Switch checked onCheckedChange={onCheckedChange} aria-label="Toggle" />);

      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Switch disabled aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toBeDisabled();
    });

    it('should not toggle when disabled', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Switch disabled onCheckedChange={onCheckedChange} aria-label="Toggle" />);

      await user.click(screen.getByRole('switch'));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('should have disabled styles', () => {
      render(<Switch disabled aria-label="Toggle" />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Switch className="custom-class" aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toHaveClass('custom-class');
    });

    it('should have focus-visible styles', () => {
      render(<Switch aria-label="Toggle" />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    });

    it('should have checked background when checked', () => {
      render(<Switch checked aria-label="Toggle" />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveClass('data-[state=checked]:bg-primary');
    });
  });

  describe('Accessibility', () => {
    it('should support aria-label', () => {
      render(<Switch aria-label="Enable notifications" />);
      expect(screen.getByRole('switch', { name: 'Enable notifications' })).toBeInTheDocument();
    });

    it('should have switch role', () => {
      render(<Switch aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('should announce checked state', () => {
      render(<Switch checked aria-label="Toggle" />);
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Switch ref={ref} aria-label="Toggle" />);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
