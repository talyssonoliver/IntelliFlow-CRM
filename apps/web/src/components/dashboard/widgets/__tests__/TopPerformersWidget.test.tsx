// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TopPerformersWidget } from '../TopPerformersWidget';

describe('TopPerformersWidget', () => {
  it('lists top performers', () => {
    render(<TopPerformersWidget />);

    expect(screen.getByText('Top Performers')).toBeInTheDocument();
    expect(screen.getAllByText(/\d deals/)).toHaveLength(4);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
  });
});
