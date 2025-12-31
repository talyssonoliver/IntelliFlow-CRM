/**
 * Gmail Email Adapter Integration Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GmailAdapter, GmailConfig, GmailOAuthTokens } from '../../../packages/adapters/src/email/gmail/client';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;
  let config: GmailConfig;
  let mockTokens: GmailOAuthTokens;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/callback',
    };

    adapter = new GmailAdapter(config);

    mockTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      tokenType: 'Bearer',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate valid authorization URL', () => {
      const url = adapter.getAuthorizationUrl('test-state');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=test-state');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
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
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          token_type: 'Bearer',
        }),
      });

      const result = await adapter.exchangeCodeForTokens('auth-code');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.accessToken).toBe('new-access-token');
      expect(result.value?.refreshToken).toBe('new-refresh-token');
    });

    it('should handle token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Code expired',
        }),
      });

      const result = await adapter.exchangeCodeForTokens('expired-code');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('GMAIL_AUTH_ERROR');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          token_type: 'Bearer',
        }),
      });

      const result = await adapter.refreshAccessToken('refresh-token');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.accessToken).toBe('refreshed-token');
    });
  });

  describe('validateTokens', () => {
    it('should return true for valid tokens', () => {
      expect(adapter.validateTokens(mockTokens)).toBe(true);
    });

    it('should return false for expired tokens', () => {
      const expiredTokens = {
        ...mockTokens,
        expiresAt: new Date(Date.now() - 1000),
      };
      expect(adapter.validateTokens(expiredTokens)).toBe(false);
    });

    it('should return false for tokens expiring within 5 minutes', () => {
      const almostExpiredTokens = {
        ...mockTokens,
        expiresAt: new Date(Date.now() + 60000),
      };
      expect(adapter.validateTokens(almostExpiredTokens)).toBe(false);
    });
  });

  describe('getMessage', () => {
    it('should return parsed email message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg123',
          threadId: 'thread123',
          labelIds: ['INBOX'],
          snippet: 'Hello world',
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'recipient@example.com' },
              { name: 'Subject', value: 'Test Email' },
            ],
            mimeType: 'text/plain',
            body: {
              size: 11,
              data: Buffer.from('Hello world').toString('base64url'),
            },
          },
        }),
      });

      const result = await adapter.getMessage(mockTokens, 'msg123');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('msg123');
      expect(result.value?.subject).toBe('Test Email');
      expect(result.value?.from.email).toBe('sender@example.com');
    });

    it('should return null for non-existent message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 404 } }),
      });

      const result = await adapter.getMessage(mockTokens, 'nonexistent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('searchMessages', () => {
    it('should search and return messages', async () => {
      // First call returns message IDs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [{ id: 'msg1' }, { id: 'msg2' }],
          resultSizeEstimate: 2,
        }),
      });

      // Then fetch full message details for each
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg1',
          threadId: 'thread1',
          labelIds: ['INBOX'],
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'Subject', value: 'Email 1' },
              { name: 'From', value: 'a@example.com' },
              { name: 'To', value: 'b@example.com' },
            ],
            mimeType: 'text/plain',
          },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg2',
          threadId: 'thread2',
          labelIds: ['INBOX'],
          internalDate: '1704067200000',
          payload: {
            headers: [
              { name: 'Subject', value: 'Email 2' },
              { name: 'From', value: 'c@example.com' },
              { name: 'To', value: 'd@example.com' },
            ],
            mimeType: 'text/plain',
          },
        }),
      });

      const result = await adapter.searchMessages(mockTokens, {
        query: 'subject:test',
        maxResults: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.messages).toHaveLength(2);
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'sent123',
          threadId: 'thread123',
          labelIds: ['SENT'],
        }),
      });

      const result = await adapter.sendMessage(mockTokens, {
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Test body',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('sent123');
    });

    it('should send HTML message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'sent123',
          threadId: 'thread123',
          labelIds: ['SENT'],
        }),
      });

      const result = await adapter.sendMessage(mockTokens, {
        to: ['recipient@example.com'],
        subject: 'HTML Email',
        body: '<h1>Hello</h1>',
        isHtml: true,
      });

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('trashMessage', () => {
    it('should trash message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg123', labelIds: ['TRASH'] }),
      });

      const result = await adapter.trashMessage(mockTokens, 'msg123');

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('modifyLabels', () => {
    it('should modify labels successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg123' }),
      });

      const result = await adapter.modifyLabels(mockTokens, 'msg123', ['STARRED'], ['UNREAD']);

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg123' }),
      });

      const result = await adapter.markAsRead(mockTokens, 'msg123');

      expect(result.isSuccess).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/modify'),
        expect.objectContaining({
          body: expect.stringContaining('UNREAD'),
        })
      );
    });
  });

  describe('listLabels', () => {
    it('should list labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          labels: [
            { id: 'INBOX', name: 'INBOX', type: 'system' },
            { id: 'Label_1', name: 'Custom', type: 'user' },
          ],
        }),
      });

      const result = await adapter.listLabels(mockTokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
    });
  });

  describe('createLabel', () => {
    it('should create label successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'Label_new',
          name: 'New Label',
          type: 'user',
        }),
      });

      const result = await adapter.createLabel(mockTokens, 'New Label');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.name).toBe('New Label');
    });
  });

  describe('getAttachment', () => {
    it('should get attachment data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: 'base64encodeddata',
          size: 1024,
        }),
      });

      const result = await adapter.getAttachment(mockTokens, 'msg123', 'att123');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.size).toBe(1024);
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          emailAddress: 'test@gmail.com',
          messagesTotal: 1000,
        }),
      });

      const result = await adapter.checkConnection(mockTokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('healthy');
    });

    it('should return unhealthy on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid token' } }),
      });

      const result = await adapter.checkConnection(mockTokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('unhealthy');
    });
  });

  describe('rate limiting', () => {
    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '60' : null),
        },
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      });

      const result = await adapter.getMessage(mockTokens, 'msg123');

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('GMAIL_RATE_LIMIT');
    });
  });
});
