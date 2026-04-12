// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Label } from '../src/components/label';

describe('Label', () => {
  describe('Rendering', () => {
    it('should render a label element', () => {
      render(<Label>Username</Label>);
      const label = screen.getByText('Username');
      expect(label).toBeInTheDocument();
    });

    it('should render with htmlFor attribute', () => {
      render(<Label htmlFor="username-input">Username</Label>);
      const label = screen.getByText('Username');
      expect(label).toHaveAttribute('for', 'username-input');
    });

    it('should render with children content', () => {
      render(
        <Label>
          Email <span className="text-red-500">*</span>
        </Label>
      );
      const label = screen.getByText(/Email/);
      expect(label).toBeInTheDocument();
      expect(label.querySelector('.text-red-500')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have base label styles', () => {
      render(<Label>Test Label</Label>);
      const label = screen.getByText('Test Label');
      expect(label).toHaveClass(
        'text-sm',
        'font-medium',
        'leading-none',
        'peer-disabled:cursor-not-allowed',
        'peer-disabled:opacity-70'
      );
    });

    it('should accept and merge custom className', () => {
      render(<Label className="custom-label-class">Custom Label</Label>);
      const label = screen.getByText('Custom Label');
      expect(label).toHaveClass('custom-label-class');
      expect(label).toHaveClass('text-sm'); // Base class should still be present
    });

    it('should override conflicting classes when custom className is provided', () => {
      render(<Label className="text-lg font-bold">Large Label</Label>);
      const label = screen.getByText('Large Label');
      // Should have custom classes
      expect(label).toHaveClass('text-lg', 'font-bold');
    });
  });

  describe('Props', () => {
    it('should forward standard label attributes', () => {
      render(
        <Label id="test-label" data-testid="label-test" title="Label title">
          Test
        </Label>
      );
      const label = screen.getByTestId('label-test');
      expect(label).toHaveAttribute('id', 'test-label');
      expect(label).toHaveAttribute('title', 'Label title');
    });

    it('should work with input association', () => {
      render(
        <>
          <Label htmlFor="email-input">Email Address</Label>
          <input id="email-input" type="email" />
        </>
      );
      const label = screen.getByText('Email Address');
      const input = screen.getByRole('textbox');
      expect(label).toHaveAttribute('for', 'email-input');
      expect(input).toHaveAttribute('id', 'email-input');
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLLabelElement>();
      render(<Label ref={ref}>Ref Label</Label>);
      expect(ref.current).toBeInstanceOf(HTMLLabelElement);
      expect(ref.current?.textContent).toBe('Ref Label');
    });

    it('should allow ref to access label element', () => {
      const ref = React.createRef<HTMLLabelElement>();
      render(
        <Label ref={ref} htmlFor="test-input">
          Test Label
        </Label>
      );
      expect(ref.current?.getAttribute('for')).toBe('test-input');
    });
  });

  describe('Accessibility', () => {
    it('should be accessible when associated with input', () => {
      render(
        <>
          <Label htmlFor="accessible-input">Accessible Input</Label>
          <input id="accessible-input" />
        </>
      );
      const label = screen.getByText('Accessible Input');
      const input = document.getElementById('accessible-input');
      expect(label).toBeInTheDocument();
      expect(input).toBeInTheDocument();
    });

    it('should support aria attributes', () => {
      render(
        <Label aria-label="Custom aria label" aria-describedby="description">
          Label Text
        </Label>
      );
      const label = screen.getByText('Label Text');
      expect(label).toHaveAttribute('aria-label', 'Custom aria label');
      expect(label).toHaveAttribute('aria-describedby', 'description');
    });
  });

  describe('Peer Disabled State', () => {
    it('should have peer-disabled cursor styles', () => {
      render(<Label>Disabled Peer Label</Label>);
      const label = screen.getByText('Disabled Peer Label');
      expect(label).toHaveClass('peer-disabled:cursor-not-allowed');
    });

    it('should have peer-disabled opacity styles', () => {
      render(<Label>Disabled Peer Label</Label>);
      const label = screen.getByText('Disabled Peer Label');
      expect(label).toHaveClass('peer-disabled:opacity-70');
    });

    it('should work with disabled peer input', () => {
      render(
        <div>
          <input className="peer" disabled id="disabled-input" />
          <Label htmlFor="disabled-input">Disabled Input Label</Label>
        </div>
      );
      const label = screen.getByText('Disabled Input Label');
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
      expect(label).toHaveClass('peer-disabled:cursor-not-allowed');
    });
  });

  describe('Radix UI Integration', () => {
    it('should use Radix UI Label primitive', () => {
      render(<Label>Radix Label</Label>);
      const label = screen.getByText('Radix Label');
      // The label should be rendered as a label element
      expect(label.tagName).toBe('LABEL');
    });

    it('should have correct display name', () => {
      expect(Label.displayName).toBeDefined();
    });
  });
});
