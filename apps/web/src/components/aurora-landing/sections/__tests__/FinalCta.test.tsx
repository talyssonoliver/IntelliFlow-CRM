/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { FinalCta } from '../FinalCta';

describe('FinalCta', () => {
  it('starts the free trial from one email field, without putting the email in a URL', () => {
    render(<FinalCta />);
    const email = screen.getByLabelText('Work email');
    expect(email).toHaveAttribute('type', 'email');
    // No name: even without JavaScript, the address is never sent in the query string.
    expect(email).not.toHaveAttribute('name');
    const form = email.closest('form')!;
    expect(form).toHaveAttribute('action', '/signup');

    fireEvent.change(email, { target: { value: 'maya@northwind.example' } });
    fireEvent.submit(form);
    expect(sessionStorage.getItem('aurora:signup-email')).toBe('maya@northwind.example');
    expect(push).toHaveBeenCalledWith('/signup');
    sessionStorage.clear();
  });

  it('promises only the trial the product offers', () => {
    render(<FinalCta />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Your first 14 days with Aurora are free. Your team will feel it by Friday.'
    );
    expect(screen.getByText('14 days free')).toBeInTheDocument();
    expect(screen.getByText('No credit card')).toBeInTheDocument();
    expect(screen.getByText('Every AI action waits for your yes')).toBeInTheDocument();
  });

  it('shows three moments from a sample workspace, never presented as customers', () => {
    render(<FinalCta />);
    const moments = screen.getByRole('list', { name: 'Aurora at work in a sample workspace' });
    expect(moments.querySelectorAll('li')).toHaveLength(3);
  });

  it('rises the ribbon artwork from the bottom on both sides', () => {
    const { container } = render(<FinalCta />);
    const left = container.querySelector('.final-ribbon.left')!;
    const right = container.querySelector('.final-ribbon.right')!;
    expect(left).toHaveAttribute('src', '/brand/aurora/bg/ribbon-left.webp');
    expect(right).toHaveAttribute('src', '/brand/aurora/bg/ribbon-right.webp');
    expect(left.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(right.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('svg.section-curve')).toBeInTheDocument();
  });

  it('carries the section-bridge markup into the footer', () => {
    const { container } = render(<FinalCta />);
    const section = container.querySelector('section.final')!;
    expect(section).toHaveAttribute('data-bridge-section');
    expect((section as HTMLElement).style.getPropertyValue('--bridge-accent')).toBe('var(--navy)');
  });
});
