// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import AboutPage, { metadata } from '../page';
import teamData from '@/data/team-data.json';

describe('About Page Metadata', () => {
  it('should have correct SEO metadata', () => {
    expect(metadata.title).toBe('About us');
    expect(metadata.description).toContain('Aurora');
    expect(metadata.description).toContain('mission');
  });

  it('should have Open Graph metadata', () => {
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.title).toBe('About Aurora: AI-first, governance-grade');
    expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/about');
    expect(metadata.openGraph?.siteName).toBe('Aurora');
    expect((metadata.openGraph as Record<string, unknown>)?.type).toBe('website');
  });

  it('should have Twitter metadata', () => {
    expect(metadata.twitter).toBeDefined();
    expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
    expect(metadata.twitter?.title).toBe('About Aurora: AI-first, governance-grade');
  });

  it('should have canonical URL', () => {
    expect(metadata.alternates?.canonical).toBe('/about');
  });

  it('carries no old brand and no em dash', () => {
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow|—/);
  });
});

describe('About Page (Aurora)', () => {
  it('keeps the team’s own words, under the new name', () => {
    const { container } = render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "We're Building the Future of CRM"
    );
    expect(screen.getByRole('heading', { name: 'Our Mission' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Our Vision' })).toBeInTheDocument();
    expect(screen.getByText('Founded in 2024')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/IntelliFlow|—/);
  });

  it('lists the four values and every team member', () => {
    render(<AboutPage />);
    for (const value of [
      'Automation with Integrity',
      'Developer-First Thinking',
      'Evidence-Driven Decisions',
      'Customer Success',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: value })).toBeInTheDocument();
    }
    for (const member of teamData.members) {
      expect(screen.getByAltText(`${member.name}, ${member.role}`)).toBeInTheDocument();
    }
  });

  it('closes with Start Free Trial and Contact Sales', () => {
    render(<AboutPage />);
    const close = within(screen.getByTestId('cta-section'));
    expect(close.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(close.getByRole('link', { name: 'Contact Sales' })).toHaveAttribute('href', '/contact');
    expect(close.getByText(/Join modern sales teams using Aurora/)).toBeInTheDocument();
  });
});
