import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FollowUpsDueSection, followUpSummary, type FollowUpLead } from '../FollowUpsDueSection';

const NOW = new Date('2026-11-17T10:00:00.000Z');

const lead = (over: Partial<FollowUpLead>): FollowUpLead => ({
  id: 'lead-1',
  firstName: 'Jane',
  lastName: 'Example',
  company: 'Example Corp',
  email: 'jane@example.invalid',
  lastContactedAt: '2026-11-10T09:00:00.000Z',
  ...over,
});

describe('FollowUpsDueSection', () => {
  it('renders nothing when no follow-up is due', () => {
    const { container } = render(
      <FollowUpsDueSection onDone={() => undefined} leads={[]} total={0} now={NOW} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('names each lead, says when it is due, and links to the lead to act', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        now={NOW}
        total={2}
        leads={[
          lead({}),
          lead({
            id: 'lead-2',
            firstName: null,
            lastName: null,
            company: 'Blue Fern Studio',
            lastContactedAt: '2026-11-01T09:00:00.000Z',
          }),
        ]}
      />
    );
    const section = within(screen.getByTestId('follow-ups-due'));
    expect(
      within(screen.getByTestId('follow-ups-due')).getByText('2 follow-ups due')
    ).toBeInTheDocument();

    const first = section.getByRole('link', { name: /Jane Example/ });
    expect(first).toHaveAttribute('href', '/leads/lead-1');
    expect(first).toHaveTextContent('Due today');

    const second = section.getByRole('link', { name: /Blue Fern Studio/ });
    expect(second).toHaveAttribute('href', '/leads/lead-2');
    expect(second).toHaveTextContent('Overdue by 9 days');
  });

  it('colours overdue red and due today amber', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        now={NOW}
        total={2}
        leads={[lead({}), lead({ id: 'lead-2', lastContactedAt: null })]}
      />
    );
    expect(screen.getByText(/^Due today/).className).toContain('text-amber-600');
    expect(screen.getByText('Never contacted').className).toContain('text-red-600');
  });

  it('counts all due leads in its heading and links to the Needs Follow-up view for the rest', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        now={NOW}
        total={121}
        leads={[lead({}), lead({ id: 'l2' }), lead({ id: 'l3' })]}
      />
    );
    expect(
      within(screen.getByTestId('follow-ups-due')).getByText('121 follow-ups due')
    ).toBeInTheDocument();
    // The link carries no number: that view also lists leads of other statuses, so a count
    // here would not match what opens.
    const all = screen.getByRole('link', { name: 'See all leads needing a follow-up' });
    expect(all).toHaveAttribute('href', '/leads?segment=followup');
  });

  it('shows no see-all link when every due lead is already listed', () => {
    render(<FollowUpsDueSection onDone={() => undefined} now={NOW} total={1} leads={[lead({})]} />);
    expect(screen.queryByRole('link', { name: /See all leads/ })).toBeNull();
  });

  it('splits the list into Today and Overdue when it holds both (#46)', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        now={NOW}
        total={2}
        dueToday={1}
        leads={[lead({}), lead({ id: 'lead-2', lastContactedAt: '2026-11-01T09:00:00.000Z' })]}
      />
    );
    const today = screen.getByRole('list', { name: 'Today' });
    const overdue = screen.getByRole('list', { name: 'Overdue' });
    expect(within(today).getByRole('link')).toHaveAttribute('href', '/leads/lead-1');
    expect(within(overdue).getByRole('link')).toHaveAttribute('href', '/leads/lead-2');
    expect(screen.getByTestId('follow-ups-summary')).toHaveTextContent('1 due today · 1 overdue');
  });

  it('shows no group headings when every listed lead is the same kind', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        now={NOW}
        total={1}
        dueToday={1}
        leads={[lead({})]}
      />
    );
    expect(screen.queryByRole('list', { name: 'Today' })).toBeNull();
  });

  it('shows no summary line when no today count is given', () => {
    render(<FollowUpsDueSection onDone={() => undefined} now={NOW} total={1} leads={[lead({})]} />);
    expect(screen.queryByTestId('follow-ups-summary')).toBeNull();
  });
});

describe('FollowUpsDueSection done checkbox', () => {
  it('says "Follow-up · Due today · last contacted 10 Nov" on one meta line', () => {
    render(<FollowUpsDueSection onDone={() => undefined} now={NOW} total={1} leads={[lead({})]} />);
    expect(screen.getByTestId('todo-meta')).toHaveTextContent(
      'Follow-up · Due today · last contacted 10 Nov'
    );
  });

  it('checking a row marks that lead done and nothing else', () => {
    const onDone = vi.fn();
    render(
      <FollowUpsDueSection
        onDone={onDone}
        now={NOW}
        total={2}
        leads={[lead({}), lead({ id: 'lead-2', firstName: 'Bob', lastName: 'Stone' })]}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Follow up with Bob Stone' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('lead-2');
  });

  it('disables the checkbox of the row being saved', () => {
    render(
      <FollowUpsDueSection
        onDone={() => undefined}
        pendingLeadId="lead-1"
        now={NOW}
        total={1}
        leads={[lead({})]}
      />
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});

describe('followUpSummary', () => {
  it('says what is due today and how many are overdue', () => {
    expect(followUpSummary(111, 0)).toBe('Nothing new due today · 111 overdue, most recent first');
    expect(followUpSummary(111, 3)).toBe('3 due today · 108 overdue');
    expect(followUpSummary(3, 3)).toBe('3 due today');
    // Every row read was due today and there are more: the count is a floor, overdue unknown.
    expect(followUpSummary(140, 25, true)).toBe('25+ due today');
  });
});
