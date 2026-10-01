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

import { PricingSection } from '../PricingSection';

describe('PricingSection', () => {
  it('never claims a specific agent count that overstates or invents the truth', () => {
    const { container } = render(<PricingSection />);
    expect(container.textContent).not.toMatch(/\bten\b.*agents|all ten/i);
    expect(screen.getByText('15 AI agent types')).toBeInTheDocument();
  });

  it('invites the visitor to start free instead of asking for details first', () => {
    const { container } = render(<PricingSection />);
    expect(container.querySelector('form')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Start free. Bring your pipeline in today.'
    );
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Talk to us' })).toHaveAttribute('href', '/contact');
  });

  it('promises only the trial the product offers: 14 days, no credit card', () => {
    const { container } = render(<PricingSection />);
    const facts = screen.getByRole('list', { name: 'Your trial' });
    expect(facts).toHaveTextContent('14 days free');
    expect(facts).toHaveTextContent('No credit card');
    expect(container.textContent).not.toMatch(/free forever|free plan|cancel any ?time/i);
  });

  it('straddles the Navy/Mist boundary and carries the bridge markup', () => {
    const { container } = render(<PricingSection />);
    const section = container.querySelector('section.pricing')!;
    expect(section).toHaveAttribute('id', 'pricing');
    expect(section).toHaveAttribute('data-bridge-section');
  });
});
