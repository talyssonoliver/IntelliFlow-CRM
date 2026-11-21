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

  it('lays the icon beside the label and number on a phone-width card, sized to both (owner 20/11)', () => {
    const { container } = render(<KpiCard label="Total Leads" icon="group" value="155" />);
    // The card measures its own width, so a card resized to the full phone row gets the row too.
    expect(container.firstElementChild).toHaveClass('@container');
    const icon = screen.getByTestId('kpi-icon');
    // Phone row: the icon spans the label and number rows, 50px = 16px label + 2px gap + 32px number.
    expect(icon).toHaveClass(
      'max-sm:@min-[10.5rem]:row-span-2',
      'max-sm:@min-[10.5rem]:size-[50px]'
    );
    expect(screen.getByText('Total Leads')).toHaveClass(
      'max-sm:@min-[10.5rem]:col-start-2',
      'max-sm:@min-[10.5rem]:leading-4'
    );
    expect(screen.getByTestId('kpi-value').parentElement).toHaveClass(
      'max-sm:@min-[10.5rem]:row-start-2',
      'max-sm:@min-[10.5rem]:leading-8'
    );
    // The number shrinks with the card in the row, so a six-figure amount fits a 390px phone.
    expect(screen.getByTestId('kpi-value')).toHaveClass(
      'max-sm:@min-[10.5rem]:text-[clamp(1.125rem,11.5cqi,1.5rem)]'
    );
    // From `sm` up nothing changes: the stacked tile keeps its icon size.
    expect(icon).toHaveClass('size-9', 'sm:size-12');
    // Two columns in the row (no empty third column eating the number's width).
    expect(icon.parentElement).toHaveClass(
      'gap-x-2',
      'max-sm:@min-[10.5rem]:grid-cols-[auto_minmax(0,1fr)]'
    );
  });

  it('moves the badge under the number in the phone row', () => {
    render(<KpiCard label="Total Leads" icon="group" value="155" badge={<span>+12%</span>} />);
    expect(screen.getByText('+12%').parentElement).toHaveClass(
      'justify-self-end',
      'max-sm:@min-[10.5rem]:col-start-2',
      'max-sm:@min-[10.5rem]:row-start-3'
    );
  });

  it('pulses while pending, so every KPI card loads the same way', () => {
    render(<KpiCard label="Total Leads" icon="group" value={null} pending />);
    expect(screen.getByTestId('kpi-value')).toHaveClass('animate-pulse');
    expect(screen.getByTestId('kpi-value')).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps no empty badge slot when there is no badge', () => {
    const { container } = render(<KpiCard label="Active Deals" icon="handshake" value={1} />);
    expect(container.querySelector('.justify-self-end')).toBeNull();
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
