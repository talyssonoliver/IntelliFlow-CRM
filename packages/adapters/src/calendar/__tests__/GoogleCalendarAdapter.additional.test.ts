/**
 * GoogleCalendarAdapter - Additional Coverage Tests
 *
 * Supplements GoogleCalendarAdapter.test.ts to cover uncovered methods/branches:
 * - pushToCalendar (update existing, create new, error paths)
 * - renewWebhook (always fails for Google)
 * - handleApiError (429 with retryAfter, 404, default cases)
 * - googleEventToExternal (all-day events, missing fields, date fallbacks)
 * - appointmentToGoogleEvent (with attendees, cancelled)
 * - mapToExternalEvent (with attendees, cancelled appointment)
 * - fetchEventsInRange (error paths, cancelled filter)
 * - fetchChanges (full sync without sync token, pageToken)
 * - exchangeCodeForTokens (network error catch branch)
 * - refreshAccessToken (network error catch branch)
 * - revokeTokens (non-400 failure, network error)
 * - unregisterWebhook (API error path)
 * - registerWebhook (network error)
 * - parseWebhookPayload (unknown resourceState default)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleCalendarAdapter, GoogleCalendarConfig } from '../../calendar/google/client';
import type { OAuthTokens } from '@intelliflow/application';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const createMockAppointment = (overrides?: Record<string, unknown>) => {
  const defaults = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Meeting',
    startTime: new Date('2025-01-15T10:00:00Z'),
    endTime: new Date('2025-01-15T11:00:00Z'),
    description: 'Test description',
    location: 'Conference Room A',
    status: 'SCHEDULED',
    attendeeIds: [] as string[],
    organizerId: 'user-123',
    isCancelled: false,
    externalCalendarId: undefined as string | undefined,
  };

  const props = { ...defaults, ...overrides };

  return {
    id: { value: props.id },
    title: props.title,
    description: props.description,
    location: props.location,
    status: props.status,
    startTime: props.startTime,
    endTime: props.endTime,
    attendeeIds: props.attendeeIds,
    organizerId: props.organizerId,
    isCancelled: props.isCancelled,
    externalCalendarId: props.externalCalendarId,
    timeSlot: {
      startTime: props.startTime,
      endTime: props.endTime,
    },
  };
};

describe('GoogleCalendarAdapter - Additional Coverage', () => {
  let adapter: GoogleCalendarAdapter;
  let config: GoogleCalendarConfig;
  let mockTokens: OAuthTokens;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));

    config = {
      oauthConfig: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback',
        scopes: ['https://www.googleapis.com/auth/calendar'],
      },
      calendarId: 'primary',
      apiBaseUrl: 'https://www.googleapis.com/calendar/v3',
    };

    adapter = new GoogleCalendarAdapter(config);

    mockTokens = {
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      scope: ['https://www.googleapis.com/auth/calendar'],
      provider: 'google',
    } as OAuthTokens;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pushToCalendar', () => {
    it('should update existing event when externalCalendarId is set', async () => {
      // First mock: getEvent (returns existing event)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'existing-event-id',
          summary: 'Existing',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
          etag: '"etag-123"',
        }),
      });
      // Second mock: updateEvent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'existing-event-id',
          summary: 'Updated',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
          etag: '"etag-456"',
        }),
      });

      const appointment = createMockAppointment({
        externalCalendarId: 'existing-event-id',
      });

      const result = await adapter.pushToCalendar(mockTokens, appointment as any, 'idem-key-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.operation).toBe('update');
      expect(result.value?.externalEventId).toBe('existing-event-id');
    });

    it('should create new event when no externalCalendarId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'new-event-id',
          summary: 'New Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
        }),
      });

      const appointment = createMockAppointment();

      const result = await adapter.pushToCalendar(mockTokens, appointment as any, 'idem-key-2');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.operation).toBe('create');
    });

    it('should create new event when getEvent returns null (deleted externally)', async () => {
      // getEvent returns 404 (null)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      // createEvent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'recreated-event-id',
          summary: 'Recreated',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
        }),
      });

      const appointment = createMockAppointment({
        externalCalendarId: 'deleted-externally',
      });

      const result = await adapter.pushToCalendar(mockTokens, appointment as any, 'idem-key-3');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.operation).toBe('create');
    });

    it('should propagate update failure', async () => {
      // getEvent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'existing-id',
          summary: 'Existing',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
          etag: '"etag-abc"',
        }),
      });

      // updateEvent fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal server error' } }),
      });

      const appointment = createMockAppointment({
        externalCalendarId: 'existing-id',
      });

      const result = await adapter.pushToCalendar(mockTokens, appointment as any, 'idem-key-4');

      expect(result.isFailure).toBe(true);
    });

    it('should propagate create failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Server error' } }),
      });

      const appointment = createMockAppointment();

      const result = await adapter.pushToCalendar(mockTokens, appointment as any, 'idem-key-5');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('renewWebhook', () => {
    it('should always return failure for Google Calendar', async () => {
      const result = await adapter.renewWebhook(mockTokens, 'webhook-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      expect(result.error?.message).toContain('does not support webhook renewal');
    });
  });

  describe('handleApiError - additional status codes', () => {
    it('should handle 429 rate limit with retryAfterSeconds', async () => {
      // Mock all retry attempts (maxRetries=3 means 4 total attempts)
      const mockResponse = {
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
            details: [{ metadata: { retryAfterSeconds: '120' } }],
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Run in parallel with timer advancement
      const resultPromise = adapter.getEvent(mockTokens, 'event-123');

      // Advance timers to exhaust all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(130000);
      }

      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_RATE_LIMIT');
    });

    it('should handle 403 rate limit exceeded reason', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [{ reason: 'rateLimitExceeded' }],
            message: 'Rate limit exceeded',
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const resultPromise = adapter.getEvent(mockTokens, 'event-123');

      // Advance timers to exhaust all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(130000);
      }

      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_RATE_LIMIT');
    });

    it('should handle 404 as event not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { message: 'Event not found', code: 404 },
        }),
      });

      // deleteEvent treats 404 as success, use updateEvent to test 404 error path
      const appointment = createMockAppointment();
      // Need to test via a method that doesn't special-case 404
      // getEventByICalUID will call handleApiError for non-ok responses
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { message: 'Not found' },
        }),
      });

      const result = await adapter.getEventByICalUID(mockTokens, 'nonexistent-uid');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_EVENT_NOT_FOUND');
    });

    it('should handle unknown status code as generic sync error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          error: { message: 'Bad gateway' },
        }),
      });

      const result = await adapter.getEventByICalUID(mockTokens, 'some-uid');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
    });
  });

  describe('googleEventToExternal - edge cases', () => {
    it('should handle all-day events (date instead of dateTime)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'allday-event',
          summary: 'All Day Event',
          start: { date: '2025-01-15' },
          end: { date: '2025-01-16' },
          status: 'confirmed',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'allday-event');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.externalId).toBe('allday-event');
      expect(result.value?.title).toBe('All Day Event');
    });

    it('should handle event with no start/end dates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'no-dates-event',
          summary: 'No Dates Event',
          status: 'confirmed',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'no-dates-event');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.startTime).toBeDefined();
      expect(result.value?.endTime).toBeDefined();
    });

    it('should handle event with tentative status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'tentative-event',
          summary: 'Tentative Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'tentative',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'tentative-event');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('tentative');
    });

    it('should handle event with cancelled status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cancelled-event',
          summary: 'Cancelled Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'cancelled',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'cancelled-event');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('cancelled');
    });

    it('should handle event with attendees', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'attendee-event',
          summary: 'Meeting with Attendees',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
          attendees: [
            {
              email: 'user1@example.com',
              displayName: 'User One',
              responseStatus: 'accepted',
              optional: false,
            },
            {
              email: 'user2@example.com',
              responseStatus: 'tentative',
              optional: true,
            },
          ],
          organizer: { email: 'organizer@example.com', displayName: 'Organizer' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'],
          iCalUID: 'icaluid-123@google.com',
          htmlLink: 'https://calendar.google.com/event/123',
          etag: '"etag-xyz"',
          updated: '2025-01-15T09:00:00Z',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'attendee-event');

      expect(result.isSuccess).toBe(true);
      const event = result.value!;
      expect(event.attendees).toHaveLength(2);
      expect(event.attendees[0].email).toBe('user1@example.com');
      expect(event.attendees[0].displayName).toBe('User One');
      expect(event.attendees[0].responseStatus).toBe('accepted');
      expect(event.attendees[1].optional).toBe(true);
      expect(event.organizerEmail).toBe('organizer@example.com');
      expect(event.recurrence).toBe('RRULE:FREQ=WEEKLY;COUNT=10');
      expect(event.iCalUID).toBe('icaluid-123@google.com');
      expect(event.htmlLink).toBe('https://calendar.google.com/event/123');
      expect(event.etag).toBe('"etag-xyz"');
    });

    it('should handle event with missing optional fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'minimal-event',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          // No summary, description, location, attendees, organizer, etc.
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'minimal-event');

      expect(result.isSuccess).toBe(true);
      const event = result.value!;
      expect(event.title).toBe('Untitled Event');
      expect(event.attendees).toEqual([]);
      expect(event.organizerEmail).toBe('');
      expect(event.iCalUID).toBe('');
    });
  });

  describe('appointmentToGoogleEvent - with attendees', () => {
    it('should include attendees when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'new-event-with-attendees',
          summary: 'Team Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
        }),
      });

      const appointment = createMockAppointment({
        attendeeIds: ['user1@example.com', 'user2@example.com'],
      });

      const result = await adapter.createEvent(mockTokens, appointment as any, 'idem-attend-1');

      expect(result.isSuccess).toBe(true);
      // Verify the body included attendees
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.attendees).toHaveLength(2);
      expect(body.attendees[0].email).toBe('user1@example.com');
    });

    it('should map cancelled appointment status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cancelled-appointment',
          summary: 'Cancelled Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'cancelled',
        }),
      });

      const appointment = createMockAppointment({
        isCancelled: true,
      });

      const result = await adapter.createEvent(mockTokens, appointment as any, 'idem-cancel-1');

      expect(result.isSuccess).toBe(true);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.status).toBe('cancelled');
    });
  });

  describe('mapToExternalEvent - with attendees and cancelled', () => {
    it('should map appointment with attendees', () => {
      const appointment = createMockAppointment({
        attendeeIds: ['att1@example.com', 'att2@example.com'],
      });

      const externalEvent = adapter.mapToExternalEvent(appointment as any);

      expect(externalEvent.attendees).toHaveLength(2);
      expect(externalEvent.attendees![0].email).toBe('att1@example.com');
      expect(externalEvent.attendees![0].responseStatus).toBe('needsAction');
    });

    it('should map cancelled appointment', () => {
      const appointment = createMockAppointment({
        isCancelled: true,
      });

      const externalEvent = adapter.mapToExternalEvent(appointment as any);

      expect(externalEvent.status).toBe('cancelled');
    });

    it('should map non-cancelled appointment as confirmed', () => {
      const appointment = createMockAppointment({
        isCancelled: false,
      });

      const externalEvent = adapter.mapToExternalEvent(appointment as any);

      expect(externalEvent.status).toBe('confirmed');
    });
  });

  describe('mapToLocalAppointment - with attendees', () => {
    it('should extract attendee emails', () => {
      const externalEvent = {
        externalId: 'ext-123',
        provider: 'google' as const,
        title: 'Meeting',
        description: 'Desc',
        startTime: new Date('2025-01-15T14:00:00Z'),
        endTime: new Date('2025-01-15T15:00:00Z'),
        location: 'Room B',
        status: 'confirmed' as const,
        attendees: [
          { email: 'a@example.com', responseStatus: 'accepted' as const },
          { email: 'b@example.com', responseStatus: 'tentative' as const },
        ],
        etag: '"tag"',
      };

      const localData = adapter.mapToLocalAppointment(externalEvent);

      expect(localData.attendeeEmails).toEqual(['a@example.com', 'b@example.com']);
      expect(localData.location).toBe('Room B');
      expect(localData.externalCalendarId).toBe('ext-123');
    });
  });

  describe('exchangeCodeForTokens - network error', () => {
    it('should handle non-Error thrown from fetch', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await adapter.exchangeCodeForTokens('code-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_AUTH_ERROR');
    });

    it('should handle Error thrown from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await adapter.exchangeCodeForTokens('code-456');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Connection refused');
    });

    it('should handle missing refresh_token in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-tok',
          expires_in: 3600,
          scope: 'calendar.read',
          token_type: 'Bearer',
          // No refresh_token field
        }),
      });

      const result = await adapter.exchangeCodeForTokens('code-789');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.refreshToken).toBe('');
    });

    it('should handle token exchange with no error_description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          // No error_description
        }),
      });

      const result = await adapter.exchangeCodeForTokens('bad-code');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Token exchange failed');
    });
  });

  describe('refreshAccessToken - network error', () => {
    it('should handle non-Error thrown from fetch', async () => {
      mockFetch.mockRejectedValueOnce(42);

      const result = await adapter.refreshAccessToken('refresh-token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_AUTH_ERROR');
      expect(result.error?.message).toContain('Unknown error');
    });

    it('should handle missing error_description in refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_token' }),
      });

      const result = await adapter.refreshAccessToken('bad-refresh-token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Token refresh failed');
    });
  });

  describe('revokeTokens - additional paths', () => {
    it('should handle non-400 failure status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Token revocation failed');
    });

    it('should handle network error on revoke', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Network down');
    });

    it('should handle non-Error thrown on revoke', async () => {
      mockFetch.mockRejectedValueOnce(null);

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('fetchEventsInRange - additional paths', () => {
    it('should filter out cancelled events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'active-1',
              summary: 'Active',
              start: { dateTime: '2025-01-15T10:00:00Z' },
              end: { dateTime: '2025-01-15T11:00:00Z' },
              status: 'confirmed',
            },
            {
              id: 'cancelled-1',
              summary: 'Cancelled',
              start: { dateTime: '2025-01-15T12:00:00Z' },
              end: { dateTime: '2025-01-15T13:00:00Z' },
              status: 'cancelled',
            },
          ],
        }),
      });

      const result = await adapter.fetchEventsInRange(
        mockTokens,
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T23:59:59Z')
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value?.events).toHaveLength(1);
      expect(result.value?.events[0].externalId).toBe('active-1');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await adapter.fetchEventsInRange(
        mockTokens,
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T23:59:59Z')
      );

      expect(result.isFailure).toBe(true);
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Unauthorized' },
        }),
      });

      const result = await adapter.fetchEventsInRange(
        mockTokens,
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T23:59:59Z')
      );

      expect(result.isFailure).toBe(true);
    });

    it('should pass pageToken when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
        }),
      });

      await adapter.fetchEventsInRange(
        mockTokens,
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T23:59:59Z'),
        'page-token-xyz'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageToken=page-token-xyz'),
        expect.any(Object)
      );
    });
  });

  describe('fetchChanges - additional paths', () => {
    it('should perform full sync when no syncToken provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          nextSyncToken: 'initial-sync-token',
        }),
      });

      const result = await adapter.fetchChanges(mockTokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.nextSyncToken).toBe('initial-sync-token');
      // Should include timeMin for full sync
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('timeMin='),
        expect.any(Object)
      );
    });

    it('should pass pageToken when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          nextSyncToken: 'token-abc',
        }),
      });

      await adapter.fetchChanges(mockTokens, 'sync-token', 'page-token-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageToken=page-token-123'),
        expect.any(Object)
      );
    });

    it('should handle network error during fetch changes', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      const result = await adapter.fetchChanges(mockTokens, 'sync-tok');

      expect(result.isFailure).toBe(true);
    });

    it('should handle API error during fetch changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Forbidden' },
        }),
      });

      const result = await adapter.fetchChanges(mockTokens, 'sync-tok');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getEvent - 410 Gone returns null', () => {
    it('should return null for 410 Gone status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 410,
        json: async () => ({}),
      });

      const result = await adapter.getEvent(mockTokens, 'gone-event');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should handle network error on getEvent', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('deleteEvent - additional paths', () => {
    it('should handle API error on delete (non-404/410)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Unauthorized' },
        }),
      });

      const result = await adapter.deleteEvent(mockTokens, 'event-xyz');

      expect(result.isFailure).toBe(true);
    });

    it('should handle network error on delete', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      const result = await adapter.deleteEvent(mockTokens, 'event-xyz');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateEvent - additional paths', () => {
    it('should handle network error on update', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const appointment = createMockAppointment();
      const result = await adapter.updateEvent(mockTokens, 'event-123', appointment as any);

      expect(result.isFailure).toBe(true);
    });

    it('should handle non-Error thrown on update', async () => {
      mockFetch.mockRejectedValueOnce('string thrown');

      const appointment = createMockAppointment();
      const result = await adapter.updateEvent(mockTokens, 'event-123', appointment as any);

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });

    it('should handle json parse error in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const appointment = createMockAppointment();
      const result = await adapter.updateEvent(mockTokens, 'event-123', appointment as any);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('registerWebhook - network error', () => {
    it('should handle network error during webhook registration', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Cannot reach Google'));

      const result = await adapter.registerWebhook(mockTokens, 'https://example.com/webhook');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Cannot reach Google');
    });

    it('should handle non-Error thrown during webhook registration', async () => {
      mockFetch.mockRejectedValueOnce(undefined);

      const result = await adapter.registerWebhook(mockTokens, 'https://example.com/webhook');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });

    it('should use default expiration when no expiration in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'api#channel',
          id: 'channel-id',
          resourceId: 'resource-id',
          resourceUri: 'https://example.com/resource',
          // No expiration field
        }),
      });

      const result = await adapter.registerWebhook(
        mockTokens,
        'https://example.com/webhook',
        1440 // 1 day
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value?.expiresAt).toBeDefined();
    });
  });

  describe('unregisterWebhook - API error', () => {
    it('should handle API error on unregister', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { message: 'Internal error' },
        }),
      });

      const result = await adapter.unregisterWebhook(mockTokens, 'channel-123', 'resource-123');

      expect(result.isFailure).toBe(true);
    });

    it('should handle network error on unregister', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.unregisterWebhook(mockTokens, 'channel-123', 'resource-123');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('parseWebhookPayload - unknown resource state', () => {
    it('should default to updated for unknown resource state', () => {
      const headers = {
        'x-goog-channel-id': 'ch-1',
        'x-goog-resource-id': 'res-1',
        'x-goog-resource-state': 'something_unknown',
      };

      const result = adapter.parseWebhookPayload(headers, {});

      expect(result.isSuccess).toBe(true);
      expect(result.value?.changeType).toBe('updated');
    });
  });

  describe('getEventByICalUID - network error', () => {
    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await adapter.getEventByICalUID(mockTokens, 'some-uid');

      expect(result.isFailure).toBe(true);
    });
  });
});
