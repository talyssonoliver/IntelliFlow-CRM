// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SalesRevenueWidget } from '../SalesRevenueWidget';

describe('SalesRevenueWidget', () => {
  it('displays sales revenue metric', () => {
    render(<SalesRevenueWidget />);

    expect(screen.getByText('Sales Revenue')).toBeInTheDocument();
    expect(screen.getByText('$45,200')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });
});
