'use client';

/**
 * Public booking flow (PG-203, ADR-083).
 *
 * Event summary → a 14-day date strip → the open times of the chosen day (shown
 * in the visitor's time zone, with the firm's zone named) → name, email, the
 * event type's required fields and consent → confirmation. The server re-checks
 * everything; this component only explains. Imports stay light (types only from
 * the validators) so the public page does not pull server code into its bundle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Input, Label, Textarea } from '@intelliflow/ui';
import type { PublicBookResultDto } from '@intelliflow/validators/event-types';
import { trpc } from '@/lib/trpc';

const LOCATION_LABELS: Record<string, string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone call',
  IN_PERSON: 'In person',
  CUSTOM: 'Details from the firm',
};

const FIELD_LABELS: Record<string, string> = { phone: 'Phone', company: 'Company', notes: 'Notes' };
const DAYS_TO_SHOW = 14;
const GENERIC_ERROR = 'Something went wrong. Please try again.';
/** Server messages that are safe and useful to show as-is. */
const SHOWN_SERVER_CODES = new Set(['CONFLICT', 'TOO_MANY_REQUESTS', 'BAD_REQUEST']);

/** A light shape check (the server validates properly): one "@", a dot in the domain, no spaces. */
export function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || value.includes(' ')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

/** Today's date ('YYYY-MM-DD') in the given IANA zone. */
function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** "Mon 2 Nov" for a 'YYYY-MM-DD' calendar date (no time zone shift). */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(',', '');
}

/** "Sun 1 Nov" for an instant in the given zone (default: the visitor's own). */
function shortDateOf(iso: string, timezone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  })
    .format(new Date(iso))
    .replace(',', '');
}

function timeLabel(iso: string, timezone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(iso));
}

/**
 * A slot's label: the time in the visitor's zone, plus the visitor's own date when it
 * differs from the firm-calendar day the slot is listed under (e.g. 23:00 the evening before).
 */
function slotLabel(iso: string, firmTimezone: string): string {
  const visitorDate = shortDateOf(iso);
  return visitorDate === shortDateOf(iso, firmTimezone)
    ? timeLabel(iso)
    : `${timeLabel(iso)} ${visitorDate}`;
}

/** "Monday 2 November" for an instant, in the visitor's own time zone. */
function longDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(iso))
    .replace(',', '');
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

/** What to tell the visitor when the booking call fails. */
export function bookingErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'NOT_FOUND') return 'This booking page is no longer available.';
  if (code && SHOWN_SERVER_CODES.has(code) && error instanceof Error && error.message) {
    return error.message;
  }
  return GENERIC_ERROR;
}

interface Choice {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

/**
 * A radiogroup of native radio inputs (one tab stop; the browser handles arrow keys),
 * styled as cards. Each label carries the full text, so the accessible name matches what
 * is shown.
 */
function ChoiceGroup({
  name,
  label,
  choices,
  value,
  onChange,
  className,
}: Readonly<{
  name: string;
  label: string;
  choices: Choice[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}>) {
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {choices.map((choice) => {
        const id = `${name}-${choice.value}`;
        const checked = choice.value === value;
        return (
          <label
            key={choice.value}
            htmlFor={id}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring ${
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            } ${choice.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={choice.value}
              checked={checked}
              disabled={choice.disabled}
              onChange={() => onChange(choice.value)}
              className="sr-only"
            />
            <span className="block font-medium">{choice.label}</span>
            {choice.detail && <span className="block text-xs opacity-80">{choice.detail}</span>}
          </label>
        );
      })}
    </div>
  );
}

interface Errors {
  slot?: string;
  name?: string;
  email?: string;
  consent?: string;
  answers?: Record<string, string>;
  form?: string;
}

interface Draft {
  start: string;
  name: string;
  email: string;
  answers: Record<string, string>;
  consent: boolean;
}

/** Client-side checks that mirror the server's, so the visitor hears all problems at once. */
export function validateBooking(draft: Draft, requiredFields: readonly string[]): Errors {
  const errors: Errors = {};
  if (!draft.start) errors.slot = 'Choose a time.';
  if (!draft.name.trim()) errors.name = 'Enter your name.';
  if (!looksLikeEmail(draft.email.trim())) errors.email = 'Enter a valid email address.';
  const answerErrors: Record<string, string> = {};
  for (const field of requiredFields) {
    if (!draft.answers[field]?.trim()) {
      answerErrors[field] = `Enter your ${FIELD_LABELS[field].toLowerCase()}.`;
    }
  }
  if (Object.keys(answerErrors).length > 0) errors.answers = answerErrors;
  if (!draft.consent) errors.consent = 'Please agree to continue.';
  return errors;
}

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

function NotAvailable() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">This booking page is not available</h1>
      <p className="mt-3 text-muted-foreground">
        The link may be out of date. Please contact the firm that shared it with you.
      </p>
    </main>
  );
}

function Confirmation({
  booked,
  eventName,
  firmName,
}: Readonly<{
  booked: PublicBookResultDto & { email: string };
  eventName: string;
  firmName: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-16">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold text-foreground focus:outline-none"
      >
        You are booked
      </h1>
      <p className="mt-3 text-foreground">
        {`${eventName} with ${firmName}, ${longDateLabel(booked.startsAt)} ${timeLabel(booked.startsAt)}–${timeLabel(booked.endsAt)} (your time) · ${timeLabel(booked.startsAt, booked.timezone)} ${booked.timezone}`}
      </p>
      <p className="mt-2 text-muted-foreground">
        {`A confirmation is on its way to ${booked.email}. To change or cancel, reply to that email.`}
      </p>
    </main>
  );
}

export default function BookingContent({
  handle,
  slug,
}: Readonly<{ handle: string; slug: string }>) {
  const eventQuery = trpc.publicBooking.getEventType.useQuery({ handle, slug }, { retry: false });
  const event = eventQuery.data;
  const fromDate = useMemo(() => todayIn(event?.timezone ?? 'UTC'), [event?.timezone]);
  const slotsQuery = trpc.publicBooking.listSlots.useQuery(
    { handle, slug, fromDate, days: DAYS_TO_SHOW },
    { enabled: Boolean(event), retry: false }
  );
  const bookMutation = trpc.publicBooking.book.useMutation();

  const [visitorZone, setVisitorZone] = useState<string | null>(null);
  useEffect(() => setVisitorZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  const [date, setDate] = useState('');
  const [draft, setDraft] = useState<Draft>({
    start: '',
    name: '',
    email: '',
    answers: {},
    consent: false,
  });
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [booked, setBooked] = useState<(PublicBookResultDto & { email: string }) | null>(null);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  if (eventQuery.isLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
        <output>Loading booking page</output>
      </main>
    );
  }
  if (!event) return <NotAvailable />;
  if (booked) {
    return <Confirmation booked={booked} eventName={event.eventName} firmName={event.firmName} />;
  }

  const days = slotsQuery.data?.days ?? [];
  const firstOpenDay = days.find((d) => d.slots.length > 0)?.date ?? '';
  const selectedDate = date || firstOpenDay;
  const daySlots = days.find((d) => d.date === selectedDate)?.slots ?? [];
  const requiredFields = event.requiredFields;

  const submit = async () => {
    const next = validateBooking(draft, requiredFields);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const answers = Object.fromEntries(requiredFields.map((f) => [f, draft.answers[f].trim()]));
    try {
      const result = await bookMutation.mutateAsync({
        handle,
        slug,
        start: draft.start,
        name: draft.name.trim(),
        email: draft.email.trim(),
        answers,
        consent: true,
        __honeypot: honeypot,
      });
      setBooked({ ...result, email: draft.email.trim() });
    } catch (error) {
      if (errorCode(error) === 'CONFLICT') {
        update('start', '');
        void slotsQuery.refetch();
      }
      setErrors({ form: bookingErrorMessage(error) });
    }
  };

  const answerField = (field: string) => {
    const common = {
      id: `booking-${field}`,
      value: draft.answers[field] ?? '',
      required: true,
      'aria-invalid': errors.answers?.[field] ? true : undefined,
      'aria-describedby': errors.answers?.[field] ? `booking-${field}-error` : undefined,
    };
    const onValue = (value: string) => update('answers', { ...draft.answers, [field]: value });
    if (field === 'notes') {
      return (
        <Textarea {...common} maxLength={1000} rows={3} onChange={(e) => onValue(e.target.value)} />
      );
    }
    return (
      <Input
        {...common}
        type={field === 'phone' ? 'tel' : 'text'}
        autoComplete={field === 'phone' ? 'tel' : 'organization'}
        maxLength={field === 'phone' ? 40 : 200}
        onChange={(e) => onValue(e.target.value)}
      />
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">{event.firmName}</p>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">{event.eventName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {`${event.durationMinutes} min · ${LOCATION_LABELS[event.locationType] ?? 'Details from the firm'}`}
      </p>
      {event.description && <p className="mt-4 text-foreground">{event.description}</p>}

      <section aria-labelledby="booking-when" className="mt-8 space-y-4">
        <h2 id="booking-when" className="text-lg font-semibold text-foreground">
          Choose a time
        </h2>
        {slotsQuery.isLoading && <output>Loading available times</output>}
        {slotsQuery.isError && (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300">
              {errorCode(slotsQuery.error) === 'TOO_MANY_REQUESTS'
                ? 'Too many requests just now. Please wait a moment and try again.'
                : 'The available times could not be loaded.'}
            </p>
            <Button type="button" variant="outline" onClick={() => void slotsQuery.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!slotsQuery.isLoading && days.length > 0 && !firstOpenDay && (
          <p className="text-muted-foreground">
            No open times in the next 14 days. Please contact the firm.
          </p>
        )}
        {firstOpenDay && (
          <>
            <ChoiceGroup
              name="booking-day"
              label="Choose a day"
              className="flex gap-2 overflow-x-auto pb-1"
              value={selectedDate}
              onChange={(value) => {
                setDate(value);
                update('start', '');
              }}
              choices={days.map((d) => ({
                value: d.date,
                label: dayLabel(d.date),
                detail: d.slots.length === 0 ? 'no times' : `${d.slots.length} times`,
                disabled: d.slots.length === 0,
              }))}
            />
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {`${daySlots.length} times available on ${dayLabel(selectedDate)}.`}
            </p>
            <p className="text-xs text-muted-foreground">
              {`Days follow ${event.firmName}'s calendar (${event.timezone}). Times shown in your time zone${
                visitorZone ? ` (${visitorZone})` : ''
              }, with your date when it differs.`}
            </p>
            <ChoiceGroup
              name="booking-time"
              label="Available times"
              className="grid grid-cols-3 gap-2 sm:grid-cols-4"
              value={draft.start}
              onChange={(value) => update('start', value)}
              choices={daySlots.map((s) => ({
                value: s.start,
                label: slotLabel(s.start, event.timezone),
                detail: `${timeLabel(s.start, event.timezone)} ${event.timezone}`,
              }))}
            />
            {errors.slot && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {errors.slot}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="booking-details" className="mt-8 space-y-4">
        <h2 id="booking-details" className="text-lg font-semibold text-foreground">
          Your details
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="booking-name">Your name</Label>
          <Input
            id="booking-name"
            value={draft.name}
            maxLength={200}
            autoComplete="name"
            required
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'booking-name-error' : undefined}
          />
          <FieldError id="booking-name-error" message={errors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="booking-email">Email</Label>
          <Input
            id="booking-email"
            type="email"
            value={draft.email}
            maxLength={320}
            autoComplete="email"
            required
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'booking-email-error' : undefined}
          />
          <FieldError id="booking-email-error" message={errors.email} />
        </div>
        {requiredFields.map((field) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`booking-${field}`}>{FIELD_LABELS[field]}</Label>
            {answerField(field)}
            <FieldError id={`booking-${field}-error`} message={errors.answers?.[field]} />
          </div>
        ))}

        {/* Honeypot: visually off-screen, out of the tab order; people never see or fill it. */}
        <div
          style={{
            position: 'absolute',
            left: '-10000px',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <label htmlFor="booking-website">Leave this field empty</label>
          <input
            id="booking-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="booking-consent"
            checked={draft.consent}
            onCheckedChange={(checked) => update('consent', checked === true)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? 'booking-consent-error' : undefined}
          />
          <Label htmlFor="booking-consent" className="text-sm font-normal leading-snug">
            {`I agree that ${event.firmName} may use these details to arrange this appointment, as described in its `}
            <a
              href={event.privacyUrl ?? '/privacy'}
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy notice
            </a>
            {'.'}
          </Label>
        </div>
        <FieldError id="booking-consent-error" message={errors.consent} />

        {errors.form && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {errors.form}
          </p>
        )}

        <Button type="button" onClick={submit} disabled={bookMutation.isPending}>
          {bookMutation.isPending ? 'Booking…' : 'Book'}
        </Button>
      </section>

      <footer className="mt-12 text-xs text-muted-foreground">
        {'Powered by '}
        <Link href="/" className="underline underline-offset-2">
          Aurora
        </Link>
      </footer>
    </main>
  );
}
