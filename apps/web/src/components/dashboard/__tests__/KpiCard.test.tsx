import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { KpiCard, KpiTrendBadge } from '../KpiCard';

describe('KpiCard (#1225 UI-009)', () => {
  it('renders label, icon, value, badge and footer', () => {
    const { container } = render(
      <KpiCard
        label="Total Leads"
        icon="group"
        value="1,204"
        badge={<span>Badge</span>}
        footer={<p>Footer line</p>}
      />
    );
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('1,204');
    expect(screen.getByText('Badge')).toBeInTheDocument();
    expect(screen.getByText('Footer line')).toBeInTheDocument();
    expect(container.textContent).toContain('group');
  });

  it('shows a pending mark instead of a real-looking value', () => {
    render(<KpiCard label="Active Deals" icon="handshake" value={0} pending />);
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('...');
  });

  it('renders the compact variant with the label as a heading', () => {
    render(<KpiCard variant="compact" label="Conversion Rate" icon="bolt" value="4.2%" />);
    expect(screen.getByRole('heading', { name: 'Conversion Rate' })).toBeInTheDocument();
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('4.2%');
  });
});

describe('KpiTrendBadge', () => {
  it('shows an up or down trend', () => {
    const { rerender } = render(<KpiTrendBadge deltaPercent={12.4} previous={50} />);
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('trending_up')).toBeInTheDocument();

    rerender(<KpiTrendBadge deltaPercent={-8} previous={50} />);
    expect(screen.getByText('-8%')).toBeInTheDocument();
    expect(screen.getByText('trending_down')).toBeInTheDocument();
  });

  it('renders nothing on a near-zero baseline and caps big numbers', () => {
    const { container, rerender } = render(<KpiTrendBadge deltaPercent={900} previous={1} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<KpiTrendBadge deltaPercent={4200} previous={20} appearance="pill" />);
    expect(screen.getByText('>999%')).toBeInTheDocument();
  });
});
