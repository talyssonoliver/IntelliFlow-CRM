/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import type { ContactTypeOptionDto } from '@intelliflow/validators';
import { ContactTypeBadge } from '../ContactTypeBadge';

const TYPES: ContactTypeOptionDto[] = [
  {
    id: 't1',
    key: 'vendor',
    name: 'Supplier',
    colorToken: 'amber',
    isActive: true,
    isDefault: false,
    isSystem: true,
    requiredFields: [],
  },
  {
    id: 't2',
    key: 'investor',
    name: 'Investor',
    colorToken: 'teal',
    isActive: false,
    isDefault: false,
    isSystem: true,
    requiredFields: [],
  },
];

describe('ContactTypeBadge (A11Y-6)', () => {
  it('renders the type name as text with an aria-hidden colour dot', () => {
    render(<ContactTypeBadge typeKey="vendor" types={TYPES} />);
    const badge = screen.getByTestId('contact-type-badge');
    expect(badge).toHaveTextContent('Supplier');
    expect(badge.className).toContain('bg-amber-200');
    const dot = badge.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-amber-500');
  });

  it('marks an inactive type in text', () => {
    render(<ContactTypeBadge typeKey="investor" types={TYPES} />);
    expect(screen.getByTestId('contact-type-badge')).toHaveTextContent('Investor (inactive)');
  });

  it('shows an unknown key as a neutral slate label (deleted type, ADR-080)', () => {
    render(<ContactTypeBadge typeKey="legacy_key" types={TYPES} />);
    const badge = screen.getByTestId('contact-type-badge');
    expect(badge).toHaveTextContent('legacy_key');
    expect(badge.className).toContain('bg-slate-200');
  });

  it('shows the key while the types are still loading', () => {
    render(<ContactTypeBadge typeKey="vendor" types={undefined} />);
    expect(screen.getByTestId('contact-type-badge')).toHaveTextContent('vendor');
  });

  it('renders nothing without a type', () => {
    const { container } = render(<ContactTypeBadge typeKey={null} types={TYPES} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ContactTypeBadge typeKey="vendor" types={TYPES} />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
