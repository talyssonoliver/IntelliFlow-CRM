/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ priority: _priority, alt, ...props }: any) => <img alt={alt} {...props} />,
}));

vi.mock('next/font/google', () => ({
  Plus_Jakarta_Sans: () => ({ className: 'font-jakarta' }),
}));

vi.mock('../AuroraBackground', () => ({
  AuroraBackground: () => <div data-testid="aurora-background" />,
}));

import { AuroraLandingPage } from '../AuroraLandingPage';
import { AuroraHeader } from '../AuroraHeader';
import AuroraPreviewPage, { metadata } from '@/app/preview/aurora/page';

describe('AuroraLandingPage', () => {
  it('leads with the Aurora value proposition over the live background', () => {
    render(<AuroraLandingPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /close more deals with a crm that thinks ahead/i,
      })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('aurora-hero').parentElement!).getByTestId('aurora-background')
    ).toBeInTheDocument();
  });

  it('sends the primary actions to signup and contact', () => {
    render(<AuroraLandingPage />);
    const hero = screen.getByTestId('aurora-hero');

    expect(within(hero).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(within(hero).getByRole('link', { name: 'Book a demo' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('keeps the product tour entry point the tour e2e relies on', () => {
    render(<AuroraLandingPage />);

    expect(screen.getByTestId('tour-trigger-link')).toHaveAttribute('href', '/features?tour=1');
  });

  it('shows three feature cards linking to the features page', () => {
    render(<AuroraLandingPage />);

    const cards = screen.getAllByTestId('feature-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(within(card).getByRole('link')).toHaveAttribute('href', '/features');
    }
    expect(screen.getByText('Score every lead')).toBeInTheDocument();
    expect(screen.getByText('See the whole pipeline')).toBeInTheDocument();
    expect(screen.getByText('Follow up on time')).toBeInTheDocument();
  });

  it('has one main landmark, a closing call to action and the Aurora brand', () => {
    render(<AuroraLandingPage />);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByTestId('cta-section')).toHaveTextContent('Put Aurora on your pipeline');
    expect(screen.getAllByAltText('Aurora').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/intelliflow/i)).not.toBeInTheDocument();
  });

  it('uses Material Symbols for icons and states no figures it cannot back', () => {
    const { container } = render(<AuroraLandingPage />);

    expect(container.querySelector('.material-symbols-outlined')).toBeTruthy();
    expect(container.textContent).not.toContain('%');
  });
});

describe('AuroraHeader', () => {
  it('opens and closes the phone menu', () => {
    render(<AuroraHeader />);

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const menu = screen.getByRole('navigation', { name: 'Mobile' });
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(within(menu).getByRole('link', { name: 'Pricing' }));
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });

  it('closes the phone menu from its log in and get started links', () => {
    render(<AuroraHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', {
        name: 'Log in',
      })
    );
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', {
        name: 'Get started',
      })
    );
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });
});

describe('/preview/aurora route', () => {
  it('renders the landing page and stays out of search indexes', () => {
    render(<AuroraPreviewPage />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
