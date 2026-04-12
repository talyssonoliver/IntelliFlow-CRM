// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RevenueWidget } from '../RevenueWidget';

describe('RevenueWidget', () => {
  it('renders revenue summary and respects time range config', () => {
    render(<RevenueWidget config={{ timeRange: 'week' }} />);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$124,500')).toBeInTheDocument();
    expect(screen.getByText('This Week')).toHaveClass('text-ds-primary');
  });
});
