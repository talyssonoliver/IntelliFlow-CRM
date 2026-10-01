/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import PricingPage from '../page';
import { metadata } from '../layout';
import pricingData from '@/data/pricing-data.json';

const { tiers, comparisonFeatures, faqs } = pricingData;

describe('PricingPage (Aurora)', () => {
  it('opens on the free trial, with no card needed', () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Start free. Pick a plan when you are ready.'
    );
    expect(screen.getByText(/14-day free trial, no credit card needed/)).toBeInTheDocument();
  });

  it('shows every plan from the pricing data, annual by default', () => {
    render(<PricingPage />);
    const plans = screen.getByRole('region', { name: 'Plans' });
    for (const tier of tiers) {
      const card = within(plans).getByRole('article', { name: tier.name });
      if (tier.price.annual !== null) {
        expect(within(card).getByText(`£${tier.price.annual}`)).toBeInTheDocument();
      }
      expect(within(card).getByRole('link', { name: tier.cta })).toHaveAttribute(
        'href',
        tier.ctaLink
      );
      for (const feature of tier.features) {
        expect(within(card).getByText(feature)).toBeInTheDocument();
      }
    }
    expect(screen.getAllByText('Billed annually').length).toBeGreaterThan(0);
  });

  it('switches to monthly prices and back', () => {
    render(<PricingPage />);
    const group = screen.getByRole('group', { name: 'Billing period' });
    const monthly = within(group).getByRole('button', { name: 'Monthly' });
    const annual = within(group).getByRole('button', { name: /Annual/ });
    expect(annual).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(monthly);
    expect(monthly).toHaveAttribute('aria-pressed', 'true');
    const starter = tiers.find((t) => t.id === 'starter')!;
    expect(screen.getByText(`£${starter.price.monthly}`)).toBeInTheDocument();
    expect(screen.getAllByText('Billed monthly').length).toBeGreaterThan(0);

    fireEvent.click(annual);
    expect(screen.getByText(`£${starter.price.annual}`)).toBeInTheDocument();
  });

  it('marks the most popular plan', () => {
    render(<PricingPage />);
    const popular = tiers.find((t) => t.mostPopular)!;
    const card = screen.getByRole('article', { name: popular.name });
    expect(within(card).getByText('Most popular')).toBeInTheDocument();
  });

  it('compares every feature, with ticks and dashes read out in words', () => {
    render(<PricingPage />);
    const table = screen.getByRole('table');
    for (const group of comparisonFeatures) {
      expect(within(table).getByRole('columnheader', { name: group.category })).toBeInTheDocument();
      for (const feature of group.features) {
        expect(within(table).getByRole('rowheader', { name: feature.name })).toBeInTheDocument();
      }
    }
    expect(within(table).getAllByLabelText('Included').length).toBeGreaterThan(0);
    expect(within(table).getAllByLabelText('Not included').length).toBeGreaterThan(0);
  });

  it('answers every pricing question', () => {
    render(<PricingPage />);
    for (const faq of faqs) {
      expect(screen.getByText(faq.question)).toBeInTheDocument();
      expect(screen.getByText(faq.answer)).toBeInTheDocument();
    }
  });

  it('closes with Start free and Talk to us', () => {
    render(<PricingPage />);
    const close = screen.getByTestId('cta-section');
    expect(within(close).getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(within(close).getByRole('link', { name: 'Talk to us' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('keeps one h1 and section headings in order', () => {
    render(<PricingPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Compare the plans' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Questions about pricing' })
    ).toBeInTheDocument();
  });

  it('carries Aurora metadata with no old brand', () => {
    expect(metadata.title).toBe('Pricing');
    expect(String(metadata.description)).toContain('Aurora');
    expect(metadata.openGraph?.siteName).toBe('Aurora');
    expect(JSON.stringify(metadata)).not.toMatch(/IntelliFlow/);
    expect(metadata.alternates?.canonical).toBe('/pricing');
  });
});
