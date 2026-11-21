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

  it('uses one row layout at every width: icon left, label and number right (owner 21/11)', () => {
    const { container } = render(<KpiCard label="Total Leads" icon="group" value="155" />);
    // Sized by the card's own width, so resized cards and other pages follow it too.
    expect(container.firstElementChild).toHaveClass('@container');
    const icon = screen.getByTestId('kpi-icon');
    const row = icon.parentElement as HTMLElement;
    expect(row).toHaveClass('flex', 'items-center');
    // No breakpoint switches the row off; only a card under 9rem (320px phone) stacks.
    expect(row.className).not.toMatch(/(^| )(sm|md|lg):flex-col/);
    expect(row).toHaveClass('@max-[9rem]:flex-col');
    // Label and number sit in the column beside the icon.
    const column = screen.getByText('Total Leads').parentElement as HTMLElement;
    expect(column).toBe(row.lastElementChild);
    expect(column).toContainElement(screen.getByTestId('kpi-value'));
  });

  it('sizes the icon to the label plus the number at each card width', () => {
    render(<KpiCard label="Total Leads" icon="group" value="155" />);
    const icon = screen.getByTestId('kpi-icon');
    // 46 = 16 + 2 + 28 (narrow), 50 = 16 + 2 + 32, 56 = 20 + 4 + 32 (desktop)
    expect(icon).toHaveClass('size-[46px]', '@min-[11rem]:size-[50px]', '@min-[14rem]:size-14');
    expect(screen.getByText('Total Leads')).toHaveClass('leading-4', '@min-[14rem]:leading-5');
    expect(screen.getByTestId('kpi-value')).toHaveClass('leading-7', '@min-[11rem]:leading-8');
    expect(screen.getByTestId('kpi-value').parentElement).toHaveClass(
      'mt-0.5',
      '@min-[14rem]:mt-1'
    );
  });

  it('is at least 112px tall on a desktop-width card, with equal padding', () => {
    render(<KpiCard label="Total Leads" icon="group" value="155" />);
    const inner = screen.getByTestId('kpi-icon').parentElement!.parentElement as HTMLElement;
    expect(inner).toHaveClass('p-3', '@min-[14rem]:p-5', '@min-[14rem]:min-h-28', 'justify-center');
  });

  it('scales the number with the card, so a six-figure amount fits a phone (#50)', () => {
    render(<KpiCard label="Sales Revenue" icon="payments" value="£125,000" />);
    expect(screen.getByTestId('kpi-value')).toHaveClass('text-[clamp(1.125rem,11cqi,1.875rem)]');
  });

  it('puts the badge under the number', () => {
    render(<KpiCard label="Total Leads" icon="group" value="155" badge={<span>+12%</span>} />);
    const badgeBox = screen.getByText('+12%').parentElement as HTMLElement;
    expect(badgeBox.previousElementSibling).toContainElement(screen.getByTestId('kpi-value'));
  });

  it('says it could not load, without the badge or the footer', () => {
    render(
      <KpiCard
        label="Total Leads"
        icon="group"
        value="155"
        failed
        badge={<span>+12%</span>}
        footer={<p>Footer line</p>}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load");
    expect(screen.queryByText('+12%')).toBeNull();
    expect(screen.queryByText('Footer line')).toBeNull();
  });

  it('renders a value given as an element (Tickets colours its breached count)', () => {
    render(
      <KpiCard
        label="SLA Breached"
        icon="timer_off"
        value={<span className="text-destructive">3</span>}
      />
    );
    expect(screen.getByText('3')).toHaveClass('text-destructive');
  });

  it('pulses while pending, so every KPI card loads the same way', () => {
    render(<KpiCard label="Total Leads" icon="group" value={null} pending />);
    expect(screen.getByTestId('kpi-value')).toHaveClass('animate-pulse');
    expect(screen.getByTestId('kpi-value')).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps no empty badge slot when there is no badge', () => {
    render(<KpiCard label="Active Deals" icon="handshake" value={1} />);
    const column = screen.getByText('Active Deals').parentElement as HTMLElement;
    expect(column.children).toHaveLength(2);
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

describe('KpiCard framed (owner 21/11: one KPI card on every page)', () => {
  it('draws its own frame outside the dashboard grid, and none by default', () => {
    const { container, rerender } = render(
      <KpiCard label="Total Accounts" icon="domain" value="1" framed />
    );
    expect(container.firstElementChild).toHaveClass('rounded-lg', 'border', 'bg-card');
    rerender(<KpiCard label="Total Accounts" icon="domain" value="1" />);
    expect(container.firstElementChild).not.toHaveClass('border');
  });

  it('shows a framed card footer under the row (Accounts: "avg/account")', () => {
    render(
      <KpiCard
        framed
        label="Average Revenue"
        icon="calculate"
        value="£0"
        footer={<p>avg/account</p>}
      />
    );
    const footer = screen.getByText('avg/account');
    expect(footer.previousElementSibling).toContainElement(screen.getByTestId('kpi-icon'));
  });
});
