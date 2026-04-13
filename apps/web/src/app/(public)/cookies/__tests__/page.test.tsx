// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('server-only', () => ({}));

import CookiePage, { metadata } from '../page';

describe('CookiePage', () => {
  it('renders the page heading from frontmatter', () => {
    render(<CookiePage />);

    expect(screen.getByRole('heading', { name: /cookie policy/i })).toBeInTheDocument();
    expect(screen.getByText(/how intelliflow crm uses cookies/i)).toBeInTheDocument();
  });

  it('renders current policy metadata sourced from the helper', () => {
    render(<CookiePage />);

    expect(screen.getByText('v2026.04')).toBeInTheDocument();
    expect(screen.getByText(/12 april 2026/i)).toBeInTheDocument();

    const emailLinks = screen.getAllByRole('link', { name: /privacy@intelliflow-crm\.com/i });
    expect(emailLinks.length).toBeGreaterThanOrEqual(1);
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:privacy@intelliflow-crm.com');
  });

  it('renders a main landmark, section nav, and all section headings with slugified ids', () => {
    const { container } = render(<CookiePage />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');

    const nav = screen.getByRole('navigation', { name: /cookie policy sections/i });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /what are cookies/i })).toHaveAttribute(
      'href',
      '#what-are-cookies'
    );
    expect(screen.getByRole('link', { name: /categories we use/i })).toHaveAttribute(
      'href',
      '#categories-we-use'
    );
    expect(screen.getByRole('heading', { name: /managing your preferences/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /third-party cookies/i })).toBeInTheDocument();

    // Exactly one h1, at least 6 h2s
    expect(container.querySelectorAll('h1').length).toBe(1);
    expect(container.querySelectorAll('h2').length).toBeGreaterThanOrEqual(6);
  });

  it('renders summary bullets sourced from frontmatter', () => {
    render(<CookiePage />);
    expect(screen.getByText(/necessary cookies keep the site working/i)).toBeInTheDocument();
    // Frontmatter bullets appear in the "Policy at a glance" list; allow duplicates
    // in section bodies but ensure the glance copy is present.
    const matches = screen.getAllByText(
      /you can change your preferences at any time from the cookie banner/i
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('exports metadata for the canonical cookies route', () => {
    expect(metadata.title).toBe('Cookie Policy | IntelliFlow CRM');
    expect(metadata.alternates?.canonical).toBe('/cookies');
    expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/cookies');
  });
});
