import { describe, it, expect, vi } from 'vitest';
import { transformPipelineData } from '../RevenueChart';

// Mock @intelliflow/ui Card
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

// Mock formatCurrency
vi.mock('@/lib/pricing/calculator', () => ({
  formatCurrency: (v: number) => `$${v.toLocaleString()}`,
}));

describe('transformPipelineData', () => {
  it('should return empty array for empty input', () => {
    expect(transformPipelineData([])).toEqual([]);
  });

  it('should return empty array for undefined-like input', () => {
    expect(transformPipelineData(null as any)).toEqual([]);
  });

  it('should bucket opportunities by month', () => {
    const opps = [
      { value: 1000, expectedCloseDate: '2026-03-15', stage: 'PROSPECTING' },
      { value: 2000, expectedCloseDate: '2026-03-20', stage: 'PROPOSAL' },
      { value: 3000, expectedCloseDate: '2026-04-10', stage: 'PROSPECTING' },
    ];

    const result = transformPipelineData(opps);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ month: '2026-03', value: 3000 });
    expect(result[1]).toEqual({ month: '2026-04', value: 3000 });
  });

  it('should sort months chronologically', () => {
    const opps = [
      { value: 500, expectedCloseDate: '2026-06-01', stage: 'A' },
      { value: 300, expectedCloseDate: '2026-01-01', stage: 'B' },
      { value: 200, expectedCloseDate: '2026-03-01', stage: 'C' },
    ];

    const result = transformPipelineData(opps);
    expect(result.map((r) => r.month)).toEqual(['2026-01', '2026-03', '2026-06']);
  });

  it('should skip opportunities without expectedCloseDate', () => {
    const opps = [
      { value: 1000, expectedCloseDate: '2026-05-01', stage: 'A' },
      { value: 2000, expectedCloseDate: '', stage: 'B' },
    ];

    const result = transformPipelineData(opps);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1000);
  });

  it('should aggregate multiple opportunities in same month', () => {
    const opps = [
      { value: 1000, expectedCloseDate: '2026-07-05', stage: 'A' },
      { value: 2500, expectedCloseDate: '2026-07-25', stage: 'B' },
      { value: 500, expectedCloseDate: '2026-07-15', stage: 'C' },
    ];

    const result = transformPipelineData(opps);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(4000);
  });
});

describe('RevenueChart component', () => {
  it('should export RevenueChart as a named export', async () => {
    const mod = await import('../RevenueChart');
    expect(mod.RevenueChart).toBeDefined();
    expect(typeof mod.RevenueChart).toBe('function');
  });

  it('should render empty state when no data provided', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { RevenueChart } = await import('../RevenueChart');

    render(<RevenueChart accountId="acc-1" />);
    expect(screen.getByText(/no opportunity data/i)).toBeDefined();
  });

  it('should render pipeline stage chart when stageBreakdown provided', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { RevenueChart } = await import('../RevenueChart');

    render(
      <RevenueChart
        accountId="acc-1"
        stageBreakdown={{
          PROSPECTING: 5000,
          PROPOSAL: 3000,
          CLOSED_WON: 2000,
        }}
      />
    );

    expect(screen.getByText('Pipeline by Stage')).toBeDefined();
  });

  it('should render monthly trend when opportunities provided', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { RevenueChart } = await import('../RevenueChart');

    render(
      <RevenueChart
        accountId="acc-1"
        opportunities={[
          { value: 1000, expectedCloseDate: '2026-03-15', stage: 'A' },
          { value: 2000, expectedCloseDate: '2026-04-15', stage: 'B' },
        ]}
      />
    );

    expect(screen.getByText('Pipeline Trend')).toBeDefined();
  });
});
