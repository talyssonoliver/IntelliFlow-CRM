import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InferredFieldBadge } from '../InferredFieldBadge';

describe('InferredFieldBadge (IFC-312)', () => {
  it('renders nothing when inferredAt is null', () => {
    const { container } = render(<InferredFieldBadge inferredAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when inferredAt is undefined', () => {
    const { container } = render(<InferredFieldBadge inferredAt={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders badge with default label when inferredAt is set', () => {
    render(<InferredFieldBadge inferredAt={new Date('2026-04-20')} />);
    expect(screen.getByTestId('inferred-field-badge')).toBeDefined();
    expect(screen.getByText('AI-inferred')).toBeDefined();
  });

  it('tooltip includes modelVersion when provided', () => {
    render(
      <InferredFieldBadge
        inferredAt={new Date('2026-04-20')}
        modelVersion="account-industry-inference-v1"
      />
    );
    const badge = screen.getByTestId('inferred-field-badge');
    expect(badge.getAttribute('title')).toContain('account-industry-inference-v1');
  });

  it('accepts string date inputs', () => {
    render(<InferredFieldBadge inferredAt="2026-04-20T12:00:00Z" />);
    expect(screen.getByTestId('inferred-field-badge')).toBeDefined();
  });

  it('has an aria-label for screen readers', () => {
    render(<InferredFieldBadge inferredAt={new Date('2026-04-20')} />);
    expect(screen.getByTestId('inferred-field-badge').getAttribute('aria-label')).not.toBe('');
  });
});
