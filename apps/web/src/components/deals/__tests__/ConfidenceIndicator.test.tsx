/**
 * @vitest-environment jsdom
 * ConfidenceIndicator Component Tests (PG-131)
 * AC-007: Score display, color thresholds, timestamp, description toggle.
 *
 * Note: This tests the forecast-specific ConfidenceIndicator variant,
 * NOT the generic packages/ui ConfidenceIndicator. The forecast variant
 * adds lastUpdatedAt support and uses deal-specific color thresholds
 * (0.8/0.5 vs generic).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ConfidenceIndicator } from '../forecast/ConfidenceIndicator';

describe('ConfidenceIndicator', () => {
  beforeEach(() => {
    // Fix Date.now for relative time tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-22T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders confidence percentage (e.g., "85%")', () => {
    render(<ConfidenceIndicator confidence={0.85} />);

    expect(screen.getByTestId('confidence-value')).toHaveTextContent('85%');
  });

  it('green color for confidence >= 0.8', () => {
    render(<ConfidenceIndicator confidence={0.85} />);

    const value = screen.getByTestId('confidence-value');
    expect(value.className).toContain('text-green-600');
  });

  it('amber color for confidence 0.5-0.79', () => {
    render(<ConfidenceIndicator confidence={0.65} />);

    const value = screen.getByTestId('confidence-value');
    expect(value.className).toContain('text-amber-600');
  });

  it('red color for confidence < 0.5', () => {
    render(<ConfidenceIndicator confidence={0.3} />);

    const value = screen.getByTestId('confidence-value');
    expect(value.className).toContain('text-red-600');
  });

  it('shows last updated timestamp when provided', () => {
    render(<ConfidenceIndicator confidence={0.75} lastUpdatedAt="2026-02-22T14:30:00Z" />);

    const timestamp = screen.getByTestId('last-updated');
    expect(timestamp).toHaveTextContent('Updated 30m ago');
  });

  it('shows description text when showDescription=true', () => {
    render(<ConfidenceIndicator confidence={0.75} showDescription />);

    const desc = screen.getByTestId('confidence-description');
    expect(desc).toHaveTextContent('activity frequency');
    expect(desc).toHaveTextContent('manual probability');
  });

  it('renders small and medium sizes', () => {
    const { rerender } = render(<ConfidenceIndicator confidence={0.75} size="sm" />);
    let indicator = screen.getByTestId('confidence-indicator');
    expect(indicator.className).toContain('gap-0.5');

    rerender(<ConfidenceIndicator confidence={0.75} size="md" />);
    indicator = screen.getByTestId('confidence-indicator');
    expect(indicator.className).toContain('gap-1');
  });

  it('renders without timestamp when not provided', () => {
    render(<ConfidenceIndicator confidence={0.75} />);

    expect(screen.queryByTestId('last-updated')).not.toBeInTheDocument();
  });

  it('handles boundary values (0.0, 0.5, 0.8, 1.0)', () => {
    const { rerender } = render(<ConfidenceIndicator confidence={0} />);
    expect(screen.getByTestId('confidence-value')).toHaveTextContent('0%');
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('Low confidence');

    rerender(<ConfidenceIndicator confidence={0.5} />);
    expect(screen.getByTestId('confidence-value')).toHaveTextContent('50%');
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('Medium confidence');

    rerender(<ConfidenceIndicator confidence={0.8} />);
    expect(screen.getByTestId('confidence-value')).toHaveTextContent('80%');
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('High confidence');

    rerender(<ConfidenceIndicator confidence={1} />);
    expect(screen.getByTestId('confidence-value')).toHaveTextContent('100%');
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('High confidence');
  });

  it('has correct aria attributes on the meter element', () => {
    const { container } = render(<ConfidenceIndicator confidence={0.72} />);

    // The component uses a semantic <meter> element (sr-only) for accessibility.
    // Native <meter> exposes min/max/value without needing explicit aria-* attributes.
    const meter = container.querySelector('meter');
    expect(meter).not.toBeNull();
    expect(meter).toHaveAttribute('min', '0');
    expect(meter).toHaveAttribute('max', '100');
    expect(meter).toHaveAttribute('value', '72');
  });
});
