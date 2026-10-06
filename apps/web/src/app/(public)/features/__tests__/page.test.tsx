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

import FeaturesPage, { metadata } from '../page';
import featuresData from '@/data/features-content.json';

describe('FeaturesPage (Aurora)', () => {
  it('opens with the hero the product tour starts on', () => {
    const { container } = render(<FeaturesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Everything Aurora does, with you in charge.'
    );
    expect(container.querySelector('[data-tour="hero"]')).not.toBeNull();
    expect(screen.getByText('212 product screens')).toBeInTheDocument();
  });

  it('renders every category and feature from the data, each a tour anchor', () => {
    const { container } = render(<FeaturesPage />);
    for (const category of featuresData.categories) {
      const heading = screen.getByRole('heading', { level: 2, name: category.name });
      const section = within(heading.closest('section')!);
      for (const feature of category.features) {
        expect(section.getByRole('heading', { level: 3, name: feature.title })).toBeInTheDocument();
        for (const benefit of feature.benefits) {
          expect(section.getAllByText(benefit).length).toBeGreaterThan(0);
        }
        expect(container.querySelector(`[data-tour="${feature.id}"]`)).not.toBeNull();
        expect(
          section.getByRole('link', { name: `Learn more about ${feature.title}` })
        ).toHaveAttribute('href', feature.learnMoreUrl);
      }
    }
  });

  it('closes with Start free and See pricing', () => {
    render(<FeaturesPage />);
    const close = within(screen.getByTestId('cta-section'));
    expect(close.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup');
    expect(close.getByRole('link', { name: 'See pricing' })).toHaveAttribute('href', '/pricing');
  });

  it('carries Aurora metadata with no old brand', () => {
    expect(metadata.title).toBe('Features');
    expect(metadata.openGraph?.siteName).toBe('Aurora');
    expect(metadata.alternates?.canonical).toBe('/features');
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow|—|[Zz]ero trust/);
  });
});
