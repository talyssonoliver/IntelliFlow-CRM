import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WaitingForReplySection, type WaitingPerson } from '../WaitingForReplySection';
import { waitingLabel, waitingTone } from '@/lib/leads/waiting-for-reply';

const NOW = new Date('2026-11-19T10:00:00.000Z');

const person = (over: Partial<WaitingPerson>): WaitingPerson => ({
  kind: 'lead',
  id: 'lead-1',
  name: 'Jane Example',
  company: 'Example Ltd',
  since: '2026-11-17T10:00:00.000Z',
  subject: 'Quote for the shop',
  ...over,
});

describe('waitingLabel', () => {
  it('says days, hours or under an hour', () => {
    expect(waitingLabel('2026-11-17T10:00:00.000Z', NOW)).toBe('waiting 2 days');
    expect(waitingLabel('2026-11-18T09:00:00.000Z', NOW)).toBe('waiting 1 day');
    expect(waitingLabel('2026-11-19T05:00:00.000Z', NOW)).toBe('waiting 5 hours');
    expect(waitingLabel('2026-11-19T09:00:00.000Z', NOW)).toBe('waiting 1 hour');
    expect(waitingLabel('2026-11-19T09:45:00.000Z', NOW)).toBe('waiting under an hour');
  });

  it('never goes negative for a date in the future', () => {
    expect(waitingLabel('2026-11-20T10:00:00.000Z', NOW)).toBe('waiting under an hour');
  });

  it('turns amber after two days and red after a week', () => {
    expect(waitingTone('2026-11-19T00:00:00.000Z', NOW)).toBe('normal');
    expect(waitingTone('2026-11-17T10:00:00.000Z', NOW)).toBe('amber');
    expect(waitingTone('2026-11-10T10:00:00.000Z', NOW)).toBe('red');
  });
});

describe('WaitingForReplySection', () => {
  it('renders nothing when nobody is waiting', () => {
    const { container } = render(<WaitingForReplySection people={[]} total={0} now={NOW} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the count, the wait and a link to each person', () => {
    render(
      <WaitingForReplySection
        now={NOW}
        total={2}
        people={[person({}), person({ kind: 'contact', id: 'c-1', name: 'Omar', company: null })]}
      />
    );
    const section = within(screen.getByTestId('waiting-for-reply'));
    expect(section.getByText('Waiting for reply (2)')).toBeTruthy();
    expect(section.getAllByText('waiting 2 days')).toHaveLength(2);
    expect(section.getByText('Jane Example · Example Ltd').closest('a')?.getAttribute('href')).toBe(
      '/leads/lead-1'
    );
    expect(section.getByText('Omar').closest('a')?.getAttribute('href')).toBe('/contacts/c-1');
    expect(section.queryByText(/See leads waiting/)).toBeNull();
  });

  it('links to the Waiting for reply list when more are waiting than the card lists', () => {
    render(<WaitingForReplySection now={NOW} total={7} people={[person({})]} />);
    expect(screen.getByText('Waiting for reply (7)')).toBeTruthy();
    expect(screen.getByText(/See leads waiting/).getAttribute('href')).toBe(
      '/leads?segment=waiting'
    );
  });

  it('keeps long names and subjects on one line each so a 390px card does not overflow', () => {
    render(
      <WaitingForReplySection now={NOW} total={1} people={[person({ name: 'N'.repeat(120) })]} />
    );
    const name = screen.getByText(/^N{120}/);
    expect(name.className).toContain('truncate');
    expect(screen.getByText('Quote for the shop').className).toContain('truncate');
  });
});
