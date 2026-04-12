// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from '../src/components/skeleton';

describe('Skeleton', () => {
  describe('Rendering', () => {
    it('should render skeleton', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    });

    it('should render as div element', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton').tagName).toBe('DIV');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Skeleton className="custom-skeleton" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('custom-skeleton');
    });

    it('should have base skeleton styles', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('animate-pulse', 'rounded-md', 'bg-muted');
    });

    it('should allow custom width and height', () => {
      render(<Skeleton className="h-12 w-12" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('h-12', 'w-12');
    });
  });

  describe('Props', () => {
    it('should forward other HTML attributes', () => {
      render(<Skeleton data-testid="skeleton" aria-hidden="true" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Common Use Cases', () => {
    it('should render text skeleton', () => {
      render(<Skeleton className="h-4 w-[250px]" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('h-4', 'w-[250px]');
    });

    it('should render avatar skeleton', () => {
      render(<Skeleton className="h-12 w-12 rounded-full" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('h-12', 'w-12', 'rounded-full');
    });

    it('should render card skeleton', () => {
      render(
        <div className="flex flex-col space-y-3">
          <Skeleton className="h-[125px] w-[250px]" data-testid="skeleton-card" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" data-testid="skeleton-title" />
            <Skeleton className="h-4 w-[200px]" data-testid="skeleton-text" />
          </div>
        </div>
      );
      expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-title')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-text')).toBeInTheDocument();
    });
  });
});
