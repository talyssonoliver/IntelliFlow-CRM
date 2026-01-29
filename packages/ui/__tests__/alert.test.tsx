// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Alert, AlertTitle, AlertDescription } from '../src/components/alert';

describe('Alert', () => {
  describe('Rendering', () => {
    it('should render alert', () => {
      render(<Alert>Alert content</Alert>);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should render with title', () => {
      render(
        <Alert>
          <AlertTitle>Warning</AlertTitle>
        </Alert>
      );
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should render with description', () => {
      render(
        <Alert>
          <AlertDescription>This is a description</AlertDescription>
        </Alert>
      );
      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should render with title and description', () => {
      render(
        <Alert>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong</AlertDescription>
        </Alert>
      );
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<Alert>Default</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-background', 'text-foreground');
    });

    it('should render destructive variant', () => {
      render(<Alert variant="destructive">Error</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50', 'text-destructive');
    });

    it('should render success variant', () => {
      render(<Alert variant="success">Success</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-green-500/50', 'text-green-600', 'bg-green-50');
    });

    it('should render warning variant', () => {
      render(<Alert variant="warning">Warning</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-yellow-500/50', 'text-yellow-600', 'bg-yellow-50');
    });
  });

  describe('Styling', () => {
    it('should apply custom className to Alert', () => {
      render(<Alert className="custom-alert">Content</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('custom-alert');
    });

    it('should have base alert styles', () => {
      render(<Alert>Content</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('relative', 'w-full', 'rounded-lg', 'border', 'p-4');
    });

    it('should apply custom className to AlertTitle', () => {
      render(
        <Alert>
          <AlertTitle className="custom-title">Title</AlertTitle>
        </Alert>
      );
      expect(screen.getByText('Title')).toHaveClass('custom-title');
    });

    it('should have title styles', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );
      expect(screen.getByText('Title')).toHaveClass('mb-1', 'font-medium', 'leading-none');
    });

    it('should apply custom className to AlertDescription', () => {
      render(
        <Alert>
          <AlertDescription className="custom-desc">Description</AlertDescription>
        </Alert>
      );
      expect(screen.getByText('Description')).toHaveClass('custom-desc');
    });

    it('should have description styles', () => {
      render(
        <Alert>
          <AlertDescription>Description</AlertDescription>
        </Alert>
      );
      expect(screen.getByText('Description')).toHaveClass('text-sm');
    });
  });

  describe('Accessibility', () => {
    it('should have alert role', () => {
      render(<Alert>Content</Alert>);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to Alert', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Alert ref={ref}>Content</Alert>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('should forward ref to AlertTitle', () => {
      const ref = React.createRef<HTMLParagraphElement>();
      render(
        <Alert>
          <AlertTitle ref={ref}>Title</AlertTitle>
        </Alert>
      );
      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
    });

    it('should forward ref to AlertDescription', () => {
      const ref = React.createRef<HTMLParagraphElement>();
      render(
        <Alert>
          <AlertDescription ref={ref}>Description</AlertDescription>
        </Alert>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
