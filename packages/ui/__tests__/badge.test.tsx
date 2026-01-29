// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../src/components/badge';

describe('Badge', () => {
  describe('Rendering', () => {
    it('should render badge', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should render children correctly', () => {
      render(<Badge>Custom Content</Badge>);
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<Badge variant="default">Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should render secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary', 'text-secondary-foreground');
    });

    it('should render destructive variant', () => {
      render(<Badge variant="destructive">Destructive</Badge>);
      const badge = screen.getByText('Destructive');
      expect(badge).toHaveClass('bg-destructive', 'text-destructive-foreground');
    });

    it('should render outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      const badge = screen.getByText('Outline');
      expect(badge).toHaveClass('text-foreground');
    });

    it('should render success variant', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByText('Success');
      expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('should render warning variant', () => {
      render(<Badge variant="warning">Warning</Badge>);
      const badge = screen.getByText('Warning');
      expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Badge className="custom-badge">Custom</Badge>);
      expect(screen.getByText('Custom')).toHaveClass('custom-badge');
    });

    it('should have base badge styles', () => {
      render(<Badge>Base</Badge>);
      const badge = screen.getByText('Base');
      expect(badge).toHaveClass(
        'inline-flex',
        'items-center',
        'rounded-full',
        'border',
        'px-2.5',
        'py-0.5',
        'text-xs',
        'font-semibold'
      );
    });

    it('should have focus styles', () => {
      render(<Badge>Focus</Badge>);
      const badge = screen.getByText('Focus');
      expect(badge).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-ring');
    });

    it('should have hover styles', () => {
      render(<Badge variant="default">Hover</Badge>);
      const badge = screen.getByText('Hover');
      expect(badge).toHaveClass('hover:bg-primary/80');
    });
  });

  describe('Props', () => {
    it('should forward other HTML attributes', () => {
      render(<Badge data-testid="test-badge">Test</Badge>);
      expect(screen.getByTestId('test-badge')).toBeInTheDocument();
    });

    it('should apply onClick handler', () => {
      const handleClick = vi.fn();
      render(<Badge onClick={handleClick}>Clickable</Badge>);
      screen.getByText('Clickable').click();
      expect(handleClick).toHaveBeenCalled();
    });
  });
});

// Import vi for mock function
import { vi } from 'vitest';
