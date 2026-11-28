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
    expect(inner).toHaveClass('p-3', '@min-[14rem]:p-5', '@min-[13rem]:min-h-28', 'justify-center');
  });

  it('scales the number with the card, so a six-figure amount fits a phone (#50)', () => {
    render(<KpiCard label="Sales Revenue" icon="payments" value="£125,000" />);
    const value = screen.getByTestId('kpi-value');
    expect(value).toHaveClass('text-[clamp(1.125rem,11cqi,1.875rem)]');
    // Stacked (a card under 9rem, two per row on 320px): sized from what is left after padding.
    expect(value.className).toContain(
      '@max-[9rem]:text-[clamp(0.875rem,calc((100cqi-1.5rem)/6.2),1.125rem)]'
    );
  });

  it('never cuts a figure or a label: they wrap, with the full text in the title (#50)', () => {
    render(<KpiCard label="Significant Results" icon="verified" value="£1,250,000" />);
    const value = screen.getByTestId('kpi-value');
    expect(value).not.toHaveClass('truncate');
    expect(value).toHaveClass('[overflow-wrap:anywhere]');
    expect(value).toHaveAttribute('title', '£1,250,000');
    expect(screen.getByText('Significant Results')).toHaveClass('line-clamp-2');
  });

  it('shows a skeleton bar while loading, keeping the label and icon', () => {
    render(<KpiCard label="Pending" icon="hourglass_empty" value={4} loading />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    const bar = screen.getByTestId('kpi-value');
    expect(bar).toHaveAttribute('aria-busy', 'true');
    expect(bar).toBeEmptyDOMElement();
  });

  it('draws a coloured edge on a framed card only', () => {
    const { container, rerender } = render(
      <KpiCard
        framed
        accentClassName="border-l-4 border-l-green-500"
        label="Hot"
        icon="a"
        value={1}
      />
    );
    expect(container.firstElementChild).toHaveClass('border-l-4', 'border-l-green-500');
    rerender(<KpiCard accentClassName="border-l-4" label="Hot" icon="a" value={1} />);
    expect(container.firstElementChild).not.toHaveClass('border-l-4');
  });

  it('can be a link, and can carry a test id and a spoken name', () => {
    render(
      <KpiCard
        framed
        href="/leads"
        testId="leads-kpi"
        ariaLabel="Leads: 12"
        label="Leads"
        icon="a"
        value={12}
      />
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/leads');
    expect(screen.getByTestId('leads-kpi')).toHaveAttribute('aria-label', 'Leads: 12');
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

  it('sizes the number from its own column between 9rem and 11rem, where the icon sits beside it (#50)', () => {
    render(<KpiCard label="Sales Revenue" icon="payments" value="£1,250,000" />);
    expect(screen.getByTestId('kpi-value').className).toContain(
      '@min-[9rem]:@max-[11rem]:text-[clamp(0.75rem,calc((100cqi-5.5rem)/4.8),1.125rem)]'
    );
  });

  it('announces loading, and loading wins over failed', () => {
    render(<KpiCard label="Pending" icon="hourglass_empty" value={4} loading failed />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBe(screen.getByTestId('kpi-value'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can keep a heading and a region landmark for a card that had them', () => {
    render(
      <KpiCard
        framed
        landmark
        labelAs="h3"
        ariaLabel="Endpoint health"
        label="Endpoints"
        icon="api"
        value="3/4"
      />
    );
    expect(screen.getByRole('region', { name: 'Endpoint health' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Endpoints' })).toBeInTheDocument();
  });

  it('puts the test id and spoken name on the compact card too', () => {
    render(
      <KpiCard variant="compact" testId="c" ariaLabel="Open: 3" label="Open" icon="a" value={3} />
    );
    expect(screen.getByTestId('c')).toHaveAttribute('aria-label', 'Open: 3');
  });

  it('shows a label hint, like a definition (i), beside the label, not under the figure (owner 27/11)', () => {
    render(
      <KpiCard
        label="Win rate"
        icon="emoji_events"
        value="0%"
        labelHint={<button type="button">about</button>}
      />
    );
    const hint = screen.getByRole('button', { name: 'about' });
    expect(hint.parentElement?.parentElement).toContainElement(screen.getByText('Win rate'));
    expect(hint.parentElement?.parentElement).not.toContainElement(screen.getByText('0%'));
  });
});
