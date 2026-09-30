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

import { FinalCta } from '../FinalCta';

describe('FinalCta', () => {
  it('closes with both primary actions', () => {
    render(<FinalCta />);
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Book a demo' })).toHaveAttribute('href', '/contact');
  });

  it('rises the ribbon artwork from the bottom on both sides', () => {
    const { container } = render(<FinalCta />);
    const left = container.querySelector('.final-ribbon.left')!;
    const right = container.querySelector('.final-ribbon.right')!;
    expect(left).toHaveAttribute('src', '/brand/aurora/bg/ribbon-left.webp');
    expect(right).toHaveAttribute('src', '/brand/aurora/bg/ribbon-right.webp');
    expect(left).toHaveAttribute('aria-hidden', 'true');
    expect(right).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the section-bridge markup into the footer', () => {
    const { container } = render(<FinalCta />);
    const section = container.querySelector('section.final')!;
    expect(section).toHaveAttribute('data-bridge-section');
    expect((section as HTMLElement).style.getPropertyValue('--bridge-accent')).toBe('var(--navy)');
  });
});
