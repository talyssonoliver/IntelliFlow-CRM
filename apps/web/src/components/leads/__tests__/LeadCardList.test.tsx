import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LeadCardList } from '../LeadCardList';
import type { Lead } from '@/lib/leads/lead-types';
import type { LeadRowActionHandlers } from '@/lib/leads/lead-row-actions';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    email: 'alice@example.invalid',
    firstName: 'Alice',
    lastName: 'Anderson',
    company: 'Acme Ltd',
    title: 'Founder',
    status: 'CONTACTED',
    score: 34,
    scoringStatus: 'SCORED',
    createdAt: '2026-01-02T10:00:00.000Z',
    phone: '+440000000000',
    ...overrides,
  };
}

function makeHandlers(): LeadRowActionHandlers {
  return {
    onEdit: vi.fn(),
    onConvert: vi.fn(),
    onQualify: vi.fn(),
    onScore: vi.fn(),
    onToggleStar: vi.fn(),
    onDelete: vi.fn(),
  };
}

describe('LeadCardList', () => {
  it('shows name, company, score, status, date and email on each card', () => {
    render(
      <LeadCardList
        leads={[makeLead()]}
        handlers={makeHandlers()}
        onOpen={vi.fn()}
        timezone="Europe/London"
        emptyMessage="No leads"
      />
    );
    const card = screen.getByTestId('lead-card-lead-1');
    const c = within(card);
    expect(c.getByText('Alice Anderson')).toBeTruthy();
    expect(c.getByText('Founder @ Acme Ltd')).toBeTruthy();
    expect(c.getByText('34')).toBeTruthy();
    expect(c.getByText('Contacted')).toBeTruthy();
    expect(c.getByText('2 Jan 2026')).toBeTruthy();
    const email = c.getByRole('link', { name: 'alice@example.invalid' });
    expect(email.getAttribute('href')).toBe('/email/compose?to=alice%40example.invalid');
  });

  it('opens the lead when its name is tapped', () => {
    const onOpen = vi.fn();
    const lead = makeLead();
    render(
      <LeadCardList leads={[lead]} handlers={makeHandlers()} onOpen={onOpen} emptyMessage="x" />
    );
    fireEvent.click(screen.getByRole('button', { name: /Alice Anderson/ }));
    expect(onOpen).toHaveBeenCalledWith(lead);
  });

  it('keeps the row actions on the card', () => {
    render(
      <LeadCardList
        leads={[makeLead()]}
        handlers={makeHandlers()}
        onOpen={vi.fn()}
        emptyMessage="x"
      />
    );
    const card = within(screen.getByTestId('lead-card-lead-1'));
    expect(card.getByRole('toolbar', { name: 'Row actions' })).toBeTruthy();
    expect(card.getByRole('button', { name: 'Call' })).toBeTruthy();
    expect(card.getByRole('button', { name: 'Send Email' })).toBeTruthy();
  });

  it('shows the company once for a company-only lead', () => {
    render(
      <LeadCardList
        leads={[makeLead({ firstName: null, lastName: null, title: null })]}
        handlers={makeHandlers()}
        onOpen={vi.fn()}
        emptyMessage="x"
      />
    );
    expect(screen.getAllByText('Acme Ltd')).toHaveLength(1);
  });

  it('renders one card per lead inside a labelled list', () => {
    render(
      <LeadCardList
        leads={[
          makeLead(),
          makeLead({ id: 'lead-2', firstName: 'Bob', email: 'b@example.invalid' }),
        ]}
        handlers={makeHandlers()}
        onOpen={vi.fn()}
        emptyMessage="x"
        className="md:hidden"
      />
    );
    const list = screen.getByRole('list', { name: 'Leads' });
    expect(list.className).toContain('md:hidden');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the leads empty state with the given message when there are no leads', () => {
    render(
      <LeadCardList
        leads={[]}
        handlers={makeHandlers()}
        onOpen={vi.fn()}
        emptyMessage="No leads match your search criteria"
      />
    );
    const empty = screen.getByTestId('lead-card-list-empty');
    expect(within(empty).getByText('No leads match your search criteria')).toBeTruthy();
  });
});
