/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  EmptyState: ({ entity }: Readonly<{ entity?: string; phase?: string }>) => (
    <div data-testid={`empty-state-${entity}`}>No {entity} yet</div>
  ),
}));

import { LeadTimeline, type LeadTimelineActivity } from '../lead-timeline';

const activities: LeadTimelineActivity[] = [
  {
    id: 'a1',
    type: 'call',
    title: 'Discovery call',
    description: 'Talked specs',
    timestamp: '2026-06-13T11:30:00.000Z',
    user: 'Alex Owner',
  },
  {
    id: 'a2',
    type: 'email',
    title: 'Sent proposal',
    description: 'v1 pricing',
    timestamp: '2026-06-13T08:00:00.000Z',
    user: 'Jordan Rep',
  },
  {
    id: 'a3',
    type: 'note',
    title: 'Internal note',
    description: 'Follow up Monday',
    timestamp: '2026-06-12T10:00:00.000Z',
    user: 'Sam Lead',
  },
];

describe('LeadTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the activity empty-state when there are no activities (AC-002)', () => {
    render(<LeadTimeline activities={[]} />);
    expect(screen.getByTestId('empty-state-activity')).toBeInTheDocument();
  });

  it('renders one list item per activity, preserving caller order (AC-002)', () => {
    render(<LeadTimeline activities={activities} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Discovery call')).toBeInTheDocument();
    expect(within(items[2]).getByText('Internal note')).toBeInTheDocument();
  });

  it('shows title, description, user and relative time per row', () => {
    render(<LeadTimeline activities={activities} timezone="Europe/London" />);
    expect(screen.getByText('Discovery call')).toBeInTheDocument();
    expect(screen.getByText('Talked specs')).toBeInTheDocument();
    expect(screen.getByText(/Alex Owner/)).toBeInTheDocument();
    expect(screen.getByText(/30m ago/)).toBeInTheDocument();
  });

  it('honours the limit prop', () => {
    render(<LeadTimeline activities={activities} limit={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('exposes a semantic list and hides decorative icons from the a11y tree (AC-006)', () => {
    const { container } = render(<LeadTimeline activities={activities} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(3);
  });
});
