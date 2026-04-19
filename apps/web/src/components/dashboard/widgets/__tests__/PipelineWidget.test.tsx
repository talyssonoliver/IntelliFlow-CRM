// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// PipelineWidget re-exports PipelineSummaryWidget, which uses
// trpc.opportunity.getPipeline.useQuery.
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
              { stageKey: 'CLOSED_WON', displayName: 'Closed Won', count: 1, totalValue: 5000 },
            ],
            totalPipelineValue: 15000,
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { PipelineWidget } from '../PipelineWidget';

describe('PipelineWidget', () => {
  it('shows pipeline stages via PipelineSummaryWidget re-export', () => {
    // PipelineWidget re-exports PipelineSummaryWidget — title is now
    // 'Pipeline Summary' (not 'Sales Pipeline').
    render(<PipelineWidget />);
    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    expect(screen.getByText('Closed Won')).toBeInTheDocument();
  });
});
