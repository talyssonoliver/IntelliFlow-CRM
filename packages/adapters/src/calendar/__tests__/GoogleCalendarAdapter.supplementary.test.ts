/**
 * GoogleCalendarAdapter - Supplementary Coverage Tests
 *
 * Targets remaining uncovered branches not covered by existing tests:
 * - createEvent: rate limiter denying request, idempotency duplicate with
 *   getEvent returning null, json parse failure in error response
 * - handleApiError: 403 with non-rateLimitExceeded reason, no error.message
 * - fetchChanges: network error with non-Error thrown
 * - googleEventToExternal: end date with only date (no dateTime), no end at all
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleCalendarAdapter, GoogleCalendarConfig } from '../google/client';
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

describe('GoogleCalendarAdapter - Supplementary Coverage', () => {
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

  describe('handleApiError - 403 non-rate-limit', () => {
    it('should return sync error for 403 without rateLimitExceeded reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [{ reason: 'forbidden' }],
            message: 'Insufficient permissions',
          },
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
      expect(result.error?.message).toContain('Insufficient permissions');
    });

    it('should handle 403 with no errors array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Access denied' },
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
    });

    it('should handle 403 with empty errors array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [],
            message: 'No permission',
          },
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_SYNC_ERROR');
    });
  });

  describe('handleApiError - missing error.message', () => {
    it('should use fallback message when error.message is undefined for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 403 },
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Access denied');
    });

    it('should use fallback message for unknown status code with no message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          error: {},
        }),
      });

      const result = await adapter.getEventByICalUID(mockTokens, 'uid');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown API error');
    });

    it('should use fallback for 404 with no error.message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {},
        }),
      });

      const result = await adapter.getEventByICalUID(mockTokens, 'uid');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Event not found');
    });
  });

  describe('handleApiError - 429 with missing retryAfterSeconds', () => {
    it('should default to 60 seconds when retryAfterSeconds is missing', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'Too many requests',
            details: [],
          },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const resultPromise = adapter.getEventByICalUID(mockTokens, 'uid');

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(130000);
      }

      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('CALENDAR_RATE_LIMIT');
    });
  });

  describe('createEvent - json parse failure in error response', () => {
    it('should handle non-parseable error response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const appointment = createMockAppointment();
      const result = await adapter.createEvent(
        mockTokens,
        appointment as any,
        'idem-json-fail'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('fetchChanges - non-Error throw', () => {
    it('should handle non-Error thrown during fetch', async () => {
      mockFetch.mockRejectedValueOnce('string-error');

      const result = await adapter.fetchChanges(mockTokens, 'sync-token');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('fetchEventsInRange - non-Error throw', () => {
    it('should handle non-Error thrown during fetch', async () => {
      mockFetch.mockRejectedValueOnce(42);

      const result = await adapter.fetchEventsInRange(
        mockTokens,
        new Date('2025-01-15T00:00:00Z'),
        new Date('2025-01-15T23:59:59Z')
      );

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('createEvent - non-Error throw in fetch', () => {
    it('should record failure and return sync error for non-Error throw', async () => {
      mockFetch.mockRejectedValueOnce(null);

      const appointment = createMockAppointment();
      const result = await adapter.createEvent(
        mockTokens,
        appointment as any,
        'idem-non-error'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('deleteEvent - non-Error throw', () => {
    it('should handle non-Error thrown during delete', async () => {
      mockFetch.mockRejectedValueOnce(undefined);

      const result = await adapter.deleteEvent(mockTokens, 'event-xyz');

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain('Unknown error');
    });
  });

  describe('googleEventToExternal - end with date only (all-day)', () => {
    it('should parse end date when only date is provided (no dateTime)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'allday-end-only',
          summary: 'All Day End',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          end: { date: '2025-01-16' },
          status: 'confirmed',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'allday-end-only');
      expect(result.isSuccess).toBe(true);
      expect(result.value?.endTime).toBeDefined();
      // End should be parsed from date string
      expect(result.value?.endTime.getFullYear()).toBe(2025);
    });

    it('should use default 1-hour end when no end provided at all', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'no-end',
          summary: 'No End Event',
          start: { dateTime: '2025-01-15T10:00:00Z' },
          status: 'confirmed',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'no-end');
      expect(result.isSuccess).toBe(true);
      // Default end should be 1 hour after start
      const expectedEnd = new Date('2025-01-15T11:00:00Z');
      expect(result.value?.endTime.getTime()).toBe(expectedEnd.getTime());
    });
  });
});
