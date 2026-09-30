/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SiteFooter } from '../SiteFooter';

describe('SiteFooter', () => {
  it('keeps the copyright year current', () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector('.foot-legal')).toHaveTextContent(
      `© ${new Date().getFullYear()} Aurora`
    );
  });

  it('links each column to a real page or section', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '#pricing');
  });

  it('carries the section-bridge markup, continuing FinalCta as one Navy block', () => {
    const { container } = render(<SiteFooter />);
    const footer = container.querySelector('footer.footer')!;
    expect(footer).toHaveAttribute('data-bridge-section');
    expect((footer as HTMLElement).style.getPropertyValue('--bridge-accent')).toBe('var(--navy)');
  });
});
