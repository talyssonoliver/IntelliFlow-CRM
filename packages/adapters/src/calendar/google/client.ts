import { randomUUID } from 'node:crypto';
import { Result, DomainError, Appointment } from '@intelliflow/domain';
import {
  CalendarServicePort,
  CalendarProvider,
  ExternalCalendarEvent,
  OAuthTokens,
  OAuthConfig,
  WebhookRegistration,
  WebhookPayload,
  SyncResult,
  CalendarAuthenticationError,
  CalendarSyncError,
  CalendarRateLimitError,
  CalendarEventNotFoundError,
  CalendarConflictError,
  CalendarSyncTokenExpiredError,
} from '@intelliflow/application';
import { RetryHandler, RateLimiter } from '../shared/RetryHandler';
import { IdempotencyManager, InMemoryIdempotencyStore } from '../shared/IdempotencyManager';

/**
 * Google Calendar Adapter
 * Implements CalendarServicePort for Google Calendar API v3
 *
 * @see IFC-138: Google Calendar integration with bidirectional sync
 * @see https://developers.google.com/calendar/api/v3/reference
 */

// Google Calendar API Types
/** The private extended properties an event made from an Aurora appointment carries (MVP-013). */
export const AURORA_APPOINTMENT_PROPERTY = 'auroraAppointmentId';
export const AURORA_IDEMPOTENCY_PROPERTY = 'auroraIdempotencyKey';

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: GoogleAttendee[];
  organizer?: {
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  status?: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string[];
  iCalUID?: string;
  htmlLink?: string;
  etag?: string;
  updated?: string;
  created?: string;
  visibility?: string;
  /** Private properties are visible to the app that wrote them only (never to guests). */
  extendedProperties?: { private?: Record<string, string> };
}

interface GoogleAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

interface GoogleEventsListResponse {
  kind: string;
  etag: string;
  summary?: string;
  nextPageToken?: string;
  nextSyncToken?: string;
  items: GoogleCalendarEvent[];
}

interface GoogleChannelResponse {
  kind: string;
  id: string;
  resourceId: string;
  resourceUri: string;
  expiration?: string;
}

interface GoogleOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error_description?: string;
}

interface GoogleErrorResponse {
  error_description?: string;
  error?: string;
}

export interface GoogleCalendarConfig {
  oauthConfig: OAuthConfig;
  calendarId?: string; // Default: 'primary'
  apiBaseUrl?: string;
}

/**
 * What the adapter needs of an appointment to write it to Google. The domain Appointment has all of
 * it; MVP-013's sync builds it from a database row, with the guests left out (an invitation would
 * email people on the user's behalf).
 */
export interface CalendarAppointmentLike {
  readonly id: { readonly value: string };
  readonly title: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly attendeeIds: ReadonlyArray<string>;
  readonly isCancelled: boolean;
}

/** The window of a full sync, fixed across its pages (Google refuses a page request whose query changed). */
export interface FullSyncWindow {
  timeMin: Date;
  timeMax?: Date;
}

/** Google's refusals that mean "too many requests": wait and try again, do not treat as an error of the item. */
const RATE_LIMIT_REASONS = [
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
];

/**
 * Google Calendar Service Adapter
 */
export class GoogleCalendarAdapter implements CalendarServicePort {
  readonly provider: CalendarProvider = 'google';

  private readonly config: GoogleCalendarConfig;
  private readonly retryHandler: RetryHandler;
  private readonly rateLimiter: RateLimiter;
  private readonly idempotencyManager: IdempotencyManager;
  private readonly apiBaseUrl: string;
  private readonly calendarId: string;

  constructor(config: GoogleCalendarConfig) {
    this.config = config;
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://www.googleapis.com/calendar/v3';
    this.calendarId = config.calendarId ?? 'primary';

    // Initialize retry handler with Google-specific config
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      retryableStatusCodes: [403, 429, 500, 503],
    });

    // Rate limiter: Google Calendar allows ~1000 requests/100 seconds
    this.rateLimiter = new RateLimiter({
      windowMs: 100000,
      maxRequests: 900, // Leave some headroom
    });

    // Idempotency manager with 1 hour TTL
    this.idempotencyManager = new IdempotencyManager(new InMemoryIdempotencyStore(), {
      ttlMinutes: 60,
    });
  }

  // ==================== OAuth2 Authentication ====================

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.oauthConfig.clientId,
      redirect_uri: this.config.oauthConfig.redirectUri,
      response_type: 'code',
      scope: this.config.oauthConfig.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent', // Force refresh token on each auth
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<Result<OAuthTokens, DomainError>> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.oauthConfig.clientId,
          client_secret: this.config.oauthConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.oauthConfig.redirectUri,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as GoogleErrorResponse;
        return Result.fail(
          new CalendarAuthenticationError(
            'google',
            error.error_description ?? 'Token exchange failed'
          )
        );
      }

      const data = (await response.json()) as GoogleOAuthTokenResponse;
      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '', // Initial exchange always has refresh_token
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      };

      return Result.ok(tokens);
    } catch (error) {
      return Result.fail(
        new CalendarAuthenticationError(
          'google',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<Result<OAuthTokens, DomainError>> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.oauthConfig.clientId,
          client_secret: this.config.oauthConfig.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as GoogleErrorResponse;
        return Result.fail(
          new CalendarAuthenticationError(
            'google',
            error.error_description ?? 'Token refresh failed'
          )
        );
      }

      const data = (await response.json()) as GoogleOAuthTokenResponse;
      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: refreshToken, // Google doesn't always return new refresh token
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      };

      return Result.ok(tokens);
    } catch (error) {
      return Result.fail(
        new CalendarAuthenticationError(
          'google',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async revokeTokens(accessToken: string): Promise<Result<void, DomainError>> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
      });

      if (!response.ok && response.status !== 400) {
        // 400 = token already revoked, which is fine
        return Result.fail(new CalendarAuthenticationError('google', 'Token revocation failed'));
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new CalendarAuthenticationError(
          'google',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  // ==================== Event CRUD Operations ====================

  /**
   * `options.eventId` (MVP-013): the id the new event is created with, which Google keeps unique in a
   * calendar. A retry after a lost answer then finds the event it made already there (409) and
   * returns it, instead of creating a second one.
   */
  async createEvent(
    tokens: OAuthTokens,
    appointment: CalendarAppointmentLike,
    idempotencyKey: string,
    options?: { eventId?: string }
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    // Check for duplicate operation
    const duplicateCheck = await this.idempotencyManager.checkDuplicate(idempotencyKey);
    if (duplicateCheck.isDuplicate && duplicateCheck.previousResult?.result === 'success') {
      // Return cached result
      const existingEvent = await this.getEvent(
        tokens,
        duplicateCheck.previousResult.externalEventId!
      );
      if (existingEvent.isSuccess && existingEvent.value) {
        return Result.ok(existingEvent.value);
      }
    }

    return this.retryHandler.executeWithRetry(async () => {
      // Check rate limit
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      const googleEvent = this.appointmentToGoogleEvent(appointment);
      if (options?.eventId) googleEvent.id = options.eventId;
      // MVP-013: the event says which appointment and which operation made it, in a private property.
      // The sync's link table is the first guard against a duplicate; this marker lets a link that was
      // lost be made again from the event, instead of the event being imported as a second appointment.
      googleEvent.extendedProperties = {
        private: {
          [AURORA_APPOINTMENT_PROPERTY]: appointment.id.value,
          [AURORA_IDEMPOTENCY_PROPERTY]: idempotencyKey,
        },
      };

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googleEvent),
          }
        );

        if (response.status === 409 && options?.eventId) {
          // That id exists already: an earlier attempt created this event and its answer was lost.
          const existing = await this.getEvent(tokens, options.eventId);
          if (existing.isFailure) return Result.fail(existing.error);
          if (existing.value) return Result.ok(existing.value);
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const createdEvent = (await response.json()) as GoogleCalendarEvent;
        const externalEvent = this.googleEventToExternal(createdEvent);

        // Record success
        await this.idempotencyManager.recordSuccess(
          idempotencyKey,
          appointment.id.value,
          'create',
          externalEvent.externalId
        );

        return Result.ok(externalEvent);
      } catch (error) {
        await this.idempotencyManager.recordFailure(
          idempotencyKey,
          appointment.id.value,
          'create',
          error instanceof Error ? error.message : 'Unknown error'
        );
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async updateEvent(
    tokens: OAuthTokens,
    externalEventId: string,
    appointment: CalendarAppointmentLike,
    etag?: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    return this.sendEventChange(
      tokens,
      externalEventId,
      'PUT',
      this.appointmentToGoogleEvent(appointment),
      etag
    );
  }

  /**
   * One change to an existing event (PUT or PATCH): rate limit, request, and the answer as a Result.
   * An etag makes it conditional (optimistic concurrency): a 412 is a conflict.
   */
  private sendEventChange(
    tokens: OAuthTokens,
    externalEventId: string,
    method: 'PUT' | 'PATCH',
    body: unknown,
    etag?: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      };
      if (etag) {
        headers['If-Match'] = etag;
      }

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(externalEventId)}`,
          { method, headers, body: JSON.stringify(body) }
        );

        if (!response.ok) {
          if (response.status === 412) {
            // Precondition failed - etag mismatch (concurrent modification)
            return Result.fail(new CalendarConflictError('Event was modified by another source'));
          }
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const updatedEvent = (await response.json()) as GoogleCalendarEvent;
        return Result.ok(this.googleEventToExternal(updatedEvent));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  /**
   * MVP-013: changes only what the CRM owns of an event (title, notes, place, time, status) with a
   * PATCH, so what Google keeps on its own side (guests, Meet link, reminders, colour) survives:
   * the PUT of updateEvent replaces the whole event. A cleared note or place is sent as null, which
   * is how Google removes a field.
   */
  async patchEvent(
    tokens: OAuthTokens,
    externalEventId: string,
    appointment: CalendarAppointmentLike,
    etag?: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    return this.sendEventChange(
      tokens,
      externalEventId,
      'PATCH',
      {
        summary: appointment.title,
        description: appointment.description ?? null,
        location: appointment.location ?? null,
        // The instant only: no timeZone, so a recurring event keeps the zone its repeats are
        // expanded in (daylight saving), and the other of date / dateTime is cleared, which PATCH
        // would otherwise merge.
        start: { dateTime: appointment.startTime.toISOString(), date: null },
        end: { dateTime: appointment.endTime.toISOString(), date: null },
        // Only a cancellation sets the status: confirming would bring back an event deleted in Google.
        ...(appointment.isCancelled ? { status: 'cancelled' } : {}),
      },
      etag
    );
  }

  async deleteEvent(
    tokens: OAuthTokens,
    externalEventId: string
  ): Promise<Result<void, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(externalEventId)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (!response.ok && response.status !== 404 && response.status !== 410) {
          // 404/410 = already deleted, which is fine
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        return Result.ok(undefined);
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async getEvent(
    tokens: OAuthTokens,
    externalEventId: string
  ): Promise<Result<ExternalCalendarEvent | null, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(externalEventId)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (response.status === 404 || response.status === 410) {
          return Result.ok(null);
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const event = (await response.json()) as GoogleCalendarEvent;
        return Result.ok(this.googleEventToExternal(event));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async getEventByICalUID(
    tokens: OAuthTokens,
    iCalUID: string
  ): Promise<Result<ExternalCalendarEvent | null, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const params = new URLSearchParams({
          iCalUID,
          maxResults: '1',
        });

        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const data = (await response.json()) as GoogleEventsListResponse;
        if (data.items.length === 0) {
          return Result.ok(null);
        }

        return Result.ok(this.googleEventToExternal(data.items[0]));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  // ==================== Sync Operations ====================

  /**
   * `window` (MVP-013) is the full sync's time range, passed on every page of it: without one the
   * start is "now" at each call, which Google rejects once a second page asks with another time.
   */
  async fetchChanges(
    tokens: OAuthTokens,
    syncToken?: string,
    pageToken?: string,
    window?: FullSyncWindow
  ): Promise<
    Result<
      {
        events: ExternalCalendarEvent[];
        deletedEventIds: string[];
        nextSyncToken?: string;
        nextPageToken?: string;
      },
      DomainError
    >
  > {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const params = this.changesQuery(syncToken, pageToken, window);

        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (response.status === 410) {
          // Sync token expired, need full sync
          return Result.fail(new CalendarSyncTokenExpiredError('google'));
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const data = (await response.json()) as GoogleEventsListResponse;

        const events: ExternalCalendarEvent[] = [];
        const deletedEventIds: string[] = [];

        for (const item of data.items) {
          if (item.status === 'cancelled' && item.id) {
            deletedEventIds.push(item.id);
          } else {
            events.push(this.googleEventToExternal(item));
          }
        }

        return Result.ok({
          events,
          deletedEventIds,
          nextSyncToken: data.nextSyncToken,
          nextPageToken: data.nextPageToken,
        });
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  /**
   * The list query of a sync read. An incremental read (with a sync token) takes no time range;
   * a full read starts at the window's start (default: now) and, with one, ends at its end.
   */
  private changesQuery(
    syncToken: string | undefined,
    pageToken: string | undefined,
    window: FullSyncWindow | undefined
  ): URLSearchParams {
    const params = new URLSearchParams({
      showDeleted: 'true',
      singleEvents: 'true',
      maxResults: '250',
    });
    if (syncToken) {
      params.set('syncToken', syncToken);
    } else {
      params.set('timeMin', (window?.timeMin ?? new Date()).toISOString());
      if (window?.timeMax) params.set('timeMax', window.timeMax.toISOString());
    }
    if (pageToken) params.set('pageToken', pageToken);
    return params;
  }

  async fetchEventsInRange(
    tokens: OAuthTokens,
    startTime: Date,
    endTime: Date,
    pageToken?: string
  ): Promise<
    Result<
      {
        events: ExternalCalendarEvent[];
        nextPageToken?: string;
      },
      DomainError
    >
  > {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('google', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const params = new URLSearchParams({
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        });

        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        const response = await fetch(
          `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const data = (await response.json()) as GoogleEventsListResponse;
        const events = data.items
          .filter((item) => item.status !== 'cancelled')
          .map((item) => this.googleEventToExternal(item));

        return Result.ok({
          events,
          nextPageToken: data.nextPageToken,
        });
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async pushToCalendar(
    tokens: OAuthTokens,
    appointment: Appointment,
    idempotencyKey: string
  ): Promise<Result<SyncResult, DomainError>> {
    // Check if event already exists
    if (appointment.externalCalendarId) {
      const existing = await this.getEvent(tokens, appointment.externalCalendarId);
      if (existing.isSuccess && existing.value) {
        // Update existing event
        const updateResult = await this.updateEvent(
          tokens,
          appointment.externalCalendarId,
          appointment,
          existing.value.etag
        );

        if (updateResult.isFailure) {
          return Result.fail(updateResult.error);
        }

        return Result.ok({
          success: true,
          externalEventId: updateResult.value.externalId,
          localAppointmentId: appointment.id.value,
          operation: 'update',
          idempotencyKey,
        });
      }
    }

    // Create new event
    const createResult = await this.createEvent(tokens, appointment, idempotencyKey);

    if (createResult.isFailure) {
      return Result.fail(createResult.error);
    }

    return Result.ok({
      success: true,
      externalEventId: createResult.value.externalId,
      localAppointmentId: appointment.id.value,
      operation: 'create',
      idempotencyKey,
    });
  }

  // ==================== Webhook Management ====================

  async registerWebhook(
    tokens: OAuthTokens,
    callbackUrl: string,
    expirationMinutes: number = 43200 // Default 30 days (max for Google)
  ): Promise<Result<WebhookRegistration, DomainError>> {
    // The webhook route rejects any notification without this token, so a channel made
    // without it could never deliver anything.
    const channelToken = process.env.GOOGLE_CALENDAR_CHANNEL_TOKEN;
    if (!channelToken) {
      return Result.fail(
        new CalendarSyncError(
          'google',
          'GOOGLE_CALENDAR_CHANNEL_TOKEN is not set, so no channel can be verified'
        )
      );
    }
    try {
      const channelId = randomUUID();
      const expiration = new Date(Date.now() + expirationMinutes * 60 * 1000);

      this.rateLimiter.recordRequest();
      const response = await fetch(
        `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/watch`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: channelId,
            type: 'web_hook',
            address: callbackUrl,
            expiration: expiration.getTime().toString(),
            // Google sends this back on every notification, and the webhook route compares it.
            token: channelToken,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return this.handleApiError(response.status, error);
      }

      const data = (await response.json()) as GoogleChannelResponse;

      return Result.ok({
        id: channelId,
        provider: 'google',
        callbackUrl,
        expiresAt: data.expiration ? new Date(Number.parseInt(data.expiration)) : expiration,
        resourceId: data.resourceId,
        channelId: data.id,
      });
    } catch (error) {
      return Result.fail(
        new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async renewWebhook(
    tokens: OAuthTokens,
    webhookId: string
  ): Promise<Result<WebhookRegistration, DomainError>> {
    // Google doesn't support renewal - need to create new webhook
    // This should be handled by stopping old webhook and creating new one
    return Result.fail(
      new CalendarSyncError(
        'google',
        'Google Calendar does not support webhook renewal. Stop and recreate.'
      )
    );
  }

  async unregisterWebhook(
    tokens: OAuthTokens,
    webhookId: string,
    resourceId?: string
  ): Promise<Result<void, DomainError>> {
    if (!resourceId) {
      return Result.fail(
        new CalendarSyncError('google', 'resourceId is required to stop Google Calendar webhook')
      );
    }

    try {
      this.rateLimiter.recordRequest();
      const response = await fetch(`${this.apiBaseUrl}/channels/stop`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: webhookId,
          resourceId,
        }),
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.json().catch(() => ({}));
        return this.handleApiError(response.status, error);
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new CalendarSyncError('google', error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  parseWebhookPayload(
    headers: Record<string, string>,
    body: unknown
  ): Result<WebhookPayload, DomainError> {
    try {
      // Google sends headers with push notifications
      const resourceState = headers['x-goog-resource-state'];
      const resourceId = headers['x-goog-resource-id'];
      const channelId = headers['x-goog-channel-id'];
      const resourceUri = headers['x-goog-resource-uri'];

      if (!resourceState || !resourceId || !channelId) {
        return Result.fail(
          new CalendarSyncError('google', 'Invalid webhook payload: missing required headers')
        );
      }

      let changeType: 'created' | 'updated' | 'deleted';
      switch (resourceState) {
        case 'sync':
          // Initial sync notification - treat as update to trigger full sync
          changeType = 'updated';
          break;
        case 'exists':
          changeType = 'updated';
          break;
        case 'not_exists':
          changeType = 'deleted';
          break;
        default:
          changeType = 'updated';
      }

      return Result.ok({
        provider: 'google',
        resourceId,
        changeType,
        resourceUri,
        channelId,
        timestamp: new Date(),
      });
    } catch {
      return Result.fail(new CalendarSyncError('google', 'Failed to parse webhook payload'));
    }
  }

  // ==================== Utilities ====================

  validateTokens(tokens: OAuthTokens): boolean {
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    return tokens.expiresAt.getTime() > Date.now() + bufferMs;
  }

  generateIdempotencyKey(appointmentId: string, operation: 'create' | 'update' | 'delete'): string {
    return this.idempotencyManager.generateKey(appointmentId, operation, 'google');
  }

  mapToExternalEvent(appointment: Appointment): Partial<ExternalCalendarEvent> {
    return {
      title: appointment.title,
      description: appointment.description,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      location: appointment.location,
      attendees: appointment.attendeeIds.map((id) => ({
        email: id, // In real implementation, resolve ID to email
        responseStatus: 'needsAction' as const,
      })),
      status: appointment.isCancelled ? 'cancelled' : 'confirmed',
    };
  }

  mapToLocalAppointment(event: ExternalCalendarEvent): {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    attendeeEmails: string[];
    externalCalendarId: string;
  } {
    return {
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      attendeeEmails: event.attendees.map((a) => a.email),
      externalCalendarId: event.externalId,
    };
  }

  // ==================== Private Helpers ====================

  private appointmentToGoogleEvent(appointment: CalendarAppointmentLike): GoogleCalendarEvent {
    const event: GoogleCalendarEvent = {
      summary: appointment.title,
      description: appointment.description ?? undefined,
      location: appointment.location ?? undefined,
      start: {
        dateTime: appointment.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: appointment.endTime.toISOString(),
        timeZone: 'UTC',
      },
      status: appointment.isCancelled ? 'cancelled' : 'confirmed',
    };

    // Add attendees if present
    if (appointment.attendeeIds.length > 0) {
      event.attendees = appointment.attendeeIds.map((id) => ({
        email: id, // In real implementation, resolve ID to email
      }));
    }

    return event;
  }

  private googleEventToExternal(event: GoogleCalendarEvent): ExternalCalendarEvent {
    let startTime: Date;
    if (event.start?.dateTime) {
      startTime = new Date(event.start.dateTime);
    } else if (event.start?.date) {
      startTime = new Date(event.start.date);
    } else {
      startTime = new Date();
    }

    let endTime: Date;
    if (event.end?.dateTime) {
      endTime = new Date(event.end.dateTime);
    } else if (event.end?.date) {
      endTime = new Date(event.end.date);
    } else {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    return {
      externalId: event.id ?? '',
      provider: 'google',
      title: event.summary ?? 'Untitled Event',
      description: event.description,
      startTime,
      endTime,
      location: event.location,
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.email ?? '',
        displayName: a.displayName,
        responseStatus: a.responseStatus ?? 'needsAction',
        optional: a.optional,
      })),
      organizerEmail: event.organizer?.email ?? '',
      status: this.mapGoogleStatus(event.status),
      recurrence: event.recurrence?.join('\n'),
      iCalUID: event.iCalUID ?? '',
      htmlLink: event.htmlLink,
      etag: event.etag,
      lastModified: event.updated ? new Date(event.updated) : new Date(),
      visibility: this.mapGoogleVisibility(event.visibility),
      auroraAppointmentId: event.extendedProperties?.private?.[AURORA_APPOINTMENT_PROPERTY],
    };
  }

  private mapGoogleVisibility(visibility?: string): ExternalCalendarEvent['visibility'] {
    return visibility === 'public' || visibility === 'private' || visibility === 'confidential'
      ? visibility
      : 'default';
  }

  private mapGoogleStatus(status?: string): 'confirmed' | 'tentative' | 'cancelled' {
    switch (status) {
      case 'tentative':
        return 'tentative';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'confirmed';
    }
  }

  private handleApiError<T>(status: number, error: any): Result<T, DomainError> {
    switch (status) {
      case 401:
        return Result.fail(new CalendarAuthenticationError('google', 'Token expired or invalid'));
      case 403: {
        const reason = error.error?.errors?.[0]?.reason;
        // Google's rate and quota refusals (per user, per project, daily) all mean: slow down.
        if (RATE_LIMIT_REASONS.includes(reason)) {
          return Result.fail(new CalendarRateLimitError('google', 60));
        }
        if (reason === 'insufficientPermissions') {
          // The calendar permission was never granted or has been withdrawn: the user reconnects.
          return Result.fail(
            new CalendarAuthenticationError('google', 'Calendar permission not granted')
          );
        }
        return Result.fail(
          new CalendarSyncError('google', error.error?.message ?? 'Access denied')
        );
      }
      case 404:
        return Result.fail(
          new CalendarEventNotFoundError('google', error.error?.message ?? 'Event not found')
        );
      case 429: {
        const retryAfter = Number.parseInt(
          error.error?.details?.[0]?.metadata?.retryAfterSeconds ?? '60'
        );
        return Result.fail(new CalendarRateLimitError('google', retryAfter));
      }
      default:
        return Result.fail(
          new CalendarSyncError('google', error.error?.message ?? 'Unknown API error')
        );
    }
  }
}
