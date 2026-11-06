/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IntegrationsSection } from '../IntegrationsSection';

describe('IntegrationsSection', () => {
  it('wires the 6 connectors plus sign-in to one Aurora core, not a bare grid', () => {
    const { container } = render(<IntegrationsSection />);

    expect(container.querySelector('.core-node')).toHaveTextContent('Aurora core');
    expect(container.querySelector('.core-stem')).toBeInTheDocument();

    const names = [...container.querySelectorAll('.logo span')].map((s) => s.textContent);
    expect(names).toEqual(
      expect.arrayContaining([
        'Gmail',
        'Microsoft 365',
        'Slack',
        'Microsoft Teams',
        'Stripe',
        'PayPal',
        'Google sign-in',
        'Azure sign-in',
      ])
    );
    expect(container.querySelectorAll('.logo').length).toBe(8);
  });

  it('never shows SAP as a ready or available connector', () => {
    const { container } = render(<IntegrationsSection />);
    expect(container.textContent).not.toMatch(/\bSAP\b/);
  });

  it('labels the SDK beta and API keys as coming soon, exactly', () => {
    const { container } = render(<IntegrationsSection />);
    expect(container.querySelector('.dev.beta')).toHaveTextContent(/TypeScript SDK\s*Beta/i);
    expect(container.querySelector('.dev.soon:last-of-type')).toHaveTextContent(
      /API keys\s*Coming soon/i
    );
  });

  it('carries the section-bridge markup for the integrator to wire up', () => {
    const { container } = render(<IntegrationsSection />);
    const section = container.querySelector('section.integrations')!;
    expect(section).toHaveAttribute('data-bridge-section');
    expect(section).toHaveAttribute('id', 'integrations');
    expect((section as HTMLElement).style.getPropertyValue('--bridge-accent')).toBe('var(--cyan)');
  });

  it('claims Google sign-in only: Microsoft sign-in is planned', () => {
    const { container } = render(<IntegrationsSection />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/sign in with Google or Microsoft/i);
    expect(text).toMatch(/sign in with Google\./);
    const azure = [...container.querySelectorAll('.logo')].find((card) =>
      card.textContent?.includes('Azure sign-in')
    );
    expect(azure?.querySelector('.wire-status')?.textContent).toBe('Planned');
  });
});
