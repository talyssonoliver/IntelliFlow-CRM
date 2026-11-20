/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DealPhoneCards } from '../DealPhoneCards';
import type { Deal } from '../types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 'deal-1',
  name: 'Pilates Living',
  value: 4200,
  stage: 'QUALIFICATION',
  probability: 20,
  expectedCloseDate: '2026-12-05T00:00:00.000Z',
  accountName: 'Pilates Living Ltd',
  contactName: null,
  ownerId: 'u1',
  ownerName: 'Talysson Oliveira',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('DealPhoneCards (MVP-012 #43)', () => {
  it('shows what the phone table hid: the stage and the probability, with the value and account', () => {
    render(<DealPhoneCards deals={[deal()]} timezone="Europe/London" />);
    const card = screen.getByRole('link', { name: /Pilates Living/ });
    expect(within(card).getByText('Qualification')).toBeInTheDocument();
    expect(within(card).getByText('20%')).toBeInTheDocument();
    expect(within(card).getByText('£4,200')).toBeInTheDocument();
    expect(within(card).getByText('Pilates Living Ltd')).toBeInTheDocument();
    expect(card).toHaveTextContent('5 Dec 2026');
    expect(card).toHaveTextContent('Talysson Oliveira');
  });

  it('is one link per deal, to the deal page, in a labelled list', () => {
    render(
      <DealPhoneCards
        deals={[deal(), deal({ id: 'deal-2', name: 'Second deal', stage: 'PROPOSAL' })]}
        timezone="Europe/London"
      />
    );
    const list = screen.getByRole('list', { name: 'Deals' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/deals/deal-1',
      '/deals/deal-2',
    ]);
  });

  it('shows a dash for a deal with no close date, and drops an empty owner', () => {
    render(
      <DealPhoneCards
        deals={[deal({ expectedCloseDate: null, ownerName: '' })]}
        timezone="Europe/London"
      />
    );
    const card = screen.getByRole('link');
    expect(card).toHaveTextContent('Close date: -');
    expect(card.textContent).not.toContain('·');
  });

  it('lets a long name and account truncate instead of widening the card', () => {
    render(
      <DealPhoneCards
        deals={[deal({ name: 'N'.repeat(120), accountName: 'A'.repeat(120) })]}
        timezone="Europe/London"
      />
    );
    expect(screen.getByText(/^N{120}$/).className).toContain('truncate');
    expect(screen.getByText(/^A{120}$/).className).toContain('truncate');
  });

  it('shows the row actions beside the card, not inside its link, one set per deal', () => {
    render(
      <DealPhoneCards
        deals={[deal(), deal({ id: 'deal-2', name: 'Second deal' })]}
        timezone="Europe/London"
        renderActions={(d) => <button type="button">{`Actions for ${d.name}`}</button>}
      />
    );
    const actions = screen.getByRole('button', { name: 'Actions for Pilates Living' });
    expect(actions.closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Second deal' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
