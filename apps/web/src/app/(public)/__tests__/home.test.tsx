/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/link to render a plain <a>
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PublicHomePage } from '@/components/home/PublicHomePage';

describe('PublicHomePage', () => {
  it('renders the hero with the primary value proposition', () => {
    render(<PublicHomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /move faster, stay governed/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/audit-matrix gates, wcag defaults/i)).toBeInTheDocument();
  });

  it('includes primary and secondary calls to action with correct destinations', () => {
    render(<PublicHomePage />);

    const startTrial = screen.getByRole('link', { name: /start free trial/i });
    const talkToSales = screen.getByRole('link', { name: /talk to sales/i });

    expect(startTrial).toHaveAttribute('href', '/signup');
    expect(talkToSales).toHaveAttribute('href', '/contact');
  });

  it('shows headline metrics that reinforce the value proposition', () => {
    render(<PublicHomePage />);

    const stats = screen.getAllByTestId('hero-stat');
    expect(stats).toHaveLength(3);

    expect(screen.getByText(/<200ms/)).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('renders the core value pillars with supporting copy', () => {
    render(<PublicHomePage />);

    const pillars = screen.getAllByTestId('value-pillar');
    expect(pillars).toHaveLength(3);
    expect(screen.getByText(/automation with safeguards/i)).toBeInTheDocument();
    expect(screen.getByText(/evidence-backed delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/human-centered ai/i)).toBeInTheDocument();
  });

  it('highlights guided flows tied to sprint tracker flows', () => {
    render(<PublicHomePage />);

    const flows = screen.getAllByTestId('flow-card');
    expect(flows).toHaveLength(3);
    expect(screen.getByText(/Flow-005\/006/i)).toBeInTheDocument();
    expect(screen.getByText(/Flow-007\/008/i)).toBeInTheDocument();
    expect(screen.getByText(/Flow-011\/012/i)).toBeInTheDocument();
  });

  it('lists security and accessibility guarantees', () => {
    render(<PublicHomePage />);

    expect(screen.getByText(/wcag 2.1 aa/i)).toBeInTheDocument();
    expect(screen.getAllByText(/audit-matrix gates/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/zero-trust posture/i)).toBeInTheDocument();
  });

  it('uses brand styling and Material Symbols icons', () => {
    const { container } = render(<PublicHomePage />);

    expect(
      container.querySelector('[class*="#137fec"]') || container.querySelector('[class*="primary"]')
    ).toBeTruthy();
    expect(container.querySelector('.material-symbols-outlined')).toBeTruthy();
  });

  it('exposes a main landmark for skip links and accessibility tooling', () => {
    render(<PublicHomePage />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('cta-section')).toBeInTheDocument();
  });
});
