import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../section-header';

describe('SectionHeader', () => {
  const base = {
    icon: 'category',
    iconBg: 'bg-purple-100',
    iconFg: 'text-purple-600',
    title: 'Tier Definitions',
    description: 'Each tier starts at its minimum.',
  };

  it('renders the icon, title and description', () => {
    const { container } = render(<SectionHeader {...base} titleId="tiers-title" />);
    expect(screen.getByRole('heading', { name: 'Tier Definitions' })).toHaveAttribute(
      'id',
      'tiers-title'
    );
    expect(screen.getByText('Each tier starts at its minimum.')).toBeInTheDocument();
    const icon = container.querySelector('.material-symbols-outlined');
    expect(icon).toHaveTextContent('category');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the action slot on the title row', () => {
    render(<SectionHeader {...base} action={<button type="button">New Tier</button>} />);
    expect(screen.getByRole('button', { name: 'New Tier' })).toBeInTheDocument();
  });

  it('renders no action wrapper without an action', () => {
    const { container } = render(<SectionHeader {...base} />);
    expect(container.querySelectorAll('.shrink-0')).toHaveLength(1);
  });
});
