'use client';

/**
 * MVP-013: the Google sign-in also asks to use the calendar, so Aurora's appointments and the
 * user's Google events can sync both ways. Google lets the user untick that on its consent screen,
 * and a mailbox connected before it was asked for does not have it. This card says so plainly and
 * offers the sign-in again (the mailbox keeps working meanwhile).
 */
import { Button } from '@intelliflow/ui';

export interface GoogleCalendarAccessProps {
  /** Sign in with Google again, asking for the calendar too; absent when Google is not set up here. */
  onConnect?: () => void;
  pending: boolean;
  idPrefix: string;
}

export function GoogleCalendarAccess({
  onConnect,
  pending,
  idPrefix,
}: Readonly<GoogleCalendarAccessProps>) {
  const titleId = `${idPrefix}-calendar-access-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      data-testid="google-calendar-access"
    >
      <h3 id={titleId} className="font-medium text-foreground">
        Google Calendar is not connected
      </h3>
      <p className="text-muted-foreground">
        Aurora can show your appointments in Google Calendar and your Google events in Aurora. It
        needs your permission to use your calendar: allow it when Google asks. Your mailbox keeps
        working without it.
      </p>
      {onConnect && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onConnect}>
          Connect Google Calendar
        </Button>
      )}
    </section>
  );
}
