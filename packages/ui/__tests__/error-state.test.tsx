// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '../src/components/error-state';

describe('ErrorState', () => {
  describe('Rendering', () => {
    it('should render with default title', () => {
      render(<ErrorState message="Failed to load data." />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render with custom title', () => {
      render(<ErrorState title="Connection Error" message="Unable to connect to server." />);
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
    });

    it('should render message', () => {
      render(<ErrorState message="Please try again later." />);
      expect(screen.getByText('Please try again later.')).toBeInTheDocument();
    });

    it('should have role="alert"', () => {
      render(<ErrorState message="Error occurred" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('should render default error icon', () => {
      render(<ErrorState message="Error" />);
      expect(screen.getByText('error_outline')).toBeInTheDocument();
    });

    it('should render custom icon', () => {
      render(<ErrorState message="Error" icon="wifi_off" />);
      expect(screen.getByText('wifi_off')).toBeInTheDocument();
    });

    it('should have aria-hidden on icon', () => {
      render(<ErrorState message="Error" />);
      const icon = screen.getByText('error_outline');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Variants', () => {
    it('should apply error variant styles', () => {
      render(<ErrorState message="Error" variant="error" />);
      const icon = screen.getByText('error_outline');
      expect(icon).toHaveClass('text-destructive');
    });

    it('should apply warning variant styles and icon', () => {
      render(<ErrorState message="Warning" variant="warning" />);
      expect(screen.getByText('warning_amber')).toBeInTheDocument();
      const icon = screen.getByText('warning_amber');
      expect(icon).toHaveClass('text-amber-600');
    });

    it('should apply info variant styles and icon', () => {
      render(<ErrorState message="Info" variant="info" />);
      expect(screen.getByText('info')).toBeInTheDocument();
      const icon = screen.getByText('info');
      expect(icon).toHaveClass('text-blue-600');
    });
  });

  describe('Retry Button', () => {
    it('should render retry button when onRetry is provided', () => {
      render(<ErrorState message="Error" onRetry={() => {}} />);
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });

    it('should not render retry button when onRetry is not provided', () => {
      render(<ErrorState message="Error" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should call onRetry when button is clicked', async () => {
      const onRetry = vi.fn();
      const user = userEvent.setup();
      render(<ErrorState message="Error" onRetry={onRetry} />);

      await user.click(screen.getByRole('button', { name: /Try Again/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should render custom retry label', () => {
      render(<ErrorState message="Error" onRetry={() => {}} retryLabel="Reload" />);
      expect(screen.getByRole('button', { name: /Reload/i })).toBeInTheDocument();
    });

    it('should render refresh icon in retry button', () => {
      render(<ErrorState message="Error" onRetry={() => {}} />);
      expect(screen.getByText('refresh')).toBeInTheDocument();
    });
  });

  describe('Details', () => {
    it('should not show details by default', () => {
      render(<ErrorState message="Error" details="Stack trace here" />);
      expect(screen.queryByText('Stack trace here')).not.toBeInTheDocument();
    });

    it('should show toggle button when details provided', () => {
      render(<ErrorState message="Error" details="Stack trace here" />);
      expect(screen.getByText('Show details')).toBeInTheDocument();
    });

    it('should toggle details on click', async () => {
      const user = userEvent.setup();
      render(<ErrorState message="Error" details="Stack trace here" />);

      await user.click(screen.getByText('Show details'));
      expect(screen.getByText('Stack trace here')).toBeInTheDocument();
      expect(screen.getByText('Hide details')).toBeInTheDocument();

      await user.click(screen.getByText('Hide details'));
      expect(screen.queryByText('Stack trace here')).not.toBeInTheDocument();
    });

    it('should show details by default when showDetails is true', () => {
      render(<ErrorState message="Error" details="Stack trace here" showDetails />);
      expect(screen.getByText('Stack trace here')).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('should apply small size classes', () => {
      const { container } = render(<ErrorState message="Error" size="sm" />);
      expect(container.firstChild).toHaveClass('p-4');
    });

    it('should apply medium size classes by default', () => {
      const { container } = render(<ErrorState message="Error" />);
      expect(container.firstChild).toHaveClass('p-6');
    });

    it('should apply large size classes', () => {
      const { container } = render(<ErrorState message="Error" size="lg" />);
      expect(container.firstChild).toHaveClass('p-8');
    });
  });

  describe('Styling', () => {
    it('should have border and rounded styling', () => {
      const { container } = render(<ErrorState message="Error" />);
      expect(container.firstChild).toHaveClass('rounded-lg', 'border');
    });

    it('should accept custom className', () => {
      const { container } = render(<ErrorState message="Error" className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should center content', () => {
      const { container } = render(<ErrorState message="Error" />);
      expect(container.firstChild).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'text-center');
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<ErrorState message="Error" data-testid="error-state" />);
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<ErrorState ref={ref} message="Error" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
