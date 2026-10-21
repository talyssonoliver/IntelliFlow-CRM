/**
 * @vitest-environment jsdom
 *
 * PG-203 — Event Types settings page: layout, states, read-only, list, delete,
 * and a11y (AC-001, AC-002, AC-003, AC-005, AC-006, AC-008, AC-009, AC-026).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { eventTypeDto, listDto } from './event-types-fixtures';

const h = vi.hoisted(() => ({
  auth: {
    isLoading: false,
    isAuthenticated: true,
    user: {
      id: 'clhme00000000000000',
      name: 'Ada Admin',
      email: 'ada@firm.example.invalid',
      role: 'ADMIN',
    },
  } as Record<string, unknown>,
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string; data?: { code: string } },
  },
  refetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  create: { mutateAsync: vi.fn(), isPending: false },
  update: { mutateAsync: vi.fn(), isPending: false },
  remove: { mutateAsync: vi.fn(), isPending: false },
  link: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/components/tasks/EntitySearchField', () => ({
  EntitySearchField: (props: { value: string; valueName: string }) => (
    <input aria-label="Host" readOnly value={props.valueName} />
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ calendar: { eventTypes: { invalidate: h.invalidate } } }),
    calendar: {
      eventTypes: {
        list: { useQuery: () => ({ ...h.query, refetch: h.refetch }) },
        create: { useMutation: () => h.create },
        update: { useMutation: () => h.update },
        delete: { useMutation: () => h.remove },
        setBookingLink: { useMutation: () => h.link },
      },
    },
  },
}));

import EventTypesContent from '../EventTypesContent';

function load(data: unknown) {
  h.query = { data, isLoading: false, error: null };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = {
    isLoading: false,
    isAuthenticated: true,
    user: {
      id: 'clhme00000000000000',
      name: 'Ada Admin',
      email: 'ada@firm.example.invalid',
      role: 'ADMIN',
    },
  };
  load(listDto());
});

describe('layout and states', () => {
  it('renders the page header, the 8+4 bento and the list with real data (AC-001)', async () => {
    const { container } = render(<EventTypesContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Event Types' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Event types' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Booking link' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Event types' });
    expect(within(list).getByText('Initial consultation')).toBeInTheDocument();
    expect(within(list).getByText(/30 min · Video call · Host: Hana Host/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/coming soon/i);
    await axeClean(container);
  });

  it('shows the loading skeleton while the query loads', () => {
    h.query = { data: undefined, isLoading: true, error: null };
    render(<EventTypesContent />);
    expect(screen.getByText('Loading event types')).toBeInTheDocument();
  });

  it('shows an error with Retry', () => {
    h.query = { data: undefined, isLoading: false, error: { message: 'boom' } };
    render(<EventTypesContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load event types: boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('explains an API that is not deployed yet instead of erroring', () => {
    h.query = {
      data: undefined,
      isLoading: false,
      error: { message: 'x', data: { code: 'NOT_FOUND' } },
    };
    render(<EventTypesContent />);
    expect(screen.getByText(/Event types are not available yet/)).toBeInTheDocument();
  });

  it('shows the canonical empty state with no action button (AC-002)', async () => {
    load(listDto({ items: [] }));
    const { container } = render(<EventTypesContent />);
    const empty = screen.getByLabelText('No event types');
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'New Event Type' })).toBeEnabled();
    await axeClean(container);
  });
});

describe('the list (AC-005, AC-008, AC-009)', () => {
  it('opens the create dialog from the section header through the list handle', () => {
    render(<EventTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Event Type' }));
    expect(screen.getByRole('dialog', { name: 'New Event Type' })).toBeInTheDocument();
  });

  it('opens the edit dialog for a row', () => {
    render(<EventTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Initial consultation' }));
    expect(screen.getByRole('dialog', { name: 'Edit Initial consultation' })).toBeInTheDocument();
  });

  it('marks inactive types and types whose host left the firm', () => {
    load(
      listDto({
        items: [
          eventTypeDto({ id: 'a', name: 'Old call', isActive: false }),
          eventTypeDto({
            id: 'b',
            name: 'Orphan',
            slug: 'orphan',
            hostName: null,
            hostAvailable: false,
          }),
        ],
      })
    );
    render(<EventTypesContent />);
    expect(
      within(screen.getByTestId('event-type-row-a')).getByText('Inactive')
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('event-type-row-b')).getByText('Host unavailable')
    ).toBeInTheDocument();
  });

  it('offers "Copy link" only for a bookable type when booking is on', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    load(
      listDto({
        items: [
          eventTypeDto({ id: 'a', name: 'Bookable', slug: 'bookable' }),
          eventTypeDto({ id: 'b', name: 'Off', slug: 'off', isActive: false }),
        ],
      })
    );
    render(<EventTypesContent />);
    expect(
      within(screen.getByTestId('event-type-row-b')).queryByRole('button', { name: /Copy link/ })
    ).toBeNull();
    fireEvent.click(
      within(screen.getByTestId('event-type-row-a')).getByRole('button', {
        name: 'Copy link for Bookable',
      })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/book/smith-law/bookable`)
    );
  });

  it('hides Copy link when the firm has no handle or no availability', () => {
    load(
      listDto({
        bookingLink: { handle: 'smith-law', privacyUrl: null, availabilityConfigured: false },
      })
    );
    render(<EventTypesContent />);
    expect(screen.queryByRole('button', { name: /Copy link/ })).toBeNull();
  });
});

describe('read-only for members (AC-003)', () => {
  it('disables every write and explains why', () => {
    load(listDto({ canEdit: false }));
    render(<EventTypesContent />);
    expect(
      screen.getByText(/Only administrators and managers can change event types/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Event Type' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Initial consultation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Initial consultation' })).toBeDisabled();
  });
});

describe('save and delete (AC-006)', () => {
  it('creates through the mutation, toasts and keeps a CONFLICT inline in the dialog', async () => {
    h.create.mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('That booking slug is already used by “Intro”.'), {
        data: { code: 'CONFLICT' },
      })
    );
    render(<EventTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Event Type' }));
    const dialog = screen.getByRole('dialog', { name: 'New Event Type' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Intro' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        within(dialog).getByText('That booking slug is already used by “Intro”.')
      ).toBeInTheDocument()
    );
    expect(h.create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Intro', slug: 'intro', hostUserId: 'clhme00000000000000' })
    );
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('confirms and deletes, then announces it', async () => {
    h.remove.mutateAsync.mockResolvedValueOnce({ success: true });
    render(<EventTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Initial consultation' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(/keep all their details/i);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(h.remove.mutateAsync).toHaveBeenCalledWith({ id: 'clhevent00000000000' })
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Event type deleted' }))
    );
  });

  it('keeps a delete refusal inside the dialog', async () => {
    h.remove.mutateAsync.mockRejectedValueOnce(new Error('Event type not found'));
    render(<EventTypesContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Initial consultation' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' })
    );
    await waitFor(() =>
      expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toHaveTextContent(
        'Event type not found'
      )
    );
  });
});
