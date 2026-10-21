/**
 * Public booking emails (PG-203, owner ruling Q6, runner requirement R4, ADR-083).
 *
 * Two fixed templates: a confirmation to the booker and a notification to the
 * host's stored email. Every interpolated value is HTML-escaped; subjects carry
 * only the admin-authored event name with line breaks stripped (no header
 * injection). The booker's address is unverified, so the booker mail never
 * echoes free-text answers and has no ICS attachment, and the host mail says the
 * address is unverified. A failed send is logged without PII and never undoes a
 * booking.
 */
import type { EventLocationType } from '@intelliflow/domain';
import type { PublicBookAnswers } from '@intelliflow/validators';
import { escapeHtml, stripLineBreaks } from '../../security/html-escape';

export interface BookingEmailDetails {
  firmName: string;
  eventName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  locationType: EventLocationType;
  locationDetails: string | null;
  bookerName: string;
  bookerEmail: string;
  answers: PublicBookAnswers;
  hostEmail: string;
  matchedExistingRecord: boolean;
}

interface EmailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  replyTo?: string;
}

interface EmailSender {
  sendEmail(options: EmailMessage): Promise<{ isFailure: boolean; error?: unknown }>;
}

export function formatBookingTime(
  d: Pick<BookingEmailDetails, 'startsAt' | 'endsAt' | 'timezone'>
): string {
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: d.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d.startsAt);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: d.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${day.replace(',', '')}, ${time.format(d.startsAt)}–${time.format(d.endsAt)} (${d.timezone})`;
}

function isHttpsLink(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function locationText(d: BookingEmailDetails): string {
  switch (d.locationType) {
    case 'VIDEO':
      return d.locationDetails
        ? `Video call: ${d.locationDetails}`
        : 'Video call (the link will follow)';
    case 'IN_PERSON':
      return `In person: ${d.locationDetails ?? ''}`.trim();
    case 'PHONE':
      return d.locationDetails
        ? `Phone call: ${d.locationDetails}`
        : 'Phone call (we will call you)';
    default:
      return d.locationDetails ?? 'Details will follow';
  }
}

function locationHtml(d: BookingEmailDetails): string {
  if (d.locationType === 'VIDEO' && d.locationDetails && isHttpsLink(d.locationDetails)) {
    const link = escapeHtml(d.locationDetails);
    return `Video call: <a href="${link}">${link}</a>`;
  }
  return escapeHtml(locationText(d));
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p>${line}</p>`).join('\n');
}

export function buildBookerConfirmation(d: BookingEmailDetails): EmailMessage {
  const when = formatBookingTime(d);
  const eventName = stripLineBreaks(d.eventName);
  return {
    to: [d.bookerEmail],
    replyTo: d.hostEmail,
    subject: `Booking confirmed: ${eventName}`,
    textBody: [
      `Hello ${d.bookerName},`,
      '',
      `Your ${eventName} with ${d.firmName} is booked.`,
      `When: ${when}`,
      `Where: ${locationText(d)}`,
      '',
      `To change or cancel this booking, contact ${d.firmName} by replying to this email.`,
    ].join('\n'),
    htmlBody: paragraphs([
      `Hello ${escapeHtml(d.bookerName)},`,
      `Your ${escapeHtml(eventName)} with ${escapeHtml(d.firmName)} is booked.`,
      `<strong>When:</strong> ${escapeHtml(when)}`,
      `<strong>Where:</strong> ${locationHtml(d)}`,
      `To change or cancel this booking, contact ${escapeHtml(d.firmName)} by replying to this email.`,
    ]),
  };
}

const ANSWER_LABELS: Array<[keyof PublicBookAnswers, string]> = [
  ['phone', 'Phone'],
  ['company', 'Company'],
  ['notes', 'Notes'],
];

export function buildHostNotification(d: BookingEmailDetails): EmailMessage {
  const when = formatBookingTime(d);
  const eventName = stripLineBreaks(d.eventName);
  const answers = ANSWER_LABELS.filter(([key]) => d.answers[key]).map(
    ([key, label]) => [label, String(d.answers[key])] as const
  );
  const unverified = 'This email address has not been verified.';
  const matched =
    'This email matches an existing record in your CRM, so it was not linked automatically. Review and link it in the CRM.';
  return {
    to: [d.hostEmail],
    subject: `New booking: ${eventName}`,
    textBody: [
      `New booking from your public booking page.`,
      '',
      `Event: ${eventName}`,
      `When: ${when}`,
      `Name: ${d.bookerName}`,
      `Email: ${d.bookerEmail} (${unverified})`,
      ...answers.map(([label, value]) => `${label}: ${value}`),
      ...(d.matchedExistingRecord ? ['', matched] : []),
    ].join('\n'),
    htmlBody: paragraphs([
      'New booking from your public booking page.',
      `<strong>Event:</strong> ${escapeHtml(eventName)}`,
      `<strong>When:</strong> ${escapeHtml(when)}`,
      `<strong>Name:</strong> ${escapeHtml(d.bookerName)}`,
      `<strong>Email:</strong> ${escapeHtml(d.bookerEmail)} (${unverified})`,
      ...answers.map(([label, value]) => `<strong>${label}:</strong> ${escapeHtml(value)}`),
      ...(d.matchedExistingRecord ? [escapeHtml(matched)] : []),
    ]),
  };
}

async function sendOne(sender: EmailSender, message: EmailMessage, kind: string): Promise<void> {
  try {
    const result = await sender.sendEmail(message);
    if (result.isFailure) {
      console.warn('[public-booking] Booking email was not sent', { kind });
    }
  } catch (error) {
    console.warn('[public-booking] Booking email failed', {
      kind,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function sendBookingEmails(
  sender: EmailSender,
  d: BookingEmailDetails
): Promise<void> {
  await sendOne(sender, buildBookerConfirmation(d), 'booker-confirmation');
  await sendOne(sender, buildHostNotification(d), 'host-notification');
}
