// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub server-only so server modules can be imported in jsdom tests
vi.mock('server-only', () => ({}));

// Stub next/link as a plain <a> tag for the test environment
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{ children: React.ReactNode; href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import TermsPage, { metadata } from '../page';

describe('TermsPage', () => {
  it('renders the page heading and terms summary content', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeInTheDocument();
    // version badge appears at least once
    expect(screen.getAllByText(/v2026\.08/).length).toBeGreaterThanOrEqual(1);
    // At least one summary bullet from frontmatter
    expect(screen.getByText(/18 or older/i)).toBeInTheDocument();
  });

  it('renders current terms metadata sourced from the helper', () => {
    render(<TermsPage />);

    expect(screen.getAllByText(/v2026\.08/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/11 august 2026/i)).toBeInTheDocument();

    const emailLinks = screen.getAllByRole('link', {
      name: /legal@intelliflow-crm\.com/i,
    });
    expect(emailLinks.length).toBeGreaterThanOrEqual(1);
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:legal@intelliflow-crm.com');
  });

  it('renders a main landmark and section navigation links', () => {
    render(<TermsPage />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');

    expect(screen.getByRole('link', { name: /acceptance of terms/i })).toHaveAttribute(
      'href',
      '#acceptance-of-terms'
    );

    const nav = screen.getByRole('navigation', { name: /terms sections/i });
    expect(nav).toBeInTheDocument();
  });

  it('exports metadata for the canonical terms route', () => {
    expect(String(metadata.title)).toContain('Terms of Service');
    expect(metadata.alternates?.canonical).toBe('/terms');
    expect(metadata.openGraph?.url).toContain('/terms');
  });
});

describe('acceptance-tracker', () => {
  it('getTermsOfService returns parsed sections from content file', async () => {
    const { getTermsOfService } = await import('@/lib/legal/acceptance-tracker');
    const terms = getTermsOfService();

    expect(terms.metadata.title).toBe('Terms of Service');
    expect(terms.sections.length).toBeGreaterThanOrEqual(8);
    expect(terms.sections[0].id).toBe('acceptance-of-terms');
    expect(terms.sections[0].body.length).toBeGreaterThanOrEqual(1);
  });

  it('formatTermsDate formats ISO dates in en-GB locale', async () => {
    const { formatTermsDate } = await import('@/lib/legal/acceptance-tracker');
    const result = formatTermsDate('2026-08-11');

    expect(result).toMatch(/\d+/);
    expect(result).toMatch(/2026/);
  });
});
