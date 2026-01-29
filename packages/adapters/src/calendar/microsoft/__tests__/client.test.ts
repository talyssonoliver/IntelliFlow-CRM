/**
 * Microsoft Calendar Adapter Tests
 *
 * Tests for the Microsoft Graph Calendar integration.
 *
 * @module adapters/calendar/microsoft
 * @task IFC-172 - Complete Microsoft Calendar integration
 * @artifact packages/adapters/src/calendar/microsoft/__tests__/client.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MicrosoftCalendarAdapter, MicrosoftCalendarConfig } from '../client';
import { Appointment, AppointmentId, TenantId, UserId } from '@intelliflow/domain';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MicrosoftCalendarAdapter', () => {
  let adapter: MicrosoftCalendarAdapter;
  let config: MicrosoftCalendarConfig;

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000),
    scope: ['Calendars.ReadWrite'],
    tokenType: 'Bearer',
  };

  const mockAppointment = {
    id: { value: 'apt-123' } as AppointmentId,
    tenantId: { value: 'tenant-123' } as TenantId,
    userId: { value: 'user-123' } as UserId,
    title: 'Test Meeting',
    description: 'Test description',
    startTime: new Date('2026-01-28T10:00:00Z'),
    endTime: new Date('2026-01-28T11:00:00Z'),
    location: 'Conference Room A',
    attendeeIds: ['attendee1@example.com', 'attendee2@example.com'],
    externalCalendarId: undefined,
    isCancelled: false,
  } as unknown as Appointment;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      oauthConfig: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback',
        scopes: ['Calendars.ReadWrite', 'offline_access'],
      },
      tenantId: 'test-tenant',
    };

    adapter = new MicrosoftCalendarAdapter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'test-state-123';
      const url = adapter.getAuthorizationUrl(state);

      expect(url).toContain('https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          scope: 'Calendars.ReadWrite offline_access',
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
        json: async () => ({
          error: {
            code: 'invalid_grant',
            message: 'Invalid authorization code',
          },
        }),
      });

      const result = await adapter.exchangeCodeForTokens('invalid-code');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access-token',
          refresh_token: 'refreshed-refresh-token',
          expires_in: 3600,
          scope: 'Calendars.ReadWrite offline_access',
          token_type: 'Bearer',
        }),
      });

      const result = await adapter.refreshAccessToken('old-refresh-token');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.accessToken).toBe('refreshed-access-token');
    });
  });

  describe('createEvent', () => {
    it('should create calendar event successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'event-123',
          subject: 'Test Meeting',
          bodyPreview: 'Test description',
          start: { dateTime: '2026-01-28T10:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-01-28T11:00:00', timeZone: 'UTC' },
          location: { displayName: 'Conference Room A' },
          attendees: [
            { emailAddress: { address: 'attendee1@example.com' }, type: 'required' },
            { emailAddress: { address: 'attendee2@example.com' }, type: 'required' },
          ],
          iCalUId: 'ical-123',
          changeKey: 'etag-123',
          lastModifiedDateTime: '2026-01-28T09:00:00Z',
        }),
      });

      const result = await adapter.createEvent(
        mockTokens,
        mockAppointment,
        'idempotency-key-123'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value?.externalId).toBe('event-123');
      expect(result.value?.title).toBe('Test Meeting');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            code: 'TooManyRequests',
            message: 'Rate limit exceeded',
            innerError: { retryAfterSeconds: 60 },
          },
        }),
      });

      const result = await adapter.createEvent(
        mockTokens,
        mockAppointment,
        'idempotency-key-123'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateEvent', () => {
    it('should update calendar event successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'event-123',
          subject: 'Updated Meeting',
          start: { dateTime: '2026-01-28T10:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-01-28T11:00:00', timeZone: 'UTC' },
          changeKey: 'new-etag-123',
          lastModifiedDateTime: '2026-01-28T10:00:00Z',
        }),
      });

      const result = await adapter.updateEvent(
        mockTokens,
        'event-123',
        mockAppointment,
        'old-etag'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value?.etag).toBe('new-etag-123');
    });

    it('should handle conflict errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 412,
        json: async () => ({
          error: { code: 'PreconditionFailed', message: 'ETag mismatch' },
        }),
      });

      const result = await adapter.updateEvent(
        mockTokens,
        'event-123',
        mockAppointment,
        'stale-etag'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('deleteEvent', () => {
    it('should delete calendar event successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await adapter.deleteEvent(mockTokens, 'event-123');

      expect(result.isSuccess).toBe(true);
    });

    it('should handle not found gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await adapter.deleteEvent(mockTokens, 'non-existent-event');

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('getEvent', () => {
    it('should fetch calendar event successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'event-123',
          subject: 'Test Meeting',
          start: { dateTime: '2026-01-28T10:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-01-28T11:00:00', timeZone: 'UTC' },
          lastModifiedDateTime: '2026-01-28T09:00:00Z',
        }),
      });

      const result = await adapter.getEvent(mockTokens, 'event-123');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.externalId).toBe('event-123');
    });

    it('should return null for non-existent event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await adapter.getEvent(mockTokens, 'non-existent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('fetchChanges', () => {
    it('should fetch delta changes successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 'event-1',
              subject: 'Event 1',
              start: { dateTime: '2026-01-28T10:00:00', timeZone: 'UTC' },
              end: { dateTime: '2026-01-28T11:00:00', timeZone: 'UTC' },
              lastModifiedDateTime: '2026-01-28T09:00:00Z',
            },
            {
              id: 'event-2',
              isCancelled: true,
            },
          ],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/calendar/events/delta?$deltatoken=xxx',
        }),
      });

      const result = await adapter.fetchChanges(mockTokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.events).toHaveLength(1);
      expect(result.value?.deletedEventIds).toContain('event-2');
      expect(result.value?.nextSyncToken).toBeDefined();
    });
  });

  describe('registerWebhook', () => {
    it('should register webhook subscription successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'subscription-123',
          resource: '/me/calendar/events',
          notificationUrl: 'https://example.com/webhook',
          expirationDateTime: '2026-01-31T10:00:00Z',
          clientState: 'test-state',
        }),
      });

      const result = await adapter.registerWebhook(
        mockTokens,
        'https://example.com/webhook'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('subscription-123');
    });
  });

  describe('validateTokens', () => {
    it('should return true for valid tokens', () => {
      const validTokens = {
        ...mockTokens,
        expiresAt: new Date(Date.now() + 3600000),
      };

      expect(adapter.validateTokens(validTokens)).toBe(true);
    });

    it('should return false for expired tokens', () => {
      const expiredTokens = {
        ...mockTokens,
        expiresAt: new Date(Date.now() - 1000),
      };

      expect(adapter.validateTokens(expiredTokens)).toBe(false);
    });

    it('should return false for tokens expiring soon', () => {
      const soonExpiringTokens = {
        ...mockTokens,
        expiresAt: new Date(Date.now() + 60000), // 1 minute
      };

      expect(adapter.validateTokens(soonExpiringTokens)).toBe(false);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent idempotency keys', () => {
      const key1 = adapter.generateIdempotencyKey('apt-123', 'create');
      const key2 = adapter.generateIdempotencyKey('apt-123', 'create');

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different operations', () => {
      const createKey = adapter.generateIdempotencyKey('apt-123', 'create');
      const updateKey = adapter.generateIdempotencyKey('apt-123', 'update');

      expect(createKey).not.toBe(updateKey);
    });
  });
});
