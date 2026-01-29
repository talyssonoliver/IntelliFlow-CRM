// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Checkbox } from '../src/components/checkbox';

describe('Checkbox', () => {
  describe('Rendering', () => {
    it('should render checkbox', () => {
      render(<Checkbox aria-label="Accept terms" />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('should render unchecked by default', () => {
      render(<Checkbox aria-label="Test checkbox" />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('should render checked when checked prop is true', () => {
      render(<Checkbox checked aria-label="Test checkbox" />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('Interaction', () => {
    it('should toggle checked state when clicked', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox onCheckedChange={onCheckedChange} aria-label="Test checkbox" />);

      await user.click(screen.getByRole('checkbox'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('should call onCheckedChange with false when unchecked', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox checked onCheckedChange={onCheckedChange} aria-label="Test checkbox" />);

      await user.click(screen.getByRole('checkbox'));
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Checkbox disabled aria-label="Test checkbox" />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('should not toggle when disabled', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox disabled onCheckedChange={onCheckedChange} aria-label="Test checkbox" />);

      await user.click(screen.getByRole('checkbox'));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('should have disabled styles', () => {
      render(<Checkbox disabled aria-label="Test checkbox" />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Checkbox className="custom-class" aria-label="Test checkbox" />);
      expect(screen.getByRole('checkbox')).toHaveClass('custom-class');
    });

    it('should have focus-visible styles', () => {
      render(<Checkbox aria-label="Test checkbox" />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    });

    it('should have checked styles when checked', () => {
      render(<Checkbox checked aria-label="Test checkbox" />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveClass('data-[state=checked]:bg-primary');
    });
  });

  describe('Accessibility', () => {
    it('should support aria-label', () => {
      render(<Checkbox aria-label="Agree to terms" />);
      expect(screen.getByRole('checkbox', { name: 'Agree to terms' })).toBeInTheDocument();
    });

    it('should forward id for label association', () => {
      render(
        <>
          <Checkbox id="terms" aria-label="Terms checkbox" />
          <label htmlFor="terms">Accept terms</label>
        </>
      );
      expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'terms');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Checkbox ref={ref} aria-label="Test checkbox" />);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
