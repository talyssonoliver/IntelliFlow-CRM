/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { InboxCalendarSection } from '../InboxCalendarSection';

describe('InboxCalendarSection', () => {
  it('sells the real /email inbox and the calendar together', () => {
    render(<InboxCalendarSection />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Email and your calendar, inside the CRM.' })
    ).toBeInTheDocument();
  });

  it('depicts the real two-pane inbox: folders, labels, search, a thread', () => {
    render(<InboxCalendarSection />);
    const scene = screen.getByLabelText('Email inbox in a sample workspace');

    expect(within(scene).getByText('app.aurora.io/email')).toBeInTheDocument();
    for (const folder of ['Inbox', 'Sent', 'Drafts']) {
      expect(within(scene).getByText(folder)).toBeInTheDocument();
    }
    for (const label of ['Renewals', 'VIP']) {
      expect(within(scene).getByText(label)).toBeInTheDocument();
    }
    expect(within(scene).getByText('Search mail')).toBeInTheDocument();
    expect(within(scene).getAllByText('Maya Chen').length).toBeGreaterThanOrEqual(2);
    expect(within(scene).getByText('Reply')).toBeInTheDocument();
    expect(within(scene).getByText('Draft with AI')).toBeInTheDocument();
  });

  it('carries the sample workspace label required on every product panel', () => {
    render(<InboxCalendarSection />);
    expect(screen.getByLabelText('Email inbox in a sample workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar in a sample workspace')).toBeInTheDocument();
    expect(screen.getAllByText('Sample workspace').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a real, working calendar view rather than the unbuilt settings screens', () => {
    render(<InboxCalendarSection />);
    const calCard = screen.getByLabelText('Calendar in a sample workspace');

    expect(within(calCard).getByText('Contoso renewal call')).toBeInTheDocument();
    expect(within(calCard).getAllByText('Meeting').length).toBeGreaterThan(0);
    // /calendar/event-types and /calendar/availability are literal "coming
    // soon" stubs in the real product; never claim them as shipped.
    const text = calCard.textContent!;
    expect(text).not.toMatch(/availability rules|event types configuration/i);
  });

  it('ties the two panels into one story', () => {
    render(<InboxCalendarSection />);
    expect(screen.getByText(/booked straight from Maya Chen's thread/i)).toBeInTheDocument();
  });

  it('marks up scroll motion hooks without hiding content', () => {
    const { container } = render(<InboxCalendarSection />);
    expect(container.querySelector('[data-reveal]')).toBeInTheDocument();
    expect(container.querySelector('[data-reveal-stagger]')).toBeInTheDocument();
    expect(container.querySelector('[data-scene="inbox"]')).toBeInTheDocument();
  });

  it('uses only Material Symbols icons', () => {
    const { container } = render(<InboxCalendarSection />);
    expect(container.querySelectorAll('.material-symbols-outlined').length).toBeGreaterThan(0);
  });

  it('claims only what the product can back', () => {
    const { container } = render(<InboxCalendarSection />);
    const text = container.textContent!;
    expect(text).not.toMatch(/\bSAP\b|SOC ?2|GDPR|ISO ?27001/);
    expect(text).not.toMatch(/intelliflow/i);
  });
});
