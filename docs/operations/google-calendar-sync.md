# Google Calendar sync (MVP-013)

How a user's Google calendar and Aurora's appointments stay in step, who owns a
calendar, what wins when both change, and what the sync costs. The code is in
`apps/api/src/modules/calendar/google-calendar-*.ts`; the Google client is
`packages/adapters/src/calendar/google/client.ts`.

## Who owns a calendar

A calendar belongs to a person, so **calendar sync is per user, under that
user's own Google connection**.

- Each user connects Google in Settings, Email, "My mailbox" (a `USER`-scope
  Gmail mailbox). That one sign-in asks for mail and for `calendar.events`.
- The company mailbox (`TENANT` scope, the shared sending address) never has a
  calendar: the settings card shows no calendar line for it and the sync never
  claims it. An owner whose company Gmail is connected as the company mailbox
  connects his own Google under "My mailbox" to sync his calendar.
- The sync's identity for a calendar is Google's immutable account id (`sub`),
  never the address, so a renamed address keeps its links and a different
  account starts a clean sync.
- Every query carries the mailbox's `tenantId`, `userId` and mailbox id. Only
  the user's own appointments (`organizerId = userId`) go to Google; events read
  from Google become appointments of that user in that tenant. Private and
  confidential Google events are not copied into Aurora, which is shared with
  the user's team.

## Connect, and re-consent

- The Google connect (same OAuth client as mail) requests `calendar.events`.
  Google lets the user untick it, so the permission is read from what was
  granted (`grantedScopes`), not assumed.
- A mailbox connected before the calendar was asked for, or one where it was
  unticked, shows "Google Calendar is not connected" with a **Connect Google
  Calendar** button. That runs the Google connect again (mail keeps working
  meanwhile) and replaces the stored grant, so already-connected users
  re-consent in one click and nobody has to disconnect.
- Tokens are the mail token store's: the encrypted refresh token on the mailbox
  row, access tokens refreshed in memory by `getOAuthAccess`. Calendar sync adds
  no second credential.

## Revoked access

If Google answers that the calendar permission is gone (the user withdrew it in
their Google account), the round marks the mailbox
`calendarStatus = NEEDS_RECONNECT` and the sync stops for it. Settings shows the
**"Google Calendar needs to be connected again"** card with a **Reconnect Google
Calendar** button. Mail is unaffected. A reconnect resets the status and the
sync starts again. A mailbox with no stored Google account id is also shown the
reconnect card until a connect captures one.

## Sync design

One tick in the API process on Railway (the shared background tick, once a
minute; never a Vercel cron) claims the due mailboxes one at a time with a lease
(`FOR UPDATE SKIP LOCKED`), so two replicas never sync one calendar twice. The
claim picks one mailbox in a materialised CTE and updates only that row. The
shorter `UPDATE ... WHERE id IN (SELECT ... LIMIT 1 FOR UPDATE SKIP LOCKED)`
form is run by Postgres as a join on some plans and then locks every due mailbox
while the caller syncs only the first, leaving the rest locked for the lease
(found by the real-database test; the Outlook inbox sync and the bounce scan
still use that form).

- Only connected, healthy, `USER`-scope Gmail mailboxes with the calendar
  permission are due. Idle accounts cost nothing.
- A mailbox is due **four minutes** after its last round began. With the
  one-minute tick a round starts 4 to 5 minutes after the last, so a change on
  either side lands inside the five minutes promised.
- **Google to Aurora:** Google's incremental `syncToken`. Only changed events
  come back; the token is kept on the mailbox (`calendarSyncToken`). When Google
  expires a token (410) the round runs a full sync of the next 365 days, and one
  is run every 30 days so events that come into view are read.
- **Aurora to Google:** appointments are written on the next round (at most four
  to five minutes after the edit). The round reads **ids only** of the links
  edited since they were last synced (a database comparison of
  `appointments.updatedAt` against `calendar_event_links.localSyncedAt`), then
  loads and writes just those. It does not re-read every appointment each round.
- Create, patch and delete, at most 50 writes per round; a backlog carries on
  next round.

### Egress per connected calendar per month

Estimates, steady state with no edits (the common case): per round the database
sends the claim row, the mailbox row (encrypted token, scopes, state, about 2 to
3 KB), the release row (about the same) and empty answers for the link scans,
roughly 6 to 8 KB. At one round every 4 to 5 minutes that is about 9,000 to
10,800 rounds a month, so **about 0.1 GB per connected calendar per month**.
Edits add about 2 KB per edited appointment. Google's side is not Supabase
egress.

Before the ids-only query, the patch step loaded every linked appointment each
round: about 0.6 MB for a calendar of 300 events, about 6 GB a month for one
calendar. That was the one thing that would have broken the 5.5 GB budget.

## Idempotency

- **Event id:** an Aurora appointment is created in Google under an id derived
  from the mailbox and the appointment (`eventIdFor`, sha-256 in Google's
  base32hex alphabet). Creating again after a lost answer gets Google's 409 and
  finds the same event.
- **Link table:** `calendar_event_links` has
  `UNIQUE (mailboxId, googleAccount, googleEventId)` and
  `UNIQUE (mailboxId, appointmentId)`. The link is written first, `pending`,
  then settled; an appointment and its link are always made in one transaction.
- **Extended properties:** every event Aurora creates carries private extended
  properties `auroraAppointmentId` and `auroraIdempotencyKey` (visible to Aurora
  only, never to guests). If a link is lost, the next read links the event to
  its appointment again instead of importing a second one. An appointment that
  already has a link is not taken: the event is then a copy the user made in
  Google and imports on its own.
- **Echo suppression:** the etag and times kept on a link tell an echo of our
  own write from a real change, so nothing bounces between the two sides.
- No guests are ever written, so Google never emails anyone on the user's
  behalf.

## Conflict rule: last writer wins, by updated time

When an appointment and its event were both changed since the last sync, the
side with the later updated time wins (`appointments.updatedAt` against Google's
`updated`):

- Google newer: its title, description, location and times are written into the
  appointment.
- Aurora newer: the next push sends the appointment over the event.
- A Google change made less than a minute after the appointment's edit does not
  count as the user's (it is the commit of our own write still in flight):
  Aurora keeps it.
- Patches go with `If-Match: <etag>`. If Google answers 412 (the event changed
  since the pull) the round reads the event, applies the same rule and sends
  again over the fresh etag, once. Google's edit is never overwritten blindly.
- A deletion in Google cancels the appointment ("Cancelled in Google Calendar").
  Cancelling or deleting an Aurora appointment deletes the event Aurora made; it
  never deletes an event that came from Google.
- Recurring appointments are not pushed (one row cannot express the series);
  recurring Google events arrive as their expanded instances.

## Retry and backoff

- A failing item (Google refused one event) is counted, remembered on its link
  (`pushAttempts`, `nextPushAt`), and waits 5 minutes after the first failure,
  twice as long each time, up to a day. It is never given up on, and an edit to
  the appointment lets it through straight away.
- A failing round (network, 5xx) backs the whole mailbox off by 4 minutes
  doubled per failure, capped at 6 hours. A rate limit waits at least as long as
  Google asked. A withdrawn permission is not retried: it becomes the reconnect
  card.
- The adapter retries transient errors inside a call with its own backoff.

## Switches and settings

| what                       | where                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Google client              | `EMAIL_OAUTH_GOOGLE_CLIENT_ID` and `EMAIL_OAUTH_GOOGLE_CLIENT_SECRET` (already set for mail) |
| turn the calendar sync off | `GOOGLE_CALENDAR_SYNC=off` on the API process (mail sync keeps running)                      |
| tick interval              | `EMAIL_INBOX_SYNC_INTERVAL_MS` (default 60000; `0` also stops the calendar sync)             |
| status                     | Settings, Email: "Last synced ..." under the user's Google mailbox                           |

The Google Cloud project needs the Calendar API enabled (it is) and
`calendar.events` on the consent screen. The consent screen may stay unverified
for our own accounts.
