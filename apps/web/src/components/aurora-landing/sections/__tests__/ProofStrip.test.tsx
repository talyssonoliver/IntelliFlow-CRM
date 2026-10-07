/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProofStrip } from '../ProofStrip';

describe('ProofStrip', () => {
  it('prints only numbers the product can back, each with its own label', () => {
    render(<ProofStrip />);

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/agent types/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/approval queue/i)).toBeInTheDocument();
    expect(screen.getByText(/six kinds of AI work/i)).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/app connectors ready today/i)).toBeInTheDocument();
    expect(screen.getByText('212')).toBeInTheDocument();
    expect(screen.getByText(/product screens/i)).toBeInTheDocument();
  });

  it('drops the old unsupported numbers (10 agents, 13 integrations)', () => {
    const { container } = render(<ProofStrip />);
    const text = container.textContent!;

    expect(text).not.toMatch(/\b10\b/);
    expect(text).not.toMatch(/\b13\b/);
  });

  it('is the white band that rises over the end of the stage, with a rounded top', () => {
    const { container } = render(<ProofStrip />);
    const section = container.querySelector('section.proof')!;

    expect(section).toHaveClass('proof-band');
  });
});
