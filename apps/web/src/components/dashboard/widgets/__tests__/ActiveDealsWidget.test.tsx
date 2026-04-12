// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActiveDealsWidget } from '../ActiveDealsWidget';

describe('ActiveDealsWidget', () => {
  it('renders active deals stat', () => {
    render(<ActiveDealsWidget />);

    expect(screen.getByText('Active Deals')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });
});
