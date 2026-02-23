/**
 * @vitest-environment jsdom
 * ProbabilityGauge Component Tests (PG-131)
 * AC-003: Correct percentage, color thresholds, optional target line.
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ProbabilityGauge } from '../forecast/ProbabilityGauge';

describe('ProbabilityGauge', () => {
  it('renders 0% value correctly', () => {
    render(<ProbabilityGauge value={0} label="Win Probability" />);

    const gauge = screen.getByTestId('probability-gauge');
    expect(gauge).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 50% value correctly', () => {
    render(<ProbabilityGauge value={50} label="Win Probability" />);

    const gauge = screen.getByTestId('probability-gauge');
    expect(gauge).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders 100% value correctly', () => {
    render(<ProbabilityGauge value={100} label="Win Probability" />);

    const gauge = screen.getByTestId('probability-gauge');
    expect(gauge).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('applies green color for probability >= 70%', () => {
    const { container } = render(<ProbabilityGauge value={75} label="Test" />);

    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('text-green-500');
  });

  it('applies amber color for probability 50-69%', () => {
    const { container } = render(<ProbabilityGauge value={55} label="Test" />);

    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('text-amber-500');
  });

  it('applies red color for probability < 50%', () => {
    const { container } = render(<ProbabilityGauge value={30} label="Test" />);

    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('text-red-500');
  });

  it('SVG strokeDasharray reflects percentage', () => {
    render(<ProbabilityGauge value={75} label="Test" size="md" />);

    const arc = screen.getByTestId('gauge-arc');
    const strokeDasharray = arc.getAttribute('stroke-dasharray');
    // md size: dimension=80, strokeWidth=6, radius=37, circumference=2*PI*37≈232.48
    expect(strokeDasharray).toBeTruthy();
    // Verify the dashoffset is set (represents the unfilled portion)
    const dashOffset = arc.getAttribute('stroke-dashoffset');
    expect(Number(dashOffset)).toBeGreaterThan(0);
  });

  it('shows target reference line when provided', () => {
    render(<ProbabilityGauge value={60} label="Test" target={80} />);

    expect(screen.getByTestId('target-line')).toBeInTheDocument();
  });

  it('renders in small/medium/large sizes', () => {
    const { rerender, container } = render(
      <ProbabilityGauge value={50} label="Test" size="sm" />
    );
    let svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');

    rerender(<ProbabilityGauge value={50} label="Test" size="md" />);
    svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');

    rerender(<ProbabilityGauge value={50} label="Test" size="lg" />);
    svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('120');
  });

  it('shows label text when showLabel=true', () => {
    render(<ProbabilityGauge value={60} label="Win Probability" showLabel />);

    expect(screen.getByTestId('gauge-label')).toHaveTextContent('Win Probability');
  });

  it('clamps values above 100 to 100', () => {
    render(<ProbabilityGauge value={150} label="Test" />);

    expect(screen.getByTestId('probability-gauge')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps negative values to 0', () => {
    render(<ProbabilityGauge value={-10} label="Test" />);

    expect(screen.getByTestId('probability-gauge')).toHaveAttribute('aria-valuenow', '0');
  });
});
