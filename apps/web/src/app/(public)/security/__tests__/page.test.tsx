/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SecurityPage, { metadata } from '../page';
import { CONTROLS } from '../controls';

describe('SecurityPage (Aurora)', () => {
  it('leads with the approved security header', () => {
    render(<SecurityPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Enterprise security, on from day one.'
    );
    expect(screen.getByText(/No AI action goes out without a person/)).toBeInTheDocument();
  });

  it('lists every control, grouped', () => {
    render(<SecurityPage />);
    for (const { group, items } of CONTROLS) {
      const heading = screen.getByRole('heading', { level: 2, name: group });
      const section = heading.closest('section')!;
      for (const { title } of items) {
        expect(within(section).getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
      }
    }
  });

  it('claims nothing the product does not back', () => {
    const { container } = render(<SecurityPage />);
    const text = `${container.textContent} ${JSON.stringify(metadata)}`;
    expect(text).not.toMatch(
      /ISO 27001|SOC 2|GDPR compliant|certif|penetration|24\/7|zero.trust|AES|HSM|bug bounty|99\.9/i
    );
    // MFA is available, never "enforced".
    expect(text).toMatch(/multi-factor sign-in is available on every account/i);
    expect(text).not.toMatch(/enforced/i);
  });

  it('closes with a way to ask, and the privacy policy', () => {
    render(<SecurityPage />);
    expect(screen.getByRole('link', { name: 'Talk to us' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('carries Aurora metadata with no old brand', () => {
    expect(metadata.title).toBe('Security');
    expect(metadata.openGraph?.siteName).toBe('Aurora');
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow|—/);
  });
});
