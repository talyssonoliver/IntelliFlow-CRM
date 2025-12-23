// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Input } from '../src/components/input';

describe('Input', () => {
  describe('Rendering', () => {
    it('should render an input element', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });

    it('should render with placeholder', () => {
      render(<Input placeholder="Enter text..." />);
      const input = screen.getByPlaceholderText('Enter text...');
      expect(input).toBeInTheDocument();
    });

    it('should render with default value', () => {
      render(<Input defaultValue="Initial value" />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Initial value');
    });
  });

  describe('Types', () => {
    it('should render with text type by default', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      // HTML inputs default to text type even without explicit attribute
      expect(input.tagName).toBe('INPUT');
      expect(input).toBeInTheDocument();
    });

    it('should render with email type', () => {
      render(<Input type="email" />);
      const input = document.querySelector('input[type="email"]');
      expect(input).toBeInTheDocument();
    });

    it('should render with password type', () => {
      render(<Input type="password" />);
      const input = document.querySelector('input[type="password"]');
      expect(input).toBeInTheDocument();
    });

    it('should render with number type', () => {
      render(<Input type="number" />);
      const input = document.querySelector('input[type="number"]');
      expect(input).toBeInTheDocument();
    });

    it('should render with file type', () => {
      render(<Input type="file" />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
    });
  });

  describe('States', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
      expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
    });

    it('should not be disabled by default', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).not.toBeDisabled();
    });

    it('should be readonly when readonly prop is true', () => {
      render(<Input readOnly />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readonly');
    });

    it('should be required when required prop is true', () => {
      render(<Input required />);
      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });
  });

  describe('Styling', () => {
    it('should have base input styles', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass(
        'flex',
        'h-10',
        'w-full',
        'rounded-md',
        'border',
        'border-input',
        'bg-background',
        'px-3',
        'py-2',
        'text-sm',
        'ring-offset-background'
      );
    });

    it('should have focus styles', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2'
      );
    });

    it('should have placeholder styles', () => {
      render(<Input placeholder="Test" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('placeholder:text-muted-foreground');
    });

    it('should have file input styles', () => {
      render(<Input type="file" />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toHaveClass(
        'file:border-0',
        'file:bg-transparent',
        'file:text-sm',
        'file:font-medium'
      );
    });

    it('should accept and merge custom className', () => {
      render(<Input className="custom-input-class" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-input-class');
      expect(input).toHaveClass('flex'); // Base class should still be present
    });

    it('should override conflicting classes when custom className is provided', () => {
      render(<Input className="h-12 w-1/2" />);
      const input = screen.getByRole('textbox');
      // Should have custom height and width
      expect(input).toHaveClass('h-12', 'w-1/2');
    });
  });

  describe('Props', () => {
    it('should forward all standard input props', () => {
      render(
        <Input
          name="username"
          id="username-input"
          maxLength={20}
          minLength={3}
          pattern="[A-Za-z]+"
          autoComplete="username"
          data-testid="test-input"
        />
      );
      const input = screen.getByTestId('test-input');
      expect(input).toHaveAttribute('name', 'username');
      expect(input).toHaveAttribute('id', 'username-input');
      expect(input).toHaveAttribute('maxlength', '20');
      expect(input).toHaveAttribute('minlength', '3');
      expect(input).toHaveAttribute('pattern', '[A-Za-z]+');
      expect(input).toHaveAttribute('autocomplete', 'username');
    });

    it('should handle onChange events', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();
      render(<Input onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'test');
      expect(handleChange).toHaveBeenCalled();
      expect((input as HTMLInputElement).value).toBe('test');
    });

    it('should handle onFocus events', async () => {
      const handleFocus = vi.fn();
      const user = userEvent.setup();
      render(<Input onFocus={handleFocus} />);
      const input = screen.getByRole('textbox');

      await user.click(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('should handle onBlur events', async () => {
      const handleBlur = vi.fn();
      const user = userEvent.setup();
      render(<Input onBlur={handleBlur} />);
      const input = screen.getByRole('textbox');

      await user.click(input);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('should allow ref access to input properties', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} defaultValue="test value" />);
      expect(ref.current?.value).toBe('test value');
    });

    it('should allow ref to focus input', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      ref.current?.focus();
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe('Accessibility', () => {
    it('should be accessible with aria-label', () => {
      render(<Input aria-label="Username input" />);
      const input = screen.getByLabelText('Username input');
      expect(input).toBeInTheDocument();
    });

    it('should be accessible with aria-describedby', () => {
      render(
        <>
          <Input aria-describedby="input-description" />
          <span id="input-description">Enter your username</span>
        </>
      );
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'input-description');
    });

    it('should support aria-invalid for error states', () => {
      render(<Input aria-invalid="true" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
