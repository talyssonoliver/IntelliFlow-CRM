'use client';

/**
 * MVP-013: the Google sign-in also asks to use the calendar, so Aurora's appointments and the
 * user's Google events can sync both ways. Google lets the user untick that on its consent screen,
 * and a mailbox connected before it was asked for does not have it. This card says so plainly and
 * offers the sign-in again (the mailbox keeps working meanwhile). 
econnect: the calendar was connected
 * and syncing, and Google has since refused Aurora's access to it (the user withdrew the permission), so
 * the sync has stopped until they sign in again.
 */
import { Button } from '@intelliflow/ui';

export interface GoogleCalendarAccessProps {
  /** Sign in with Google again, asking for the calendar too; absent when Google is not set up here. */
  onConnect?: () => void;
  pending: boolean;
  idPrefix: string;
  /** The sync stopped because Google withdrew the access: say so, rather than that it was never allowed. */
  reconnect?: boolean;
}

export function GoogleCalendarAccess({
  onConnect,
  pending,
  idPrefix,
  reconnect = false,
}: Readonly<GoogleCalendarAccessProps>) {
  const titleId = `${idPrefix}-calendar-access-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      data-testid={reconnect ? 'google-calendar-reconnect' : 'google-calendar-access'}
    >
      <h3 id={titleId} className="font-medium text-foreground">
        {reconnect
          ? 'Google Calendar needs to be connected again'
          : 'Google Calendar is not connected'}
      </h3>
      <p className="text-muted-foreground">
        {reconnect
          ? 'Google no longer lets Aurora use your calendar, so your appointments and Google events are not syncing. Sign in with Google again and allow the calendar when it asks. Your mailbox keeps working meanwhile.'
          : 'Aurora can show your appointments in Google Calendar and your Google events in Aurora. It needs your permission to use your calendar: allow it when Google asks. Your mailbox keeps working without it.'}
      </p>
      {onConnect && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onConnect}>
          {reconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
        </Button>
      )}
    </section>
  );
}
