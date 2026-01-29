/**
 * @vitest-environment jsdom
 */
/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthBackground } from '../auth-background';

describe('AuthBackground', () => {
  it('renders children', () => {
    render(
      <AuthBackground>
        <div data-testid="child">Test content</div>
      </AuthBackground>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <AuthBackground className="custom-class">
        <div>Content</div>
      </AuthBackground>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('custom-class');
  });

  it('renders with base styling', () => {
    render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('min-h-screen');
    expect(main).toHaveClass('bg-[#0f172a]');
  });

  it('renders animated gradient orbs', () => {
    const { container } = render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    // Check for pulsing orb elements
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBe(2);
  });

  it('renders grid pattern overlay', () => {
    const { container } = render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    // Check for grid pattern element (has opacity-[0.015] class)
    const gridElements = container.querySelectorAll('.opacity-\\[0\\.015\\]');
    expect(gridElements.length).toBeGreaterThan(0);
  });
});
