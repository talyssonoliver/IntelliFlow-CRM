import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from '../logo';

describe('Logo', () => {
  it('links home under the Aurora name, with the wave mark and the wordmark', () => {
    const { container } = render(<Logo />);
    const link = screen.getByRole('link', { name: 'Aurora home' });
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.getByAltText('Aurora')).toHaveAttribute(
      'src',
      '/brand/aurora/aurora-wordmark.webp'
    );
    expect(container.querySelector('img[src="/brand/aurora/aurora-wave.webp"]')).not.toBeNull();
  });

  it('keeps the navy wordmark readable in dark mode', () => {
    render(<Logo />);
    expect(screen.getByAltText('Aurora').className).toMatch(/dark:brightness-0 dark:invert/);
  });

  it('shows only the mark when collapsed, still named for assistive tech', () => {
    render(<Logo collapsed href="/leads" />);
    expect(screen.queryByAltText('Aurora')).toBeNull();
    expect(screen.getByRole('link', { name: 'Aurora home' })).toHaveAttribute('href', '/leads');
  });

  it('no longer carries the old name', () => {
    const { container } = render(<Logo />);
    expect(container.textContent).not.toMatch(/IntelliFlow/);
  });
});
