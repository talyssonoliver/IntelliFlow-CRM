import { Result, DomainError, Appointment, AppointmentId } from '@intelliflow/domain';

/**
 * Calendar Service Port
 * Defines the contract for external calendar integrations (Google Calendar, Microsoft Outlook)
 * Implementation lives in adapters layer
 *
 * @see IFC-138: External calendar provider integration with bidirectional sync
 */

// Calendar Provider Types
export type CalendarProvider = 'google' | 'microsoft';

// Calendar Event from External Provider
export interface ExternalCalendarEvent {
  externalId: string;
  provider: CalendarProvider;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees: ExternalAttendee[];
  organizerEmail: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string; // RFC 5545 RRULE format
  iCalUID: string;
  htmlLink?: string;
  etag?: string; // For optimistic concurrency
  lastModified: Date;
}

export interface ExternalAttendee {
  email: string;
  displayName?: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
}

// Sync Operation Types
export interface SyncResult {
  success: boolean;
  externalEventId?: string;
  localAppointmentId?: string;
  syncToken?: string;
  error?: string;
  operation: 'create' | 'update' | 'delete' | 'skip';
  idempotencyKey: string;
}

export interface SyncBatchResult {
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: SyncError[];
  nextSyncToken?: string;
  hasMore: boolean;
}

export interface SyncError {
  externalEventId?: string;
  localAppointmentId?: string;
  error: string;
  code: string;
  retryable: boolean;
}

// OAuth2 Token Types
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Webhook Types
export interface WebhookRegistration {
  id: string;
  provider: CalendarProvider;
  callbackUrl: string;
  expiresAt: Date;
  resourceId?: string;
  channelId?: string;
}

export interface WebhookPayload {
  provider: CalendarProvider;
  resourceId: string;
  changeType: 'created' | 'updated' | 'deleted';
  resourceUri?: string;
  channelId?: string;
  timestamp: Date;
}

// Conflict Resolution
export interface ConflictResolution {
  strategy: 'local_wins' | 'remote_wins' | 'newest_wins' | 'manual';
  localVersion?: Appointment;
  remoteVersion?: ExternalCalendarEvent;
  resolvedVersion?: Appointment | ExternalCalendarEvent;
  requiresManualResolution: boolean;
}

// Domain Errors for Calendar Operations
export class CalendarAuthenticationError extends DomainError {
  readonly code = 'CALENDAR_AUTH_ERROR';
  constructor(provider: CalendarProvider, message: string) {
    super(`${provider} authentication failed: ${message}`);
  }
}

export class CalendarSyncError extends DomainError {
  readonly code = 'CALENDAR_SYNC_ERROR';
  constructor(provider: CalendarProvider, message: string) {
    super(`${provider} sync failed: ${message}`);
  }
}

export class CalendarRateLimitError extends DomainError {
  readonly code = 'CALENDAR_RATE_LIMIT';
  readonly retryAfterSeconds: number;
  constructor(provider: CalendarProvider, retryAfterSeconds: number) {
    super(`${provider} rate limit exceeded. Retry after ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class CalendarEventNotFoundError extends DomainError {
  readonly code = 'CALENDAR_EVENT_NOT_FOUND';
  constructor(provider: CalendarProvider, eventId: string) {
    super(`${provider} event not found: ${eventId}`);
  }
}

export class CalendarConflictError extends DomainError {
  readonly code = 'CALENDAR_CONFLICT';
  constructor(message: string) {
    super(`Calendar conflict: ${message}`);
  }
}

/**
 * Calendar Service Port Interface
 * Implementations must handle OAuth2 authentication, bidirectional sync, and webhooks
 */
export interface CalendarServicePort {
  /**
   * Provider identification
   */
  readonly provider: CalendarProvider;

  // ==================== OAuth2 Authentication ====================

  /**
   * Generate OAuth2 authorization URL for user consent
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for tokens
   */
  exchangeCodeForTokens(code: string): Promise<Result<OAuthTokens, DomainError>>;

  /**
   * Refresh expired access token
   */
  refreshAccessToken(refreshToken: string): Promise<Result<OAuthTokens, DomainError>>;

  /**
   * Revoke tokens and disconnect calendar
   */
  revokeTokens(accessToken: string): Promise<Result<void, DomainError>>;

  // ==================== Event CRUD Operations ====================

  /**
   * Create event in external calendar
   * Uses idempotency key to prevent duplicates
   */
  createEvent(
    tokens: OAuthTokens,
    appointment: Appointment,
    idempotencyKey: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>>;

  /**
   * Update event in external calendar
   */
  updateEvent(
    tokens: OAuthTokens,
    externalEventId: string,
    appointment: Appointment,
    etag?: string
  ): Promise<Result<ExternalCalendarEvent, DomainError>>;

  /**
   * Delete event from external calendar
   */
  deleteEvent(tokens: OAuthTokens, externalEventId: string): Promise<Result<void, DomainError>>;

  /**
   * Get single event by ID
   */
  getEvent(
    tokens: OAuthTokens,
    externalEventId: string
  ): Promise<Result<ExternalCalendarEvent | null, DomainError>>;

  /**
   * Get event by iCal UID (for cross-provider deduplication)
   */
  getEventByICalUID(
    tokens: OAuthTokens,
    iCalUID: string
  ): Promise<Result<ExternalCalendarEvent | null, DomainError>>;

  // ==================== Sync Operations ====================

  /**
   * Fetch changes since last sync using sync token
   * Returns incremental changes for efficient sync
   */
  fetchChanges(
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
  >;

  /**
   * Full sync: fetch all events in time range
   */
  fetchEventsInRange(
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
  >;

  /**
   * Push local appointment to external calendar
   */
  pushToCalendar(
    tokens: OAuthTokens,
    appointment: Appointment,
    idempotencyKey: string
  ): Promise<Result<SyncResult, DomainError>>;

  // ==================== Webhook Management ====================

  /**
   * Register webhook for push notifications
   */
  registerWebhook(
    tokens: OAuthTokens,
    callbackUrl: string,
    expirationMinutes?: number
  ): Promise<Result<WebhookRegistration, DomainError>>;

  /**
   * Renew webhook before expiration
   */
  renewWebhook(
    tokens: OAuthTokens,
    webhookId: string
  ): Promise<Result<WebhookRegistration, DomainError>>;

  /**
   * Unregister webhook
   */
  unregisterWebhook(
    tokens: OAuthTokens,
    webhookId: string,
    resourceId?: string
  ): Promise<Result<void, DomainError>>;

  /**
   * Parse and validate incoming webhook payload
   */
  parseWebhookPayload(
    headers: Record<string, string>,
    body: unknown
  ): Result<WebhookPayload, DomainError>;

  // ==================== Utilities ====================

  /**
   * Check if tokens are still valid
   */
  validateTokens(tokens: OAuthTokens): boolean;

  /**
   * Generate idempotency key for operation
   */
  generateIdempotencyKey(appointmentId: string, operation: 'create' | 'update' | 'delete'): string;

  /**
   * Map local appointment to external event format
   */
  mapToExternalEvent(appointment: Appointment): Partial<ExternalCalendarEvent>;

  /**
   * Map external event to local appointment format
   */
  mapToLocalAppointment(event: ExternalCalendarEvent): {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    attendeeEmails: string[];
    externalCalendarId: string;
  };
}

/**
 * Calendar Sync Service Port
 * Orchestrates bidirectional sync between local appointments and external calendars
 */
export interface CalendarSyncServicePort {
  /**
   * Execute full bidirectional sync for a user
   */
  executeFullSync(
    userId: string,
    provider: CalendarProvider
  ): Promise<Result<SyncBatchResult, DomainError>>;

  /**
   * Execute incremental sync using stored sync token
   */
  executeIncrementalSync(
    userId: string,
    provider: CalendarProvider
  ): Promise<Result<SyncBatchResult, DomainError>>;

  /**
   * Handle webhook notification and sync affected events
   */
  handleWebhookNotification(payload: WebhookPayload): Promise<Result<SyncResult, DomainError>>;

  /**
   * Resolve sync conflict between local and remote versions
   */
  resolveConflict(
    localAppointment: Appointment,
    remoteEvent: ExternalCalendarEvent,
    strategy: ConflictResolution['strategy']
  ): Promise<Result<ConflictResolution, DomainError>>;

  /**
   * Queue appointment for sync (async processing)
   */
  queueForSync(
    appointmentId: AppointmentId,
    operation: 'create' | 'update' | 'delete',
    provider: CalendarProvider
  ): Promise<void>;

  /**
   * Get sync status for user
   */
  getSyncStatus(
    userId: string,
    provider: CalendarProvider
  ): Promise<{
    lastSyncAt?: Date;
    syncToken?: string;
    pendingOperations: number;
    errors: SyncError[];
  }>;
}
