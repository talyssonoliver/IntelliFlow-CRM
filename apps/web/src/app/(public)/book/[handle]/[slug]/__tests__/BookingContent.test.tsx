/**
 * @vitest-environment jsdom
 *
 * PG-203 — public booking flow (AC-011, AC-015, AC-016, AC-021, AC-022, AC-026).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({
  eventType: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string; data?: { code: string } },
  },
  slots: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
  },
  slotsArgs: [] as unknown[],
  refetchSlots: vi.fn(() => Promise.resolve()), // tRPC refetch returns a promise
  book: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    publicBooking: {
      getEventType: { useQuery: () => h.eventType },
      listSlots: {
        useQuery: (args: unknown) => {
          h.slotsArgs.push(args);
          return { ...h.slots, refetch: h.refetchSlots };
        },
      },
      book: { useMutation: () => h.book },
    },
  },
}));

import BookingContent, {
  addCalendarDays,
  bookingErrorMessage,
  firstErrorTarget,
  looksLikeEmail,
} from '../BookingContent';

const EVENT = {
  firmName: 'Smith Law',
  eventName: 'Initial consultation',
  durationMinutes: 30,
  description: 'A first call.',
  locationType: 'VIDEO',
  requiredFields: ['phone'],
  timezone: 'Europe/London',
  colorToken: 'blue',
  privacyUrl: null as string | null,
};

const SLOTS = {
  timezone: 'Europe/London',
  days: [
    {
      date: '2026-11-02',
      slots: [
        { start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T10:30:00.000Z' },
        { start: '2026-11-02T10:15:00.000Z', end: '2026-11-02T10:45:00.000Z' },
      ],
    },
    { date: '2026-11-03', slots: [] },
    {
      date: '2026-11-04',
      slots: [{ start: '2026-11-04T14:00:00.000Z', end: '2026-11-04T14:30:00.000Z' }],
    },
  ],
};

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

function renderFlow() {
  return render(<BookingContent handle="smith-law" slug="initial-consultation" />);
}

function pickFirstSlotAndFill() {
  fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: /^Available times on/ })).getAllByRole('radio')[0]
  );
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+44 20 7946 0000' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.eventType = { data: EVENT, isLoading: false, error: null };
  h.slots = { data: SLOTS, isLoading: false, isError: false, error: null };
  h.slotsArgs = [];
  h.book = { mutateAsync: vi.fn(), isPending: false };
});

describe('BookingContent', () => {
  it('shows the event summary, a date strip and the times of the selected day', async () => {
    const { container } = renderFlow();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Initial consultation' })
    ).toBeInTheDocument();
    expect(screen.getByText('Smith Law')).toBeInTheDocument();
    expect(screen.getByText(/30 min · Video call/)).toBeInTheDocument();
    const dates = screen.getByRole('radiogroup', { name: 'Choose a day' });
    expect(within(dates).getAllByRole('radio')).toHaveLength(3);
    expect(within(dates).getByRole('radio', { name: /Tue.*3 Nov.*no times/i })).toBeInTheDocument();
    fireEvent.click(within(dates).getByRole('radio', { name: /Mon.*2 Nov/ }));
    const times = screen.getByRole('radiogroup', { name: /^Available times on/ });
    expect(within(times).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText(/Times shown in your time zone/)).toBeInTheDocument();
    expect(screen.getByText(/2 times available/)).toBeInTheDocument();
    await axeClean(container);
  });

  it("adds the visitor's own date to a slot that falls on another day for them", () => {
    h.slots = {
      data: {
        timezone: 'Pacific/Kiritimati',
        days: [
          {
            date: '2026-11-03',
            slots: [{ start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T10:30:00.000Z' }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    };
    h.eventType = {
      data: { ...EVENT, timezone: 'Pacific/Kiritimati' },
      isLoading: false,
      error: null,
    };
    renderFlow();
    const visitorDate = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .format(new Date('2026-11-02T10:00:00.000Z'))
      .replace(',', '');
    const slot = within(screen.getByRole('radiogroup', { name: /^Available times on/ })).getByRole(
      'radio'
    );
    expect(slot).toHaveAccessibleName(expect.stringContaining(visitorDate));
    expect(
      screen.getByText(/Days follow Smith Law's calendar \(Pacific\/Kiritimati\)/)
    ).toBeInTheDocument();
  });

  it('asks the firm-local window for 14 days from today', () => {
    renderFlow();
    expect(h.slotsArgs[0]).toEqual(
      expect.objectContaining({ handle: 'smith-law', slug: 'initial-consultation', days: 14 })
    );
    expect((h.slotsArgs[0] as { fromDate: string }).fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('asks only for the required fields, with consent linked to the privacy notice', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
    expect(screen.getByLabelText('Phone')).toBeRequired();
    expect(screen.queryByLabelText('Company')).toBeNull();
    expect(screen.getByRole('link', { name: /privacy notice/ })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it("links the firm's own privacy policy when it has one (owner Q12)", () => {
    h.eventType = {
      data: { ...EVENT, privacyUrl: 'https://firm.example.invalid/privacy' },
      isLoading: false,
      error: null,
    };
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
    expect(screen.getByRole('link', { name: /privacy notice/ })).toHaveAttribute(
      'href',
      'https://firm.example.invalid/privacy'
    );
  });

  it('keeps the honeypot out of the keyboard and the accessibility tree flow', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
    const trap = screen.getByLabelText('Leave this field empty');
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap).toHaveAttribute('autocomplete', 'off');
    // Hidden from assistive tech on the wrapper; the field itself stays in the DOM for bots.
    expect(trap.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(trap).not.toHaveAttribute('aria-hidden');
  });

  it('books the chosen time and moves focus to the confirmation', async () => {
    h.book.mutateAsync.mockResolvedValueOnce({
      startsAt: '2026-11-02T10:00:00.000Z',
      endsAt: '2026-11-02T10:30:00.000Z',
      timezone: 'Europe/London',
    });
    renderFlow();
    pickFirstSlotAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    await waitFor(() =>
      expect(h.book.mutateAsync).toHaveBeenCalledWith({
        handle: 'smith-law',
        slug: 'initial-consultation',
        start: '2026-11-02T10:00:00.000Z',
        name: 'Ada Lovelace',
        email: 'ada@example.invalid',
        answers: { phone: '+44 20 7946 0000' },
        consent: true,
        __honeypot: '',
      })
    );
    const heading = await screen.findByRole('heading', { name: 'You are booked' });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText(/A confirmation is on its way to ada@example.invalid/)
    ).toBeInTheDocument();
  });

  it('blocks booking until a time is chosen, the fields are filled and consent is given', async () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(await screen.findByText('Choose a time.')).toBeInTheDocument();
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Please agree to continue.')).toBeInTheDocument();
    expect(h.book.mutateAsync).not.toHaveBeenCalled();
    // The time group is tied to its error, and focus moves to the first problem (WCAG 3.3.1 / 2.4.3).
    const times = screen.getByRole('radiogroup', { name: /^Available times on/ });
    expect(times).toHaveAttribute('aria-describedby', 'booking-slot-error');
    expect(times).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(within(times).getAllByRole('radio')[0]).toHaveFocus());
  });

  it('marks the selected time with a non-colour cue and submits from the keyboard (Enter)', async () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Mon.*2 Nov/ }));
    const times = screen.getByRole('radiogroup', { name: /^Available times on/ });
    fireEvent.click(within(times).getAllByRole('radio')[0]);
    const selected = within(times).getAllByRole('radio')[0].closest('label')!;
    expect(selected.querySelector('.material-symbols-outlined')).toHaveTextContent('check_circle');
    expect(selected.className).toContain('border-2');
    fireEvent.submit(screen.getByRole('button', { name: 'Book' }).closest('form')!);
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveFocus());
  });

  it('a taken slot refetches the times and keeps what was typed', async () => {
    h.book.mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('That time is no longer available. Please pick another.'), {
        data: { code: 'CONFLICT' },
      })
    );
    renderFlow();
    pickFirstSlotAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(
      await screen.findByText('That time is no longer available. Please pick another.')
    ).toBeInTheDocument();
    expect(h.refetchSlots).toHaveBeenCalled();
    expect(screen.getByLabelText('Your name')).toHaveValue('Ada Lovelace');
  });

  it('explains a rate limit', async () => {
    h.book.mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Too many booking attempts. Please try again later.'), {
        data: { code: 'TOO_MANY_REQUESTS' },
      })
    );
    renderFlow();
    pickFirstSlotAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(
      await screen.findByText('Too many booking attempts. Please try again later.')
    ).toBeInTheDocument();
  });

  it('shows a generic not-available page for an unknown or disabled link', () => {
    h.eventType = {
      data: undefined,
      isLoading: false,
      error: { message: 'x', data: { code: 'NOT_FOUND' } },
    };
    renderFlow();
    expect(
      screen.getByRole('heading', { name: 'This booking page is not available' })
    ).toBeInTheDocument();
  });

  it('says so when there are no open times in the next 14 days', () => {
    h.slots = {
      data: { timezone: 'Europe/London', days: [{ date: '2026-11-02', slots: [] }] },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderFlow();
    expect(
      screen.getByText(/No open times in the next 14 days\. Try later dates\./)
    ).toBeInTheDocument();
  });

  it('pages through the 60-day booking horizon 14 days at a time (owner ruling)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
      renderFlow();
      const earlier = screen.getByRole('button', { name: 'Earlier dates' });
      const later = screen.getByRole('button', { name: 'Later dates' });
      expect(earlier).toBeDisabled();
      const from = () => (h.slotsArgs.at(-1) as { fromDate: string }).fromDate;
      expect(from()).toBe('2026-11-01');
      fireEvent.click(later);
      expect(from()).toBe('2026-11-15');
      for (let i = 0; i < 3; i += 1) fireEvent.click(later);
      // 56 days ahead is the last window that starts inside the 60-day horizon.
      expect(from()).toBe('2026-12-27');
      expect(later).toBeDisabled();
      fireEvent.click(earlier);
      expect(from()).toBe('2026-12-13');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks the visitor to contact the firm only when the last window is empty too', () => {
    h.slots = {
      data: { timezone: 'Europe/London', days: [{ date: '2026-12-27', slots: [] }] },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderFlow();
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Later dates' }));
    }
    expect(
      screen.getByText(/No open times in these dates\. Please contact the firm\./)
    ).toBeInTheDocument();
  });

  it('adds whole calendar days across month and year ends', () => {
    expect(addCalendarDays('2026-12-27', 14)).toBe('2027-01-10');
    expect(addCalendarDays('2026-02-20', 14)).toBe('2026-03-06');
  });

  it('explains a failed slot lookup and retries on request', () => {
    h.slots = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'slow down', data: { code: 'TOO_MANY_REQUESTS' } },
    };
    renderFlow();
    expect(screen.getByRole('alert')).toHaveTextContent(/Too many requests just now/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.refetchSlots).toHaveBeenCalled();
    h.slots = { ...h.slots, error: { message: 'boom', data: { code: 'INTERNAL_SERVER_ERROR' } } };
    renderFlow();
    expect(screen.getByText('The available times could not be loaded.')).toBeInTheDocument();
  });

  it('asks for the new day after the firm passes midnight with the page open (codex)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-01T23:59:00Z')); // 23:59 in London
      h.slots = { data: undefined, isLoading: false, isError: true, error: { message: 'x' } };
      renderFlow();
      expect((h.slotsArgs.at(-1) as { fromDate: string }).fromDate).toBe('2026-11-01');
      vi.setSystemTime(new Date('2026-11-02T00:01:00Z'));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      // The stale day is not refetched; the re-render queries the new day.
      expect(h.refetchSlots).not.toHaveBeenCalled();
      expect((h.slotsArgs.at(-1) as { fromDate: string }).fromDate).toBe('2026-11-02');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a loading state while the event loads', () => {
    h.eventType = { data: undefined, isLoading: true, error: null };
    renderFlow();
    expect(screen.getByText('Loading booking page')).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('accepts plausible emails and rejects obvious mistakes', () => {
    expect(looksLikeEmail('ada@firm.example')).toBe(true);
    for (const bad of [
      '',
      'ada',
      '@firm.example',
      'ada@firm',
      'ada@firm.',
      'a@b@c.d',
      'a da@x.y',
    ]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });

  it('shows only safe server messages', () => {
    const err = (code: string, message: string) =>
      Object.assign(new Error(message), { data: { code } });
    expect(bookingErrorMessage(err('NOT_FOUND', 'x'))).toBe(
      'This booking page is no longer available.'
    );
    expect(bookingErrorMessage(err('CONFLICT', 'That time was just taken.'))).toBe(
      'That time was just taken.'
    );
    expect(bookingErrorMessage(err('INTERNAL_SERVER_ERROR', 'db down'))).toBe(
      'Something went wrong. Please try again.'
    );
    expect(bookingErrorMessage({ data: { code: 'CONFLICT' } })).toBe(
      'Something went wrong. Please try again.'
    );
    expect(bookingErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });
});

describe('firstErrorTarget', () => {
  it('follows form order: time, name, email, answers, consent', () => {
    expect(firstErrorTarget({ slot: 'x', name: 'x' }, [])).toBe(
      '#booking-time-group input:not([disabled])'
    );
    expect(firstErrorTarget({ email: 'x', consent: 'x' }, [])).toBe('#booking-email');
    expect(
      firstErrorTarget({ answers: { company: 'x' }, consent: 'x' }, ['phone', 'company'])
    ).toBe('#booking-company');
    expect(firstErrorTarget({ consent: 'x' }, [])).toBe('#booking-consent');
    expect(firstErrorTarget({ form: 'x' }, [])).toBeNull();
  });
});

describe('data request link (PG-203 DSAR)', () => {
  it("links the firm's data request page from the footer", () => {
    h.eventType = { data: EVENT, isLoading: false, error: null };
    h.slots = { data: SLOTS, isLoading: false, isError: false, error: null };
    renderFlow();
    expect(screen.getByRole('link', { name: 'Your personal data' }).getAttribute('href')).toBe(
      '/dsar/smith-law'
    );
  });
});
