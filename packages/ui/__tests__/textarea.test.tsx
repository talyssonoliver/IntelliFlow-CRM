// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Textarea } from '../src/components/textarea';

describe('Textarea', () => {
  describe('Rendering', () => {
    it('should render textarea', () => {
      render(<Textarea aria-label="Message" />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with placeholder', () => {
      render(<Textarea placeholder="Enter your message" />);
      expect(screen.getByPlaceholderText('Enter your message')).toBeInTheDocument();
    });

    it('should render with default value', () => {
      render(<Textarea defaultValue="Initial text" aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveValue('Initial text');
    });
  });

  describe('User Interaction', () => {
    it('should update value when typing', async () => {
      const user = userEvent.setup();
      render(<Textarea aria-label="Message" />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello World');
      expect(textarea).toHaveValue('Hello World');
    });

    it('should call onChange handler', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Textarea onChange={onChange} aria-label="Message" />);

      await user.type(screen.getByRole('textbox'), 'a');
      expect(onChange).toHaveBeenCalled();
    });

    it('should handle multiline input', async () => {
      const user = userEvent.setup();
      render(<Textarea aria-label="Message" />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Line 1{enter}Line 2');
      expect(textarea).toHaveValue('Line 1\nLine 2');
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Textarea disabled aria-label="Message" />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('should not allow typing when disabled', async () => {
      const user = userEvent.setup();
      render(<Textarea disabled defaultValue="" aria-label="Message" />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test');
      expect(textarea).toHaveValue('');
    });

    it('should have disabled styles', () => {
      render(<Textarea disabled aria-label="Message" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Textarea className="custom-textarea" aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveClass('custom-textarea');
    });

    it('should have base textarea styles', () => {
      render(<Textarea aria-label="Message" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass(
        'flex',
        'min-h-[80px]',
        'w-full',
        'rounded-md',
        'border',
        'border-input',
        'bg-background',
        'px-3',
        'py-2',
        'text-sm'
      );
    });

    it('should have focus-visible styles', () => {
      render(<Textarea aria-label="Message" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring'
      );
    });

    it('should have placeholder styles', () => {
      render(<Textarea aria-label="Message" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('placeholder:text-muted-foreground');
    });
  });

  describe('Props', () => {
    it('should forward rows prop', () => {
      render(<Textarea rows={5} aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
    });

    it('should forward cols prop', () => {
      render(<Textarea cols={40} aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('cols', '40');
    });

    it('should forward name prop', () => {
      render(<Textarea name="message" aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'message');
    });

    it('should forward id prop', () => {
      render(<Textarea id="message-input" aria-label="Message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'message-input');
    });
  });

  describe('Accessibility', () => {
    it('should support aria-label', () => {
      render(<Textarea aria-label="Comment field" />);
      expect(screen.getByRole('textbox', { name: 'Comment field' })).toBeInTheDocument();
    });

    it('should support aria-describedby', () => {
      render(
        <>
          <Textarea aria-describedby="help-text" aria-label="Message" />
          <span id="help-text">Enter your message</span>
        </>
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('should support required attribute', () => {
      render(<Textarea required aria-label="Message" />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} aria-label="Message" />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });
  });
});
