/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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

    expect(screen.getByRole('main')).toHaveClass('custom-class');
  });

  it('sits on Aurora Navy in the Aurora typeface, sized to the dynamic viewport', () => {
    render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('aurora-auth');
    expect(main).toHaveClass('bg-[#11175b]');
    expect(main).toHaveClass('min-h-[100dvh]');
    expect(main.style.fontFamily).toContain('var(--font-manrope)');
  });

  it('goes back home from the Aurora wordmark', () => {
    render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    const home = screen.getByRole('link', { name: 'Aurora home' });
    expect(home).toHaveAttribute('href', '/');
    expect(screen.getByAltText('Aurora')).toHaveAttribute(
      'src',
      '/brand/aurora/aurora-wordmark.webp'
    );
  });

  it('draws the aurora ribbons as decoration only, with nothing animating on its own', () => {
    const { container } = render(
      <AuthBackground>
        <div>Content</div>
      </AuthBackground>
    );

    const art = container.querySelector('[aria-hidden="true"]')!;
    const ribbons = [...art.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(ribbons).toEqual([
      '/brand/aurora/bg/ribbon-left.webp',
      '/brand/aurora/bg/ribbon-right.webp',
    ]);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});
