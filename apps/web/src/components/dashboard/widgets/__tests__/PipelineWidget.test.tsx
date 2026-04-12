// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PipelineWidget } from '../PipelineWidget';

describe('PipelineWidget', () => {
  it('shows sales pipeline stages', () => {
    render(<PipelineWidget />);

    expect(screen.getByText('Sales Pipeline')).toBeInTheDocument();
    expect(screen.getAllByText(/Deals/)).toHaveLength(4);
    expect(screen.getByText('Closed Won')).toBeInTheDocument();
  });
});
