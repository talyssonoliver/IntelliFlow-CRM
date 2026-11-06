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

import { SecuritySection } from '../SecuritySection';

describe('SecuritySection', () => {
  it('marks multi-factor sign-in as planned, never as available', () => {
    render(<SecuritySection />);
    expect(
      screen.getByText(/Planned\. Today you sign in with email or Google\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/MFA is available/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MFA protects every account/i)).not.toBeInTheDocument();
  });

  it('makes no certification claim and only offers the roadmap on request', () => {
    const { container } = render(<SecuritySection />);
    expect(container.textContent).not.toMatch(/SOC ?2|GDPR|ISO ?27001|certified|certification/i);
    expect(screen.getByRole('link', { name: /request the compliance roadmap/i })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('names the four controls the brief asked for', () => {
    render(<SecuritySection />);
    expect(screen.getByText('Human approval')).toBeInTheDocument();
    expect(screen.getByText('Tenant isolation')).toBeInTheDocument();
    expect(screen.getByText('Multi-factor sign-in')).toBeInTheDocument();
    expect(screen.getByText('Audit log')).toBeInTheDocument();
  });

  it('is entered through the curved aurora edge and carries the bridge markup', () => {
    const { container } = render(<SecuritySection />);
    const section = container.querySelector('section.security')!;
    expect(section).toHaveClass('dark');
    expect(section).toHaveAttribute('id', 'security');
    expect(section).toHaveAttribute('data-bridge-section');
    expect(container.querySelector('svg.section-curve')).toHaveAttribute('aria-hidden', 'true');
  });
});
