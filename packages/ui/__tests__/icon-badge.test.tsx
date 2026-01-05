// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IconBadge } from '../src/components/icon-badge';

describe('IconBadge', () => {
  describe('Rendering', () => {
    it('should render with icon', () => {
      render(<IconBadge icon="star" />);
      expect(screen.getByText('star')).toBeInTheDocument();
    });

    it('should have aria-hidden on icon', () => {
      render(<IconBadge icon="star" />);
      const icon = screen.getByText('star');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply aria-label when label is provided', () => {
      render(<IconBadge icon="star" label="Favorite" />);
      const container = screen.getByRole('img', { name: 'Favorite' });
      expect(container).toBeInTheDocument();
    });

    it('should not have role when label is not provided', () => {
      const { container } = render(<IconBadge icon="star" />);
      expect(container.firstChild).not.toHaveAttribute('role');
    });
  });

  describe('Variants', () => {
    it('should apply primary variant by default', () => {
      const { container } = render(<IconBadge icon="star" />);
      expect(container.firstChild).toHaveClass('bg-primary/10', 'text-primary');
    });

    it('should apply secondary variant', () => {
      const { container } = render(<IconBadge icon="star" variant="secondary" />);
      expect(container.firstChild).toHaveClass('bg-secondary', 'text-secondary-foreground');
    });

    it('should apply success variant', () => {
      const { container } = render(<IconBadge icon="check" variant="success" />);
      expect(container.firstChild).toHaveClass('bg-green-100', 'text-green-600');
    });

    it('should apply warning variant', () => {
      const { container } = render(<IconBadge icon="warning" variant="warning" />);
      expect(container.firstChild).toHaveClass('bg-amber-100', 'text-amber-600');
    });

    it('should apply destructive variant', () => {
      const { container } = render(<IconBadge icon="error" variant="destructive" />);
      expect(container.firstChild).toHaveClass('bg-destructive/10', 'text-destructive');
    });

    it('should apply info variant', () => {
      const { container } = render(<IconBadge icon="info" variant="info" />);
      expect(container.firstChild).toHaveClass('bg-blue-100', 'text-blue-600');
    });

    it('should apply muted variant', () => {
      const { container } = render(<IconBadge icon="more" variant="muted" />);
      expect(container.firstChild).toHaveClass('bg-muted', 'text-muted-foreground');
    });
  });

  describe('Sizes', () => {
    it('should apply xs size', () => {
      const { container } = render(<IconBadge icon="star" size="xs" />);
      expect(container.firstChild).toHaveClass('h-6', 'w-6');
      expect(screen.getByText('star')).toHaveClass('text-sm');
    });

    it('should apply sm size', () => {
      const { container } = render(<IconBadge icon="star" size="sm" />);
      expect(container.firstChild).toHaveClass('h-8', 'w-8');
      expect(screen.getByText('star')).toHaveClass('text-base');
    });

    it('should apply md size by default', () => {
      const { container } = render(<IconBadge icon="star" />);
      expect(container.firstChild).toHaveClass('h-10', 'w-10');
      expect(screen.getByText('star')).toHaveClass('text-xl');
    });

    it('should apply lg size', () => {
      const { container } = render(<IconBadge icon="star" size="lg" />);
      expect(container.firstChild).toHaveClass('h-12', 'w-12');
      expect(screen.getByText('star')).toHaveClass('text-2xl');
    });

    it('should apply xl size', () => {
      const { container } = render(<IconBadge icon="star" size="xl" />);
      expect(container.firstChild).toHaveClass('h-14', 'w-14');
      expect(screen.getByText('star')).toHaveClass('text-3xl');
    });
  });

  describe('Shapes', () => {
    it('should apply rounded shape by default', () => {
      const { container } = render(<IconBadge icon="star" />);
      expect(container.firstChild).toHaveClass('rounded-lg');
    });

    it('should apply circle shape', () => {
      const { container } = render(<IconBadge icon="star" shape="circle" />);
      expect(container.firstChild).toHaveClass('rounded-full');
    });

    it('should apply square shape', () => {
      const { container } = render(<IconBadge icon="star" shape="square" />);
      expect(container.firstChild).toHaveClass('rounded-none');
    });
  });

  describe('Styling', () => {
    it('should be inline-flex centered', () => {
      const { container } = render(<IconBadge icon="star" />);
      expect(container.firstChild).toHaveClass('inline-flex', 'items-center', 'justify-center');
    });

    it('should accept custom className', () => {
      const { container } = render(<IconBadge icon="star" className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<IconBadge icon="star" data-testid="icon-badge" />);
      expect(screen.getByTestId('icon-badge')).toBeInTheDocument();
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<IconBadge ref={ref} icon="star" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
