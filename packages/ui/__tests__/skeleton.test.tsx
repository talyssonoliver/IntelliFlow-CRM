// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton, SkeletonList } from '../src/components/skeleton';

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

describe('SkeletonList', () => {
  it('renders the correct number of skeletons', () => {
    const { container } = render(<SkeletonList count={3} data-testid="skeleton-list" />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(3);
  });

  it('applies itemClassName to each skeleton', () => {
    const { container } = render(<SkeletonList count={2} itemClassName="h-4" />);
    const skeletons = container.querySelectorAll('.h-4');
    expect(skeletons).toHaveLength(2);
  });

  it('applies container className', () => {
    render(<SkeletonList count={1} className="my-container" data-testid="list" />);
    expect(screen.getByTestId('list')).toHaveClass('my-container');
  });

  it('uses custom keyPrefix', () => {
    // Should render without errors using custom keyPrefix
    const { container } = render(<SkeletonList count={2} keyPrefix="test" />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('renders 0 skeletons when count is 0', () => {
    const { container } = render(<SkeletonList count={0} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});
