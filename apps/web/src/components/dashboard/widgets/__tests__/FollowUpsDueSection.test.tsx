import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FollowUpsDueSection, type FollowUpLead } from '../FollowUpsDueSection';

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
    const { container } = render(<FollowUpsDueSection leads={[]} total={0} now={NOW} />);
    expect(container.firstChild).toBeNull();
  });

  it('names each lead, says when it is due, and links to the lead to act', () => {
    render(
      <FollowUpsDueSection
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
    expect(section.getByText('Follow-ups due (2)')).toBeInTheDocument();

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
        now={NOW}
        total={2}
        leads={[lead({}), lead({ id: 'lead-2', lastContactedAt: null })]}
      />
    );
    expect(screen.getByText('Due today').className).toContain('text-amber-600');
    expect(screen.getByText('Never contacted').className).toContain('text-red-600');
  });

  it('counts the leads it does not list and links to the Needs Follow-up view', () => {
    render(
      <FollowUpsDueSection
        now={NOW}
        total={121}
        leads={[lead({}), lead({ id: 'l2' }), lead({ id: 'l3' })]}
      />
    );
    const more = screen.getByRole('link', { name: '+118 more leads need a follow-up' });
    expect(more).toHaveAttribute('href', '/leads?segment=followup');
  });

  it('says "lead needs" for exactly one more, and shows no link when all are listed', () => {
    const { rerender } = render(<FollowUpsDueSection now={NOW} total={2} leads={[lead({})]} />);
    expect(
      screen.getByRole('link', { name: '+1 more lead needs a follow-up' })
    ).toBeInTheDocument();

    rerender(<FollowUpsDueSection now={NOW} total={1} leads={[lead({})]} />);
    expect(screen.queryByText(/more lead/)).toBeNull();
  });
});
