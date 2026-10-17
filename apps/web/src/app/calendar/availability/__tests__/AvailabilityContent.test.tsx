/**
 * @vitest-environment jsdom
 *
 * PG-202 — Availability page: layout, states, read-only and a11y (AC-001..AC-009,
 * AC-017, AC-019, AC-024). PageHeader is the real component.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import axe from 'axe-core';
import { availabilityDto, unconfiguredDto, type FixtureDto } from './availability-fixtures';

const h = vi.hoisted(() => ({
  auth: { isLoading: false, isAuthenticated: true },
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string },
  },
  refetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  update: { mutateAsync: vi.fn(), isPending: false },
  reset: { mutateAsync: vi.fn(), isPending: false },
  tz: { timezone: 'Europe/London', timezoneLabel: 'London (GMT+1)' },
}));

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/providers/TimezoneProvider', () => ({ useTimezoneContext: () => h.tz }));
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: (props: Record<string, any>) => (
    <select
      id={props.id}
      aria-invalid={props.invalid || undefined}
      aria-describedby={props.describedBy}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">Select timezone</option>
      <option value="Europe/London">Europe/London</option>
      <option value="America/New_York">America/New_York</option>
    </select>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ calendar: { availability: { get: { invalidate: h.invalidate } } } }),
    calendar: {
      availability: {
        get: { useQuery: () => ({ ...h.query, refetch: h.refetch }) },
        update: { useMutation: () => h.update },
        resetToDefaults: { useMutation: () => h.reset },
      },
    },
  },
}));

import AvailabilityContent from '../AvailabilityContent';

function load(dto: FixtureDto) {
  h.query = { data: dto, isLoading: false, error: null };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoading: false, isAuthenticated: true };
  h.tz = { timezone: 'Europe/London', timezoneLabel: 'London (GMT+1)' };
  h.update = { mutateAsync: vi.fn(), isPending: false };
  h.reset = { mutateAsync: vi.fn(), isPending: false };
  load(availabilityDto());
});

describe('AvailabilityContent — layout', () => {
  it('renders the PageHeader and four cards in reading order', () => {
    render(<AvailabilityContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Availability' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav).toHaveTextContent('Dashboard');
    expect(nav).toHaveTextContent('Calendar');
    const regions = ['Weekly hours', 'Timezone', 'Closures', 'Buffers & daily limit'].map((name) =>
      screen.getByRole('region', { name })
    );
    for (let i = 1; i < regions.length; i++) {
      expect(
        regions[i - 1].compareDocumentPosition(regions[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
    expect(regions.map((r) => r.className.match(/lg:col-span-(\d+)/)?.[1])).toEqual([
      '8',
      '4',
      '8',
      '4',
    ]);
    expect(screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent)).toEqual([
      'Weekly hours',
      'Timezone',
      'Closures',
      'Buffers & daily limit',
    ]);
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it('puts "Add Closure" in the Closures header as a small button without an icon', () => {
    render(<AvailabilityContent />);
    const closures = screen.getByRole('region', { name: 'Closures' });
    const add = within(closures).getByRole('button', { name: 'Add Closure' });
    expect(add.querySelector('.material-symbols-outlined')).toBeNull();
    fireEvent.click(add);
    expect(document.activeElement).toBe(screen.getByLabelText('Closure 2 start date'));
  });

  it('tells the user that closures do not move existing appointments', () => {
    render(<AvailabilityContent />);
    expect(
      screen.getByText(/Existing appointments on these dates are not changed/)
    ).toBeInTheDocument();
  });
});

describe('AvailabilityContent — states', () => {
  it('shows the loading skeleton while auth or the query loads', () => {
    h.query = { data: undefined, isLoading: true, error: null };
    render(<AvailabilityContent />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading availability');
  });

  it('shows an alert with Retry when the query fails', () => {
    h.query = { data: undefined, isLoading: false, error: { message: 'Network down' } };
    render(<AvailabilityContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('renders nothing while unauthenticated', () => {
    h.auth = { isLoading: false, isAuthenticated: false };
    const { container } = render(<AvailabilityContent />);
    expect(container.textContent).toBe('');
  });

  it('prefills 07:00-19:00 every day and explains it when availability was never saved', () => {
    load(unconfiguredDto());
    render(<AvailabilityContent />);
    expect(
      screen.getByText(
        'Availability has not been saved yet. Until you save, the built-in booking rule applies (07:00-19:00 any day). Saving switches this firm to the availability set here.'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Sunday range 1 start')).toHaveValue('07:00');
    expect(screen.getByLabelText('Wednesday range 1 end')).toHaveValue('19:00');
    expect(screen.getByText('Confirm your firm timezone before saving.')).toBeInTheDocument();
  });

  it('shows the viewer-zone note only when it differs from the firm zone', () => {
    h.tz = { timezone: 'America/New_York', timezoneLabel: 'New York (GMT-4)' };
    render(<AvailabilityContent />);
    expect(
      screen.getByText(/Your timezone is New York \(GMT-4\); hours here are in Europe\/London\./)
    ).toBeInTheDocument();
  });
});

describe('AvailabilityContent — read-only (owner Q5)', () => {
  beforeEach(() => load(availabilityDto({ canEdit: false })));

  it('shows a note, every value as text and no Save or Reset', () => {
    render(<AvailabilityContent />);
    expect(
      screen.getByText('You can view availability but only admins and managers can change it.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    for (const role of ['combobox', 'spinbutton', 'switch', 'textbox'] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0);
    }
    expect(screen.getAllByText('09:00 to 17:00')).toHaveLength(5);
    expect(screen.getByText('24 Dec 2026 to 26 Dec 2026, Christmas')).toBeInTheDocument();
    expect(screen.getByText('Europe/London')).toBeInTheDocument();
  });

  it('shows closure dates without a day shift for a western viewer', () => {
    h.tz = { timezone: 'America/Los_Angeles', timezoneLabel: 'Los Angeles (GMT-7)' };
    render(<AvailabilityContent />);
    expect(screen.getByText('24 Dec 2026 to 26 Dec 2026, Christmas')).toBeInTheDocument();
  });
});

describe('AvailabilityContent — axe', () => {
  it('default state has no violations', async () => {
    const { container } = render(<AvailabilityContent />);
    await axeClean(container);
  });

  it('unconfigured state has no violations', async () => {
    load(unconfiguredDto());
    const { container } = render(<AvailabilityContent />);
    await axeClean(container);
  });

  it('empty-closures state has no violations', async () => {
    load(availabilityDto({ closures: [] }));
    const { container } = render(<AvailabilityContent />);
    expect(screen.getByRole('region', { name: 'No closures' })).toBeInTheDocument();
    await axeClean(container);
  });

  it('read-only state has no violations', async () => {
    load(availabilityDto({ canEdit: false }));
    const { container } = render(<AvailabilityContent />);
    await axeClean(container);
  });

  it('validation-error state has no violations', async () => {
    const { container } = render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Monday range 1 end'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText(/1 problem needs fixing/)).toBeInTheDocument();
    await axeClean(container);
  });
});
