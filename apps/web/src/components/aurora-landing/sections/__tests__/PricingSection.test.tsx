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

  it('renders an accessible team form that posts nowhere: GET to /contact', () => {
    const { container } = render(<PricingSection />);
    const form = container.querySelector('form.team-form')!;
    expect(form).toHaveAttribute('action', '/contact');
    expect(form).toHaveAttribute('method', 'get');
  });

  it('labels every field and gives the email inline validation guidance', () => {
    render(<PricingSection />);
    const email = screen.getByLabelText('Work email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(email).toHaveAccessibleDescription(/only use this to put your plan together/i);

    const size = screen.getByLabelText('Team size');
    expect(size.tagName).toBe('SELECT');
    expect(size).toBeRequired();

    expect(
      screen.getByRole('group', { name: 'What do you want to run in Aurora?' })
    ).toBeInTheDocument();
  });

  it('lets a visitor pick multiple accessible checkbox chips, each with a real label', () => {
    render(<PricingSection />);
    const pipeline = screen.getByRole('checkbox', { name: 'Sales pipeline' });
    const service = screen.getByRole('checkbox', { name: 'Cases and tickets' });
    expect(pipeline).toHaveAttribute('name', 'run');
    expect(service).toHaveAttribute('name', 'run');
  });

  it('submits via a real submit button, and still offers a direct demo link', () => {
    render(<PricingSection />);
    expect(screen.getByRole('button', { name: 'Get a tailored plan' })).toHaveAttribute(
      'type',
      'submit'
    );
    expect(screen.getByRole('link', { name: 'Book a demo' })).toHaveAttribute('href', '/contact');
  });

  it('straddles the Navy/Mist boundary and carries the bridge markup', () => {
    const { container } = render(<PricingSection />);
    const section = container.querySelector('section.pricing')!;
    expect(section).toHaveAttribute('id', 'pricing');
    expect(section).toHaveAttribute('data-bridge-section');
  });
});
