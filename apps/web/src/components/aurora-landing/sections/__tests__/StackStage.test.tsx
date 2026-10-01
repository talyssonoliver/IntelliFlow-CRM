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

vi.mock('../../AuroraBackground', () => ({
  AuroraBackground: () => <div data-testid="aurora-background" />,
}));

import { StackStage } from '../StackStage';

describe('StackStage', () => {
  it('leads with the value proposition over the live wave background', () => {
    const { container } = render(<StackStage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'The CRM that works your pipeline for you.' })
    ).toBeInTheDocument();
    expect(
      container.querySelector('.stage .hero-bg [data-testid="aurora-background"]')
    ).toBeTruthy();
    // The wave stays pinned and unwashed for the whole stage — the contract this
    // marker class's CSS (stack-stage.css) implements, no frosted panel ever.
    expect(container.querySelector('.hero-bg.wave-pin')).toBeInTheDocument();
  });

  it('sends the hero actions to signup and contact', () => {
    render(<StackStage />);
    const hero = screen.getByRole('heading', { level: 1 }).parentElement!;

    expect(within(hero).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(within(hero).getByRole('link', { name: 'Book a demo' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });

  it('walks the five layers top-down, each with the data-layer the stack reads', () => {
    const { container } = render(<StackStage />);

    const layers = [...container.querySelectorAll<HTMLElement>('.layer-step')].map(
      (s) => s.dataset.layer
    );
    expect(layers).toEqual(['agents', 'control', 'pipeline', 'service', 'foundation']);
    expect(container.querySelector('#stack')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/five stacked layers/i)).toHaveClass('sr-only');
  });

  it('every layer-step and the walk intro carry the .layer-card / .walk-card marker stack-stage.css turns into a real card on mobile', () => {
    const { container } = render(<StackStage />);
    expect(container.querySelectorAll('.layer-step.layer-card').length).toBe(5);
    expect(container.querySelector('.walk.walk-card')).toBeInTheDocument();
  });

  it('claims only what the product can back: 15 agent types, six kinds of AI work, MFA available', () => {
    const { container } = render(<StackStage />);
    const text = container.textContent!;

    expect(text).toMatch(/15 agent types/i);
    expect(text).toMatch(/six kinds of AI work/i);
    expect(text).toMatch(/multi-factor sign-in is available on every account/i);
    expect(text).not.toMatch(/\bten agents\b/i);
    expect(text).not.toMatch(/\b10 agents\b/i);
    expect(text).not.toMatch(/protects every account/i);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nothing goes out until you say yes.' })
    ).toBeInTheDocument();
  });
});
