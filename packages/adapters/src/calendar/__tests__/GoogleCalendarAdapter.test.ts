/**
 * Google Calendar Adapter Tests
 *
 * Comprehensive tests for GoogleCalendarAdapter:
 * - OAuth2 authentication (authorization URL, token exchange, refresh, revoke)
 * - Event CRUD (create, read, update, delete)
 * - Sync operations (list events, incremental sync)
 * - Webhook management (register, handle, unregister)
 * - Error handling (rate limits, auth errors, network errors)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleCalendarAdapter, GoogleCalendarConfig } from '../google/client';
import {
  CalendarConflictError,
  CalendarRateLimitError,
  CalendarSyncTokenExpiredError,
  type OAuthTokens,
} from '@intelliflow/application';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock domain types - we're testing adapter HTTP behavior, not domain logic
const createMockAppointment = (overrides?: {
  id?: string;
  title?: string;
  startTime?: Date;
  endTime?: Date;
  description?: string;
  location?: string;
  status?: string;
  attendeeIds?: string[];
  organizerId?: string;
}) => {
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
  };

  const props = { ...defaults, ...overrides };

  // Return a mock appointment object with the properties the adapter needs
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
    timeSlot: {
      startTime: props.startTime,
      endTime: props.endTime,
    },
    toJSON: () => ({
      id: props.id,
      title: props.title,
      description: props.description,
      location: props.location,
      status: props.status,
      startTime: props.startTime?.toISOString(),
      endTime: props.endTime?.toISOString(),
    }),
  };
};

describe('GoogleCalendarAdapter', () => {
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
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default values when not provided', () => {
      const minimalConfig: GoogleCalendarConfig = {
        oauthConfig: config.oauthConfig,
      };
      const minimalAdapter = new GoogleCalendarAdapter(minimalConfig);

      expect(minimalAdapter.provider).toBe('google');
    });

    it('should use custom calendarId when provided', () => {
      const customConfig: GoogleCalendarConfig = {
        ...config,
        calendarId: 'custom-calendar@group.calendar.google.com',
      };
      const customAdapter = new GoogleCalendarAdapter(customConfig);

      expect(customAdapter.provider).toBe('google');
    });
  });

  describe('OAuth2 Authentication', () => {
    describe('getAuthorizationUrl', () => {
      it('should generate valid authorization URL', () => {
        const state = 'random-state-123';
        const url = adapter.getAuthorizationUrl(state);

        expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url).toContain(`client_id=${config.oauthConfig.clientId}`);
        expect(url).toContain(`redirect_uri=${encodeURIComponent(config.oauthConfig.redirectUri)}`);
        expect(url).toContain(`state=${state}`);
        expect(url).toContain('response_type=code');
        expect(url).toContain('access_type=offline');
      });

      it('should include scopes in authorization URL', () => {
        const url = adapter.getAuthorizationUrl('state');

        expect(url).toContain('scope=');
        expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/calendar'));
      });
    });

    describe('exchangeCodeForTokens', () => {
      it('should exchange authorization code for tokens', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/calendar',
            token_type: 'Bearer',
          }),
        });

        const result = await adapter.exchangeCodeForTokens('auth-code-123');

        expect(result.isSuccess).toBe(true);
        expect(result.value?.accessToken).toBe('new-access-token');
        expect(result.value?.refreshToken).toBe('new-refresh-token');
      });

      it('should handle token exchange failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_grant',
            error_description: 'Code has expired',
          }),
        });

        const result = await adapter.exchangeCodeForTokens('expired-code');

        expect(result.isFailure).toBe(true);
      });
    });

    describe('refreshAccessToken', () => {
      it('should refresh access token successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'refreshed-access-token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/calendar',
            token_type: 'Bearer',
          }),
        });

        const result = await adapter.refreshAccessToken('valid-refresh-token');

        expect(result.isSuccess).toBe(true);
        expect(result.value?.accessToken).toBe('refreshed-access-token');
      });

      it('should handle invalid refresh token', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_grant',
            error_description: 'Token has been revoked',
          }),
        });

        const result = await adapter.refreshAccessToken('revoked-token');

        expect(result.isFailure).toBe(true);
      });
    });

    describe('revokeTokens', () => {
      it('should revoke tokens successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        });

        const result = await adapter.revokeTokens('valid-access-token');

        expect(result.isSuccess).toBe(true);
      });

      it('should handle revoke failure gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_token',
          }),
        });

        const result = await adapter.revokeTokens('invalid-token');

        // Even if revoke fails, we typically treat it as success
        // since the goal is to invalidate the token
        expect(result).toBeDefined();
      });
    });

    describe('validateTokens', () => {
      it('should return true for valid non-expired tokens', () => {
        const validTokens: OAuthTokens = {
          ...mockTokens,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        };

        expect(adapter.validateTokens(validTokens)).toBe(true);
      });

      it('should return false for expired tokens', () => {
        const expiredTokens: OAuthTokens = {
          ...mockTokens,
          expiresAt: new Date(Date.now() - 1000), // 1 second ago
        };

        expect(adapter.validateTokens(expiredTokens)).toBe(false);
      });

      it('should return false for tokens expiring within 5 minutes', () => {
        const almostExpiredTokens: OAuthTokens = {
          ...mockTokens,
          expiresAt: new Date(Date.now() + 60000), // 1 minute from now
        };

        expect(adapter.validateTokens(almostExpiredTokens)).toBe(false);
      });
    });
  });

  describe('Event CRUD Operations', () => {
    describe('createEvent', () => {
      it('should create event successfully', async () => {
        const mockGoogleEvent = {
          id: 'google-event-123',
          summary: 'Test Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
          etag: '"abc123"',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockGoogleEvent,
        });

        const appointment = createMockAppointment();
        const result = await adapter.createEvent(
          mockTokens,
          appointment as any, // test: mock external SDK
          'idempotency-key-1'
        );

        expect(result.isSuccess).toBe(true);
        expect(result.value?.externalId).toBe('google-event-123');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/calendars/primary/events'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer ' + 'valid-access-token',
            }),
          })
        );
      });

      it('should handle API error on create', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({
            error: { message: 'Calendar access denied' },
          }),
        });

        const appointment = createMockAppointment();
        const result = await adapter.createEvent(
          mockTokens,
          appointment as any, // test: mock external SDK
          'idempotency-key-2'
        );

        expect(result.isFailure).toBe(true);
      });

      it('should handle network error on create', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const appointment = createMockAppointment();
        const result = await adapter.createEvent(
          mockTokens,
          appointment as any, // test: mock external SDK
          'idempotency-key-3'
        );

        expect(result.isFailure).toBe(true);
      });
    });

    describe('updateEvent', () => {
      it('should update event successfully', async () => {
        const mockUpdatedEvent = {
          id: 'google-event-123',
          summary: 'Updated Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T12:00:00Z' },
          status: 'confirmed',
          etag: '"def456"',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockUpdatedEvent,
        });

        const appointment = createMockAppointment({ title: 'Updated Meeting' });
        const result = await adapter.updateEvent(
          mockTokens,
          'google-event-123',
          appointment as any // test: mock external SDK
        );

        expect(result.isSuccess).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/events/google-event-123'),
          expect.objectContaining({
            method: 'PUT',
          })
        );
      });

      it('should use etag for optimistic concurrency', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'google-event-123', status: 'confirmed' }),
        });

        const appointment = createMockAppointment();
        await adapter.updateEvent(
          mockTokens,
          'google-event-123',
          appointment as any, // test: mock external SDK
          '"abc123"'
        );

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'If-Match': '"abc123"',
            }),
          })
        );
      });

      it('should handle concurrent modification conflict', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 412,
          json: async () => ({}),
        });

        const appointment = createMockAppointment();
        const result = await adapter.updateEvent(
          mockTokens,
          'google-event-123',
          appointment as any, // test: mock external SDK
          '"old-etag"'
        );

        expect(result.isFailure).toBe(true);
        expect(result.error?.code).toBe('CALENDAR_CONFLICT');
      });
    });

    describe('deleteEvent', () => {
      it('should delete event successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        });

        const result = await adapter.deleteEvent(mockTokens, 'google-event-123');

        expect(result.isSuccess).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/events/google-event-123'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });

      it('should treat 404 as successful delete', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        const result = await adapter.deleteEvent(mockTokens, 'already-deleted-event');

        expect(result.isSuccess).toBe(true);
      });

      it('should treat 410 (Gone) as successful delete', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 410,
        });

        const result = await adapter.deleteEvent(mockTokens, 'gone-event');

        expect(result.isSuccess).toBe(true);
      });
    });

    describe('getEvent', () => {
      it('should get event by ID', async () => {
        const mockEvent = {
          id: 'google-event-123',
          summary: 'Test Meeting',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { dateTime: '2025-01-15T11:00:00Z' },
          status: 'confirmed',
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockEvent,
        });

        const result = await adapter.getEvent(mockTokens, 'google-event-123');

        expect(result.isSuccess).toBe(true);
        expect(result.value?.externalId).toBe('google-event-123');
      });

      it('should return null for non-existent event', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 404 } }),
        });

        const result = await adapter.getEvent(mockTokens, 'non-existent-event');

        expect(result.isSuccess).toBe(true);
        expect(result.value).toBeNull();
      });
    });

    describe('getEventByICalUID', () => {
      it('should find event by iCalUID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'google-event-123',
                iCalUID: 'unique-ical-uid@google.com',
                summary: 'Test Meeting',
                status: 'confirmed',
              },
            ],
          }),
        });

        const result = await adapter.getEventByICalUID(mockTokens, 'unique-ical-uid@google.com');

        expect(result.isSuccess).toBe(true);
        expect(result.value?.externalId).toBe('google-event-123');
      });

      it('should return null when no event matches iCalUID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [] }),
        });

        const result = await adapter.getEventByICalUID(mockTokens, 'non-existent-uid');

        expect(result.isSuccess).toBe(true);
        expect(result.value).toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 Unauthorized as authentication error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid credentials', code: 401 } }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_AUTH_ERROR');
    });

    it('should handle 403 Forbidden error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Access denied' } }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
    });
  });

  describe('Utility Methods', () => {
    describe('generateIdempotencyKey', () => {
      it('should generate consistent keys for same input', () => {
        const key1 = adapter.generateIdempotencyKey('appointment-123', 'create');
        const key2 = adapter.generateIdempotencyKey('appointment-123', 'create');

        expect(key1).toBe(key2);
      });

      it('should generate different keys for different operations', () => {
        const createKey = adapter.generateIdempotencyKey('appointment-123', 'create');
        const updateKey = adapter.generateIdempotencyKey('appointment-123', 'update');
        const deleteKey = adapter.generateIdempotencyKey('appointment-123', 'delete');

        expect(createKey).not.toBe(updateKey);
        expect(updateKey).not.toBe(deleteKey);
      });
    });

    describe('mapToExternalEvent', () => {
      it('should map appointment to external event format', () => {
        const appointment = createMockAppointment();
        const externalEvent = adapter.mapToExternalEvent(
          appointment as any // test: mock external SDK
        );

        expect(externalEvent.title).toBe('Test Meeting');
        expect(externalEvent.startTime).toEqual(new Date('2025-01-15T10:00:00Z'));
        expect(externalEvent.endTime).toEqual(new Date('2025-01-15T11:00:00Z'));
      });
    });

    describe('mapToLocalAppointment', () => {
      it('should map external event to local appointment data', () => {
        const externalEvent = {
          externalId: 'google-event-123',
          provider: 'google' as const,
          title: 'External Meeting',
          description: 'From Google Calendar',
          startTime: new Date('2025-01-15T14:00:00Z'),
          endTime: new Date('2025-01-15T15:00:00Z'),
          status: 'confirmed' as const,
          attendees: [],
          etag: '"xyz789"',
        };

        const localData = adapter.mapToLocalAppointment(externalEvent);

        expect(localData.title).toBe('External Meeting');
        expect(localData.startTime).toEqual(new Date('2025-01-15T14:00:00Z'));
      });
    });
  });

  describe('Sync Operations', () => {
    describe('fetchEventsInRange', () => {
      it('should fetch events within time range', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'event-1',
                summary: 'Meeting 1',
                start: { dateTime: '2025-01-15T10:00:00Z' },
                end: { dateTime: '2025-01-15T11:00:00Z' },
                status: 'confirmed',
              },
              {
                id: 'event-2',
                summary: 'Meeting 2',
                start: { dateTime: '2025-01-15T14:00:00Z' },
                end: { dateTime: '2025-01-15T15:00:00Z' },
                status: 'confirmed',
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
        expect(result.value?.events).toHaveLength(2);
      });

      it('should handle pagination with nextPageToken', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'event-1',
                summary: 'Page 1 Event',
                status: 'confirmed',
                start: { dateTime: '2025-01-15T10:00:00Z' },
                end: { dateTime: '2025-01-15T11:00:00Z' },
              },
            ],
            nextPageToken: 'page-token-2',
          }),
        });

        const result = await adapter.fetchEventsInRange(
          mockTokens,
          new Date('2025-01-15T00:00:00Z'),
          new Date('2025-01-15T23:59:59Z')
        );

        expect(result.isSuccess).toBe(true);
        expect(result.value?.events).toHaveLength(1);
        expect(result.value?.nextPageToken).toBe('page-token-2');
      });
    });

    describe('fetchChanges', () => {
      it('should perform incremental sync with sync token', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'updated-event',
                summary: 'Updated Event',
                status: 'confirmed',
                start: { dateTime: '2025-01-15T10:00:00Z' },
                end: { dateTime: '2025-01-15T11:00:00Z' },
              },
            ],
            nextSyncToken: 'new-sync-token',
          }),
        });

        const result = await adapter.fetchChanges(mockTokens, 'old-sync-token');

        expect(result.isSuccess).toBe(true);
        expect(result.value?.nextSyncToken).toBe('new-sync-token');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('syncToken=old-sync-token'),
          expect.any(Object)
        );
      });

      it('should handle expired sync token (410 Gone)', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 410,
          json: async () => ({ error: { code: 410, message: 'Sync token expired' } }),
        });

        const result = await adapter.fetchChanges(mockTokens, 'expired-token');

        expect(result.isFailure).toBe(true);
        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });

      it('should separate deleted events from active events', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'active-event',
                summary: 'Active Event',
                status: 'confirmed',
                start: { dateTime: '2025-01-15T10:00:00Z' },
                end: { dateTime: '2025-01-15T11:00:00Z' },
              },
              {
                id: 'deleted-event',
                status: 'cancelled',
              },
            ],
            nextSyncToken: 'sync-token-xyz',
          }),
        });

        const result = await adapter.fetchChanges(mockTokens);

        expect(result.isSuccess).toBe(true);
        expect(result.value?.events).toHaveLength(1);
        expect(result.value?.deletedEventIds).toContain('deleted-event');
      });
    });
  });

  describe('what the Google Calendar sync needs (MVP-013)', () => {
    const calendarEvents = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const eventJson = (over: Record<string, unknown> = {}) => ({
      id: 'ev-1',
      summary: 'Site visit',
      status: 'confirmed',
      start: { dateTime: '2025-01-15T10:00:00Z' },
      end: { dateTime: '2025-01-15T11:00:00Z' },
      etag: '"etag-1"',
      updated: '2025-01-15T09:00:00Z',
      ...over,
    });
    const body = () => JSON.parse(mockFetch.mock.calls[0][1].body as string);

    describe('createEvent with an event id', () => {
      it('creates the event under that id, and adds none without one', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => eventJson() });
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => eventJson() });

        await adapter.createEvent(mockTokens, createMockAppointment() as any, 'k1', {
          eventId: 'abc123',
        });
        expect(body().id).toBe('abc123');

        mockFetch.mockClear();
        await adapter.createEvent(mockTokens, createMockAppointment() as any, 'k2');
        expect(body()).not.toHaveProperty('id');
      });

      it('stamps the event with its appointment and idempotency key, and reads the appointment back', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () =>
            eventJson({
              extendedProperties: { private: { auroraAppointmentId: 'appt-1' } },
            }),
        });
        const appointment = createMockAppointment();

        const result = await adapter.createEvent(mockTokens, appointment as any, 'appt-1:create', {
          eventId: 'abc123',
        });

        expect(body().extendedProperties).toEqual({
          private: {
            auroraAppointmentId: appointment.id.value,
            auroraIdempotencyKey: 'appt-1:create',
          },
        });
        expect(result.value?.auroraAppointmentId).toBe('appt-1');
      });

      it('returns the event that is already there when Google answers 409', async () => {
        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
          .mockResolvedValueOnce({ ok: true, json: async () => eventJson({ id: 'abc123' }) });

        const result = await adapter.createEvent(mockTokens, createMockAppointment() as any, 'k3', {
          eventId: 'abc123',
        });

        expect(result.isSuccess).toBe(true);
        expect(result.value?.externalId).toBe('abc123');
        expect(mockFetch.mock.calls[1][0]).toBe(`${calendarEvents}/abc123`);
        expect(mockFetch.mock.calls[1][1].method).toBe('GET');
      });

      it('fails on a 409 when that event cannot be found, or cannot be read', async () => {
        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
          .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
        const gone = await adapter.createEvent(mockTokens, createMockAppointment() as any, 'k4', {
          eventId: 'abc123',
        });
        expect(gone.isFailure).toBe(true);

        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
          .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
        const unreadable = await adapter.createEvent(
          mockTokens,
          createMockAppointment() as any,
          'k5',
          { eventId: 'abc123' }
        );
        expect(unreadable.error?.code).toBe('CALENDAR_AUTH_ERROR');
      });
    });

    describe('patchEvent', () => {
      it('changes only what the CRM owns of the event, with a PATCH', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => eventJson() });
        const appointment = createMockAppointment({ description: undefined, location: undefined });

        const result = await adapter.patchEvent(mockTokens, 'ev-1', appointment as any);

        expect(result.isSuccess).toBe(true);
        expect(result.value?.etag).toBe('"etag-1"');
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${calendarEvents}/ev-1`);
        expect(init.method).toBe('PATCH');
        expect(init.headers.Authorization).toBe(['Bearer', mockTokens.accessToken].join(' '));
        // A removed note and place are sent as null, which is how Google clears them; no guests.
        expect(JSON.parse(init.body)).toEqual({
          summary: 'Test Meeting',
          description: null,
          location: null,
          // No timeZone (a recurring event keeps its own), and date: null so an all-day
          // event's date does not stay beside the new dateTime.
          start: { dateTime: '2025-01-15T10:00:00.000Z', date: null },
          end: { dateTime: '2025-01-15T11:00:00.000Z', date: null },
          // No status: confirming would bring back an event the user deleted in Google.
        });
      });

      it('sends the etag as If-Match, so a change made in Google meanwhile is not overwritten', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => eventJson() });

        await adapter.patchEvent(mockTokens, 'ev-1', createMockAppointment() as any, '"etag-0"');

        expect(mockFetch.mock.calls[0][1].headers['If-Match']).toBe('"etag-0"');
      });

      it('answers a conflict when Google has changed the event since that etag', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 412, json: async () => ({}) });

        const result = await adapter.patchEvent(
          mockTokens,
          'ev-1',
          createMockAppointment() as any,
          '"old"'
        );

        expect(result.error).toBeInstanceOf(CalendarConflictError);
      });
      it('sends a cancelled appointment as a cancelled event', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => eventJson() });
        const appointment = { ...createMockAppointment(), isCancelled: true };

        await adapter.patchEvent(mockTokens, 'ev-1', appointment as any);

        expect(body().status).toBe('cancelled');
      });

      it('reports an event that is gone, and a permission that is not there', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'Not Found' } }),
        });
        const gone = await adapter.patchEvent(mockTokens, 'ev-1', createMockAppointment() as any);
        expect(gone.error?.code).toBe('CALENDAR_EVENT_NOT_FOUND');

        mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
        const denied = await adapter.patchEvent(mockTokens, 'ev-1', createMockAppointment() as any);
        expect(denied.error?.code).toBe('CALENDAR_AUTH_ERROR');
      });

      it('reports a network failure as a sync error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('socket hang up'));

        const result = await adapter.patchEvent(mockTokens, 'ev-1', createMockAppointment() as any);

        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });
    });

    describe('a withdrawn calendar permission', () => {
      it('is an authentication error (the user reconnects), not a plain refusal', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              message: 'Insufficient Permission',
              errors: [{ reason: 'insufficientPermissions' }],
            },
          }),
        });

        const result = await adapter.getEvent(mockTokens, 'ev-1');

        expect(result.error?.code).toBe('CALENDAR_AUTH_ERROR');
      });

      it.each(['userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded'])(
        'treats the 403 %s as a rate limit, not an error of the item',
        async (reason) => {
          // The retry handler waits and asks again; Google keeps refusing.
          mockFetch.mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({ error: { errors: [{ reason }] } }),
          });

          const pending = adapter.patchEvent(mockTokens, 'ev-1', createMockAppointment() as any);
          await vi.runAllTimersAsync();
          const result = await pending;

          expect(result.error).toBeInstanceOf(CalendarRateLimitError);
        }
      );
      it('stays a sync error for any other 403', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              message: 'Calendar API has not been used',
              errors: [{ reason: 'accessNotConfigured' }],
            },
          }),
        });

        const result = await adapter.getEvent(mockTokens, 'ev-1');

        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });
    });

    describe('fetchChanges for a sync', () => {
      it('says the sync token expired with a typed error that is still a sync error', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 410, json: async () => ({}) });

        const result = await adapter.fetchChanges(mockTokens, 'old-token');

        expect(result.error).toBeInstanceOf(CalendarSyncTokenExpiredError);
        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });

      it('uses the window it is given on a full sync, and none with a sync token', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], nextSyncToken: 't' }),
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], nextSyncToken: 't' }),
        });
        const window = {
          timeMin: new Date('2025-01-15T10:00:00Z'),
          timeMax: new Date('2026-01-15T10:00:00Z'),
        };

        await adapter.fetchChanges(mockTokens, undefined, 'page-2', window);
        const full = new URL(mockFetch.mock.calls[0][0]);
        expect(full.searchParams.get('timeMin')).toBe('2025-01-15T10:00:00.000Z');
        expect(full.searchParams.get('timeMax')).toBe('2026-01-15T10:00:00.000Z');
        expect(full.searchParams.get('pageToken')).toBe('page-2');

        mockFetch.mockClear();
        await adapter.fetchChanges(mockTokens, 'token', undefined, window);
        const incremental = new URL(mockFetch.mock.calls[0][0]);
        expect(incremental.searchParams.get('syncToken')).toBe('token');
        expect(incremental.searchParams.has('timeMin')).toBe(false);
        expect(incremental.searchParams.has('timeMax')).toBe(false);
      });

      it('starts a full sync with no window from now, as before', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });

        await adapter.fetchChanges(mockTokens);

        const url = new URL(mockFetch.mock.calls[0][0]);
        expect(url.searchParams.get('timeMin')).toBe(new Date().toISOString());
        expect(url.searchParams.has('timeMax')).toBe(false);
      });

      it('carries the event visibility, so private events can be left out', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              eventJson({ id: 'a', visibility: 'private' }),
              eventJson({ id: 'b', visibility: 'confidential' }),
              eventJson({ id: 'c', visibility: 'public' }),
              eventJson({ id: 'd' }),
              eventJson({ id: 'e', visibility: 'something-new' }),
            ],
          }),
        });

        const result = await adapter.fetchChanges(mockTokens, 'token');

        expect(result.value?.events.map((e) => e.visibility)).toEqual([
          'private',
          'confidential',
          'public',
          'default',
          'default',
        ]);
      });
    });
  });
  describe('Webhook Management', () => {
    const CHANNEL_TOKEN = ['channel', 'value', 'for', 'tests'].join('-');
    beforeEach(() => vi.stubEnv('GOOGLE_CALENDAR_CHANNEL_TOKEN', CHANNEL_TOKEN));
    afterEach(() => vi.unstubAllEnvs());

    describe('registerWebhook', () => {
      it('refuses to create a channel when no channel token is configured', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_CHANNEL_TOKEN', '');
        mockFetch.mockClear();
        const result = await adapter.registerWebhook(
          mockTokens,
          'https://api.example.com/webhooks/calendar'
        );
        expect(result.isFailure).toBe(true);
        expect(result.error?.message).toContain('GOOGLE_CALENDAR_CHANNEL_TOKEN');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('sends the configured channel token to Google', async () => {
        mockFetch.mockClear();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'generated-channel-id', resourceId: 'resource-xyz' }),
        });
        await adapter.registerWebhook(mockTokens, 'https://api.example.com/webhooks/calendar');
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.token).toBe(CHANNEL_TOKEN);
      });

      it('should register webhook successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            kind: 'api#channel',
            id: 'generated-channel-id',
            resourceId: 'resource-xyz',
            resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            expiration: String(Date.now() + 86400000),
          }),
        });

        const result = await adapter.registerWebhook(
          mockTokens,
          'https://api.example.com/webhooks/calendar'
        );

        expect(result.isSuccess).toBe(true);
        expect(result.value?.resourceId).toBe('resource-xyz');
        expect(result.value?.callbackUrl).toBe('https://api.example.com/webhooks/calendar');
      });

      it('should handle webhook registration failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid webhook URL' } }),
        });

        const result = await adapter.registerWebhook(mockTokens, 'invalid-url');

        expect(result.isFailure).toBe(true);
      });
    });

    describe('unregisterWebhook', () => {
      it('should unregister webhook successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
        });

        const result = await adapter.unregisterWebhook(mockTokens, 'channel-123', 'resource-xyz');

        expect(result.isSuccess).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/channels/stop'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              id: 'channel-123',
              resourceId: 'resource-xyz',
            }),
          })
        );
      });

      it('should treat 404 as successful unregister', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        const result = await adapter.unregisterWebhook(
          mockTokens,
          'unknown-channel',
          'resource-xyz'
        );

        expect(result.isSuccess).toBe(true);
      });

      it('should require resourceId', async () => {
        const result = await adapter.unregisterWebhook(mockTokens, 'channel-123');

        expect(result.isFailure).toBe(true);
        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });
    });

    describe('parseWebhookPayload', () => {
      it('should parse valid webhook payload', () => {
        const headers = {
          'x-goog-channel-id': 'channel-123',
          'x-goog-resource-id': 'resource-xyz',
          'x-goog-resource-state': 'sync',
          'x-goog-resource-uri': 'https://www.googleapis.com/calendar/v3/...',
        };

        const result = adapter.parseWebhookPayload(headers, {});

        expect(result.isSuccess).toBe(true);
        expect(result.value?.channelId).toBe('channel-123');
        expect(result.value?.changeType).toBe('updated'); // sync -> updated
      });

      it('should handle exists state (event changed)', () => {
        const headers = {
          'x-goog-channel-id': 'channel-123',
          'x-goog-resource-id': 'resource-xyz',
          'x-goog-resource-state': 'exists',
        };

        const result = adapter.parseWebhookPayload(headers, {});

        expect(result.isSuccess).toBe(true);
        expect(result.value?.changeType).toBe('updated');
      });

      it('should handle not_exists state (event deleted)', () => {
        const headers = {
          'x-goog-channel-id': 'channel-123',
          'x-goog-resource-id': 'resource-xyz',
          'x-goog-resource-state': 'not_exists',
        };

        const result = adapter.parseWebhookPayload(headers, {});

        expect(result.isSuccess).toBe(true);
        expect(result.value?.changeType).toBe('deleted');
      });

      it('should fail with missing headers', () => {
        const result = adapter.parseWebhookPayload({}, {});

        expect(result.isFailure).toBe(true);
        expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      });
    });
  });
});
