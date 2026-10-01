/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaqSection } from '../FaqSection';
import pricingData from '@/data/pricing-data.json';

describe('FaqSection', () => {
  it('renders every answer in the server HTML, not gated behind an open toggle', () => {
    render(<FaqSection />);
    // The <details> default state is closed, but the real answer text must
    // already be in the DOM for content-truth (no JS needed to read it).
    expect(
      screen.getByText(/Gmail, Outlook, Slack, Microsoft Teams, Stripe, PayPal/)
    ).toBeInTheDocument();
    expect(screen.getByText(/row-level security/i)).toBeInTheDocument();
  });

  it('quotes the published prices and trial, from the same data the pricing page reads', () => {
    render(<FaqSection />);
    const starter = pricingData.tiers.find((t) => t.id === 'starter')!;
    const answer = screen.getByText(/Plans start at/);
    expect(answer).toHaveTextContent(`£${starter.price.annual} per user per month`);
    expect(answer).toHaveTextContent(`${pricingData.metadata.freeTrialDays}-day free trial`);
  });

  it('asks the questions buyers actually ask', () => {
    render(<FaqSection />);
    expect(screen.getByText('Will the AI ever act without my approval?')).toBeInTheDocument();
    expect(screen.getByText('What does it cost?')).toBeInTheDocument();
    expect(screen.getByText('Where is my data kept separate?')).toBeInTheDocument();
  });

  it('wraps each answer for a smooth, CSS-driven open/close', () => {
    const { container } = render(<FaqSection />);
    const items = container.querySelectorAll('details');
    expect(items.length).toBe(5);
    for (const item of items) {
      expect(item.querySelector('.faq-content')).toBeInTheDocument();
      expect(item.querySelector('.faq-content > p')).toBeInTheDocument();
    }
  });

  it('carries the section-bridge markup', () => {
    const { container } = render(<FaqSection />);
    const section = container.querySelector('section.faq')!;
    expect(section).toHaveAttribute('id', 'faq');
    expect(section).toHaveAttribute('data-bridge-section');
  });
});
