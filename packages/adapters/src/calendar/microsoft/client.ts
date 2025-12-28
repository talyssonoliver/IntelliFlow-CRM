import { createHash, randomUUID } from 'crypto';
import { Result, DomainError, Appointment } from '@intelliflow/domain';
import {
  CalendarServicePort,
  CalendarProvider,
  ExternalCalendarEvent,
  ExternalAttendee,
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
} from '@intelliflow/application';
import { RetryHandler, RateLimiter } from '../shared/RetryHandler';
import {
  IdempotencyManager,
  InMemoryIdempotencyStore,
  calculateAppointmentHash,
} from '../shared/IdempotencyManager';

/**
 * Microsoft Graph Calendar Adapter
 * Implements CalendarServicePort for Microsoft Graph API
 *
 * @see IFC-138: Microsoft Calendar integration with bidirectional sync
 * @see https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0
 */

// Microsoft Graph API Types
interface MicrosoftCalendarEvent {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  location?: {
    displayName?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      countryOrRegion?: string;
      postalCode?: string;
    };
  };
  start?: {
    dateTime: string;
    timeZone: string;
  };
  end?: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: MicrosoftAttendee[];
  organizer?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  recurrence?: {
    pattern?: {
      type: string;
      interval: number;
      daysOfWeek?: string[];
    };
    range?: {
      type: string;
      startDate: string;
      endDate?: string;
    };
  };
  iCalUId?: string;
  webLink?: string;
  changeKey?: string;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
}

interface MicrosoftAttendee {
  emailAddress: {
    name?: string;
    address: string;
  };
  type: 'required' | 'optional' | 'resource';
  status?: {
    response?: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
    time?: string;
  };
}

interface MicrosoftEventsListResponse {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
  value: MicrosoftCalendarEvent[];
}

interface MicrosoftSubscriptionResponse {
  id: string;
  resource: string;
  applicationId: string;
  changeType: string;
  clientState?: string;
  notificationUrl: string;
  expirationDateTime: string;
  creatorId?: string;
}

interface MicrosoftOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error_description?: string;
}

interface MicrosoftErrorResponse {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      code?: string;
      message?: string;
    };
  };
}

export interface MicrosoftCalendarConfig {
  oauthConfig: OAuthConfig;
  tenantId?: string; // Default: 'common' for multi-tenant
  apiBaseUrl?: string;
  calendarId?: string; // Default: primary calendar
}

/**
 * Microsoft Graph Calendar Service Adapter
 */
export class MicrosoftCalendarAdapter implements CalendarServicePort {
  readonly provider: CalendarProvider = 'microsoft';

  private readonly config: MicrosoftCalendarConfig;
  private readonly retryHandler: RetryHandler;
  private readonly rateLimiter: RateLimiter;
  private readonly idempotencyManager: IdempotencyManager;
  private readonly apiBaseUrl: string;
  private readonly tenantId: string;
  private readonly calendarPath: string;

  constructor(config: MicrosoftCalendarConfig) {
    this.config = config;
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://graph.microsoft.com/v1.0';
    this.tenantId = config.tenantId ?? 'common';
    this.calendarPath = config.calendarId
      ? `/me/calendars/${config.calendarId}/events`
      : '/me/calendar/events';

    // Initialize retry handler with Microsoft-specific config
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    });

    // Rate limiter: Microsoft Graph allows ~10000 requests/10 minutes per app
    this.rateLimiter = new RateLimiter({
      windowMs: 600000,
      maxRequests: 9000, // Leave some headroom
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
      response_mode: 'query',
      prompt: 'consent',
    });

    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<Result<OAuthTokens, DomainError>> {
    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.config.oauthConfig.clientId,
            client_secret: this.config.oauthConfig.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: this.config.oauthConfig.redirectUri,
            scope: this.config.oauthConfig.scopes.join(' '),
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as MicrosoftErrorResponse;
        return Result.fail(
          new CalendarAuthenticationError(
            'microsoft',
            error.error?.message ?? 'Token exchange failed'
          )
        );
      }

      const data = (await response.json()) as MicrosoftOAuthTokenResponse;
      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      };

      return Result.ok(tokens);
    } catch (error) {
      return Result.fail(
        new CalendarAuthenticationError(
          'microsoft',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<Result<OAuthTokens, DomainError>> {
    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.config.oauthConfig.clientId,
            client_secret: this.config.oauthConfig.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: this.config.oauthConfig.scopes.join(' '),
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as MicrosoftErrorResponse;
        return Result.fail(
          new CalendarAuthenticationError(
            'microsoft',
            error.error?.message ?? 'Token refresh failed'
          )
        );
      }

      const data = (await response.json()) as MicrosoftOAuthTokenResponse;
      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      };

      return Result.ok(tokens);
    } catch (error) {
      return Result.fail(
        new CalendarAuthenticationError(
          'microsoft',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }

  async revokeTokens(_accessToken: string): Promise<Result<void, DomainError>> {
    // Microsoft doesn't have a direct token revocation endpoint
    // Tokens are invalidated by changing password or admin revocation
    return Result.ok(undefined);
  }

  // ==================== Event CRUD Operations ====================

  async createEvent(
    tokens: OAuthTokens,
    appointment: Appointment,
    idempotencyKey: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    // Check for duplicate operation
    const duplicateCheck = await this.idempotencyManager.checkDuplicate(idempotencyKey);
    if (duplicateCheck.isDuplicate && duplicateCheck.previousResult?.result === 'success') {
      const existingEvent = await this.getEvent(
        tokens,
        duplicateCheck.previousResult.externalEventId!
      );
      if (existingEvent.isSuccess && existingEvent.value) {
        return Result.ok(existingEvent.value);
      }
    }

    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      const microsoftEvent = this.appointmentToMicrosoftEvent(appointment);

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(`${this.apiBaseUrl}${this.calendarPath}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(microsoftEvent),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const createdEvent = (await response.json()) as MicrosoftCalendarEvent;
        const externalEvent = this.microsoftEventToExternal(createdEvent);

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
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async updateEvent(
    tokens: OAuthTokens,
    externalEventId: string,
    appointment: Appointment,
    etag?: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      const microsoftEvent = this.appointmentToMicrosoftEvent(appointment);
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
          `${this.apiBaseUrl}${this.calendarPath}/${encodeURIComponent(externalEventId)}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(microsoftEvent),
          }
        );

        if (!response.ok) {
          if (response.status === 412) {
            return Result.fail(new CalendarConflictError('Event was modified by another source'));
          }
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const updatedEvent = (await response.json()) as MicrosoftCalendarEvent;
        return Result.ok(this.microsoftEventToExternal(updatedEvent));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async deleteEvent(
    tokens: OAuthTokens,
    externalEventId: string
  ): Promise<Result<void, DomainError>> {
    return this.retryHandler.executeWithRetry(async () => {
      if (!this.rateLimiter.canMakeRequest()) {
        const waitTime = this.rateLimiter.getTimeUntilAllowed();
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}${this.calendarPath}/${encodeURIComponent(externalEventId)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (!response.ok && response.status !== 404) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        return Result.ok(undefined);
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
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
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const response = await fetch(
          `${this.apiBaseUrl}${this.calendarPath}/${encodeURIComponent(externalEventId)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (response.status === 404) {
          return Result.ok(null);
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const event = (await response.json()) as MicrosoftCalendarEvent;
        return Result.ok(this.microsoftEventToExternal(event));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
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
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();
        const filter = encodeURIComponent(`iCalUId eq '${iCalUID}'`);
        const response = await fetch(
          `${this.apiBaseUrl}${this.calendarPath}?$filter=${filter}&$top=1`,
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

        const data = (await response.json()) as MicrosoftEventsListResponse;
        if (data.value.length === 0) {
          return Result.ok(null);
        }

        return Result.ok(this.microsoftEventToExternal(data.value[0]));
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  // ==================== Sync Operations ====================

  async fetchChanges(
    tokens: OAuthTokens,
    syncToken?: string,
    pageToken?: string
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
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();

        let url: string;
        if (pageToken) {
          url = pageToken;
        } else if (syncToken) {
          url = syncToken;
        } else {
          // Initial sync
          const params = new URLSearchParams({
            '$top': '50',
          });
          url = `${this.apiBaseUrl}${this.calendarPath}/delta?${params}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            Prefer: 'odata.track-changes',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const data = (await response.json()) as MicrosoftEventsListResponse;

        const events: ExternalCalendarEvent[] = [];
        const deletedEventIds: string[] = [];

        for (const item of data.value) {
          if (item.isCancelled && item.id) {
            deletedEventIds.push(item.id);
          } else {
            events.push(this.microsoftEventToExternal(item));
          }
        }

        return Result.ok({
          events,
          deletedEventIds,
          nextSyncToken: data['@odata.deltaLink'],
          nextPageToken: data['@odata.nextLink'],
        });
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
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
        return Result.fail(new CalendarRateLimitError('microsoft', Math.ceil(waitTime / 1000)));
      }

      try {
        this.rateLimiter.recordRequest();

        let url: string;
        if (pageToken) {
          url = pageToken;
        } else {
          const calendarViewPath = this.config.calendarId
            ? `/me/calendars/${this.config.calendarId}/calendarView`
            : '/me/calendar/calendarView';

          const params = new URLSearchParams({
            startDateTime: startTime.toISOString(),
            endDateTime: endTime.toISOString(),
            '$top': '50',
            '$orderby': 'start/dateTime',
          });
          url = `${this.apiBaseUrl}${calendarViewPath}?${params}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          return this.handleApiError(response.status, error);
        }

        const data = (await response.json()) as MicrosoftEventsListResponse;
        const events = data.value
          .filter((item) => !item.isCancelled)
          .map((item) => this.microsoftEventToExternal(item));

        return Result.ok({
          events,
          nextPageToken: data['@odata.nextLink'],
        });
      } catch (error) {
        return Result.fail(
          new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
        );
      }
    });
  }

  async pushToCalendar(
    tokens: OAuthTokens,
    appointment: Appointment,
    idempotencyKey: string
  ): Promise<Result<SyncResult, DomainError>> {
    if (appointment.externalCalendarId) {
      const existing = await this.getEvent(tokens, appointment.externalCalendarId);
      if (existing.isSuccess && existing.value) {
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
    expirationMinutes: number = 4230 // ~3 days max for Microsoft
  ): Promise<Result<WebhookRegistration, DomainError>> {
    try {
      const clientState = randomUUID();
      const expiration = new Date(Date.now() + expirationMinutes * 60 * 1000);

      this.rateLimiter.recordRequest();
      const response = await fetch(`${this.apiBaseUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changeType: 'created,updated,deleted',
          notificationUrl: callbackUrl,
          resource: this.calendarPath,
          expirationDateTime: expiration.toISOString(),
          clientState,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return this.handleApiError(response.status, error);
      }

      const data = (await response.json()) as MicrosoftSubscriptionResponse;

      return Result.ok({
        id: data.id,
        provider: 'microsoft',
        callbackUrl,
        expiresAt: new Date(data.expirationDateTime),
        resourceId: data.resource,
        channelId: clientState,
      });
    } catch (error) {
      return Result.fail(
        new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async renewWebhook(
    tokens: OAuthTokens,
    webhookId: string
  ): Promise<Result<WebhookRegistration, DomainError>> {
    try {
      const expiration = new Date(Date.now() + 4230 * 60 * 1000);

      this.rateLimiter.recordRequest();
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${webhookId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expirationDateTime: expiration.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return this.handleApiError(response.status, error);
      }

      const data = (await response.json()) as MicrosoftSubscriptionResponse;

      return Result.ok({
        id: data.id,
        provider: 'microsoft',
        callbackUrl: data.notificationUrl,
        expiresAt: new Date(data.expirationDateTime),
        resourceId: data.resource,
        channelId: data.clientState ?? '',
      });
    } catch (error) {
      return Result.fail(
        new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async unregisterWebhook(
    tokens: OAuthTokens,
    webhookId: string
  ): Promise<Result<void, DomainError>> {
    try {
      this.rateLimiter.recordRequest();
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${webhookId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.json().catch(() => ({}));
        return this.handleApiError(response.status, error);
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new CalendarSyncError('microsoft', error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  parseWebhookPayload(
    headers: Record<string, string>,
    body: unknown
  ): Result<WebhookPayload, DomainError> {
    try {
      const payload = body as {
        value?: Array<{
          subscriptionId?: string;
          clientState?: string;
          changeType?: 'created' | 'updated' | 'deleted';
          resource?: string;
          resourceData?: {
            id?: string;
          };
        }>;
      };

      if (!payload.value || payload.value.length === 0) {
        return Result.fail(new CalendarSyncError('microsoft', 'Empty webhook payload'));
      }

      const notification = payload.value[0];

      return Result.ok({
        provider: 'microsoft',
        resourceId: notification.resourceData?.id ?? '',
        changeType: notification.changeType ?? 'updated',
        resourceUri: notification.resource,
        channelId: notification.clientState ?? notification.subscriptionId,
        timestamp: new Date(),
      });
    } catch (error) {
      return Result.fail(new CalendarSyncError('microsoft', 'Failed to parse webhook payload'));
    }
  }

  // ==================== Utilities ====================

  validateTokens(tokens: OAuthTokens): boolean {
    const bufferMs = 5 * 60 * 1000;
    return tokens.expiresAt.getTime() > Date.now() + bufferMs;
  }

  generateIdempotencyKey(appointmentId: string, operation: 'create' | 'update' | 'delete'): string {
    return this.idempotencyManager.generateKey(appointmentId, operation, 'microsoft');
  }

  mapToExternalEvent(appointment: Appointment): Partial<ExternalCalendarEvent> {
    return {
      title: appointment.title,
      description: appointment.description,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      location: appointment.location,
      attendees: appointment.attendeeIds.map((id) => ({
        email: id,
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

  private appointmentToMicrosoftEvent(appointment: Appointment): MicrosoftCalendarEvent {
    const event: MicrosoftCalendarEvent = {
      subject: appointment.title,
      body: appointment.description
        ? {
            contentType: 'text',
            content: appointment.description,
          }
        : undefined,
      location: appointment.location
        ? {
            displayName: appointment.location,
          }
        : undefined,
      start: {
        dateTime: appointment.startTime.toISOString().slice(0, -1),
        timeZone: 'UTC',
      },
      end: {
        dateTime: appointment.endTime.toISOString().slice(0, -1),
        timeZone: 'UTC',
      },
      isCancelled: appointment.isCancelled,
    };

    if (appointment.attendeeIds.length > 0) {
      event.attendees = appointment.attendeeIds.map((id) => ({
        emailAddress: {
          address: id,
        },
        type: 'required' as const,
      }));
    }

    return event;
  }

  private microsoftEventToExternal(event: MicrosoftCalendarEvent): ExternalCalendarEvent {
    const startTime = event.start?.dateTime
      ? new Date(event.start.dateTime + (event.start.timeZone === 'UTC' ? 'Z' : ''))
      : new Date();

    const endTime = event.end?.dateTime
      ? new Date(event.end.dateTime + (event.end.timeZone === 'UTC' ? 'Z' : ''))
      : new Date(startTime.getTime() + 60 * 60 * 1000);

    return {
      externalId: event.id ?? '',
      provider: 'microsoft',
      title: event.subject ?? 'Untitled Event',
      description: event.bodyPreview ?? event.body?.content,
      startTime,
      endTime,
      location: event.location?.displayName,
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.emailAddress.address,
        displayName: a.emailAddress.name,
        responseStatus: this.mapMicrosoftResponseStatus(a.status?.response),
        optional: a.type === 'optional',
      })),
      organizerEmail: event.organizer?.emailAddress?.address ?? '',
      status: this.mapMicrosoftStatus(event),
      recurrence: event.recurrence ? JSON.stringify(event.recurrence) : undefined,
      iCalUID: event.iCalUId ?? '',
      htmlLink: event.webLink,
      etag: event.changeKey,
      lastModified: event.lastModifiedDateTime ? new Date(event.lastModifiedDateTime) : new Date(),
    };
  }

  private mapMicrosoftStatus(
    event: MicrosoftCalendarEvent
  ): 'confirmed' | 'tentative' | 'cancelled' {
    if (event.isCancelled) return 'cancelled';
    if (event.showAs === 'tentative') return 'tentative';
    return 'confirmed';
  }

  private mapMicrosoftResponseStatus(
    status?: string
  ): 'needsAction' | 'declined' | 'tentative' | 'accepted' {
    switch (status) {
      case 'accepted':
        return 'accepted';
      case 'declined':
        return 'declined';
      case 'tentativelyAccepted':
        return 'tentative';
      default:
        return 'needsAction';
    }
  }

  private handleApiError<T>(status: number, error: any): Result<T, DomainError> {
    const errorCode = error.error?.code;
    const errorMessage = error.error?.message ?? 'Unknown API error';

    switch (status) {
      case 401:
        return Result.fail(new CalendarAuthenticationError('microsoft', 'Token expired or invalid'));
      case 403:
        return Result.fail(new CalendarSyncError('microsoft', errorMessage));
      case 404:
        return Result.fail(new CalendarEventNotFoundError('microsoft', errorMessage));
      case 429:
        const retryAfter = parseInt(error.error?.innerError?.retryAfterSeconds ?? '60');
        return Result.fail(new CalendarRateLimitError('microsoft', retryAfter));
      default:
        return Result.fail(new CalendarSyncError('microsoft', errorMessage));
    }
  }
}
