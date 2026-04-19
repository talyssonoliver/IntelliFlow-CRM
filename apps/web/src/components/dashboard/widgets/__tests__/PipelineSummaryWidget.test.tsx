// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: {
      getPipeline: {
        useQuery: () => ({
          data: {
            stages: [
              {
                stageKey: 'QUALIFICATION',
                displayName: 'Qualification',
                count: 5,
                totalValue: 10000,
              },
              { stageKey: 'PROPOSAL', displayName: 'Proposal', count: 3, totalValue: 20000 },
              { stageKey: 'NEGOTIATION', displayName: 'Negotiation', count: 2, totalValue: 15000 },
              { stageKey: 'CLOSED_WON', displayName: 'Closed Won', count: 1, totalValue: 5000 },
            ],
            totalPipelineValue: 50000,
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { PipelineSummaryWidget } from '../PipelineSummaryWidget';

describe('PipelineSummaryWidget', () => {
  it('renders pipeline summary stages', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });
});
