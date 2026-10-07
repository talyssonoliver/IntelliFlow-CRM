/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ServiceSection } from '../ServiceSection';

describe('ServiceSection', () => {
  it('leads with the real customer-service story', () => {
    render(<ServiceSection />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'The whole customer, covered.' })
    ).toBeInTheDocument();
  });

  it('replaces the invented KPI/chart insights mockup with a typed feed', () => {
    const { container } = render(<ServiceSection />);

    // The four real insight types (Warning/Opportunity/Reminder/Achievement),
    // not a KPI-tile-plus-bar-chart dashboard.
    for (const label of ['Warning', 'Opportunity', 'Reminder', 'Achievement']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // The type-filter row from the real /agent-approvals/insights screen.
    for (const filter of ['All', 'Warnings', 'Opportunities', 'Reminders', 'Achievements']) {
      expect(screen.getByText(filter)).toBeInTheDocument();
    }
    expect(screen.getByText('Search insights')).toBeInTheDocument();

    // The old invented panel is gone.
    expect(container.querySelector('.chart .bars')).toBeNull();
    expect(container.querySelector('.insights .kpis')).toBeNull();
    expect(screen.queryByText(/accounts showing churn signals/i)).toBeNull();
  });

  it('shows the real ticket SLA statuses, not just an urgency label', () => {
    render(<ServiceSection />);
    const ticketCard = screen.getByLabelText('Support tickets in a sample workspace');

    for (const label of ['Open', 'In progress', 'Breached', 'Resolved today']) {
      expect(within(ticketCard).getByText(label)).toBeInTheDocument();
    }
  });

  it('keeps the case workflow builder as five ordered steps', () => {
    const { container } = render(<ServiceSection />);
    const nodes = container.querySelectorAll('.flow2 .fnode');
    expect(nodes).toHaveLength(5);
    expect(nodes[0]).toHaveTextContent('Case opened');
    expect(nodes[nodes.length - 1]).toHaveTextContent('Resolved');
  });

  it('depicts churn as a health score with risk indicators, not an account table', () => {
    const { container } = render(<ServiceSection />);
    const healthCard = screen.getByLabelText('Churn risk and sentiment in a sample workspace');

    expect(container.querySelector('.health-gauge')).toBeInTheDocument();
    for (const level of ['High', 'Medium', 'Low']) {
      expect(within(healthCard).getByText(level)).toBeInTheDocument();
    }
    // No more mini-app account+usage table.
    expect(container.querySelector('.mini-app')).toBeNull();
  });

  it('labels every product panel a sample workspace', () => {
    render(<ServiceSection />);
    for (const label of [
      'AI insights feed in a sample workspace',
      'Support tickets in a sample workspace',
      'Case workflow builder in a sample workspace',
      'Churn risk and sentiment in a sample workspace',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Sample workspace').length).toBeGreaterThanOrEqual(4);
  });

  it('uses only Material Symbols icons', () => {
    const { container } = render(<ServiceSection />);
    expect(container.querySelectorAll('.material-symbols-outlined').length).toBeGreaterThan(0);
    expect(container.querySelector('svg[class*="lucide"]')).toBeNull();
  });

  it('marks up scroll motion hooks without hiding content', () => {
    const { container } = render(<ServiceSection />);
    expect(container.querySelector('[data-reveal]')).toBeInTheDocument();
    expect(container.querySelector('[data-reveal-stagger]')).toBeInTheDocument();
    // Content is real text in the server HTML, not something a tween unlocks.
    expect(screen.getByText('Contoso: usage down three weeks running')).toBeVisible();
  });

  it('claims only what the product can back', () => {
    const { container } = render(<ServiceSection />);
    const text = container.textContent!;
    expect(text).not.toMatch(/\bSAP\b|SOC ?2|GDPR|ISO ?27001/);
    expect(text).not.toMatch(/intelliflow/i);
  });
});
