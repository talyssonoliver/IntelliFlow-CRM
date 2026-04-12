// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PipelineSummaryWidget } from '../PipelineSummaryWidget';

describe('PipelineSummaryWidget', () => {
  it('renders pipeline summary stages', () => {
    render(<PipelineSummaryWidget />);

    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    expect(screen.getAllByText(/Deals/)).toHaveLength(4);
    expect(screen.getByRole('button', { name: /more_horiz/i })).toBeInTheDocument();
  });
});
