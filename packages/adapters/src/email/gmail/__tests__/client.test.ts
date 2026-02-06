/**
 * GmailAdapter Tests
 * Tests for Gmail email adapter covering OAuth, message operations,
 * thread/draft/label operations, attachments, and health checks.
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Result, DomainError } from '@intelliflow/domain';
import {
  GmailAdapter,
  GmailAuthenticationError,
  GmailRateLimitError,
  GmailConnectionError,
  GmailNotFoundError,
  GmailInvalidRequestError,
  type GmailConfig,
  type GmailOAuthTokens,
  type GmailComposeEmailParams,
} from '../client';

// ==================== Mock Setup ====================

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function createMockResponse(
  status: number,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function createConfig(): GmailConfig {
  return {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };
}

function createTokens(): GmailOAuthTokens {
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    tokenType: 'Bearer',
  };
}

function createComposeParams(overrides: Partial<GmailComposeEmailParams> = {}): GmailComposeEmailParams {
  return {
    to: ['recipient@example.com'],
    subject: 'Test Subject',
    body: 'Test body content',
    ...overrides,
  };
}

function createMessageApiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg-123',
    threadId: 'thread-456',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Test snippet',
    historyId: '12345',
    internalDate: String(Date.now()),
    payload: {
      headers: [
        { name: 'From', value: 'sender@example.com' },
        { name: 'To', value: 'recipient@example.com' },
        { name: 'Subject', value: 'Test Subject' },
      ],
      mimeType: 'text/plain',
      body: {
        size: 100,
        data: Buffer.from('Hello World').toString('base64url'),
      },
    },
    sizeEstimate: 1024,
    ...overrides,
  };
}

// ==================== Tests ====================

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;
  let config: GmailConfig;
  let tokens: GmailOAuthTokens;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createConfig();
    adapter = new GmailAdapter(config);
    tokens = createTokens();
  });

  // ==================== OAuth Tests ====================

  describe('getAuthorizationUrl', () => {
    it('should return a valid Google OAuth URL with all parameters', () => {
      const url = adapter.getAuthorizationUrl('test-state-123');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });

    it('should use default scopes when none configured', () => {
      const url = adapter.getAuthorizationUrl('state');

      expect(url).toContain('gmail.readonly');
      expect(url).toContain('gmail.send');
      expect(url).toContain('gmail.modify');
      expect(url).toContain('gmail.labels');
    });

    it('should use custom scopes when configured', () => {
      const customConfig: GmailConfig = {
        ...config,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      };
      const customAdapter = new GmailAdapter(customConfig);
      const url = customAdapter.getAuthorizationUrl('state');

      expect(url).toContain('gmail.readonly');
      expect(url).not.toContain('gmail.send');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      const tokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, tokenResponse));

      const result = await adapter.exchangeCodeForTokens('auth-code-123');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accessToken).toBe('new-access-token');
      expect(result.value.refreshToken).toBe('new-refresh-token');
      expect(result.value.tokenType).toBe('Bearer');
      expect(result.value.scope).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);
      expect(result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify fetch was called with correct params
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should handle missing refresh token gracefully', async () => {
      const tokenResponse = {
        access_token: 'access-token',
        expires_in: 3600,
        scope: 'gmail.readonly',
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, tokenResponse));

      const result = await adapter.exchangeCodeForTokens('code');

      expect(result.isSuccess).toBe(true);
      expect(result.value.refreshToken).toBe('');
    });

    it('should return authentication error on failed exchange', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, { error_description: 'Invalid authorization code' })
      );

      const result = await adapter.exchangeCodeForTokens('bad-code');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
      expect(result.error.message).toContain('Invalid authorization code');
    });

    it('should return authentication error with default message if no error_description', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: vi.fn().mockResolvedValue({}),
      } as any;
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await adapter.exchangeCodeForTokens('bad-code');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Token exchange failed');
    });

    it('should return authentication error when json parsing fails', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: vi.fn().mockRejectedValue(new Error('parse error')),
      } as any;
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await adapter.exchangeCodeForTokens('bad-code');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Token exchange failed');
    });

    it('should return connection error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await adapter.exchangeCodeForTokens('code');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
      expect(result.error.message).toContain('Network failure');
    });

    it('should handle non-Error thrown objects', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await adapter.exchangeCodeForTokens('code');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token successfully', async () => {
      const tokenResponse = {
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(200, tokenResponse));

      const result = await adapter.refreshAccessToken('original-refresh-token');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accessToken).toBe('refreshed-access-token');
      // Refresh token stays the same when not returned
      expect(result.value.refreshToken).toBe('original-refresh-token');
    });

    it('should return error on failed refresh', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error_description: 'Token expired' })
      );

      const result = await adapter.refreshAccessToken('bad-token');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
    });

    it('should return connection error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await adapter.refreshAccessToken('token');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockFetch.mockRejectedValueOnce(42);

      const result = await adapter.refreshAccessToken('token');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('revokeTokens', () => {
    it('should revoke tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200));

      const result = await adapter.revokeTokens('access-token');

      expect(result.isSuccess).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke?token=access-token',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should treat 400 as success (already revoked)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(400));

      const result = await adapter.revokeTokens('already-revoked-token');

      expect(result.isSuccess).toBe(true);
    });

    it('should return error on server error (not 400)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(500));

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
    });

    it('should return connection error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });

    it('should handle non-Error thrown objects', async () => {
      mockFetch.mockRejectedValueOnce(null);

      const result = await adapter.revokeTokens('token');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unknown error');
    });
  });

  describe('validateTokens', () => {
    it('should return true for non-expired tokens', () => {
      const validTokens: GmailOAuthTokens = {
        ...tokens,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };

      expect(adapter.validateTokens(validTokens)).toBe(true);
    });

    it('should return false for tokens expiring within 5 minutes', () => {
      const expiringTokens: GmailOAuthTokens = {
        ...tokens,
        expiresAt: new Date(Date.now() + 4 * 60 * 1000), // 4 minutes from now
      };

      expect(adapter.validateTokens(expiringTokens)).toBe(false);
    });

    it('should return false for expired tokens', () => {
      const expiredTokens: GmailOAuthTokens = {
        ...tokens,
        expiresAt: new Date(Date.now() - 1000),
      };

      expect(adapter.validateTokens(expiredTokens)).toBe(false);
    });
  });

  // ==================== Message Operations ====================

  describe('getMessage', () => {
    it('should get and parse a message successfully', async () => {
      const apiResponse = createMessageApiResponse();
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
      const email = result.value;
      expect(email).not.toBeNull();
      expect(email!.id).toBe('msg-123');
      expect(email!.threadId).toBe('thread-456');
      expect(email!.from.email).toBe('sender@example.com');
      expect(email!.to[0].email).toBe('recipient@example.com');
      expect(email!.subject).toBe('Test Subject');
      expect(email!.body.text).toBe('Hello World');
      expect(email!.labels).toContain('INBOX');
      expect(email!.isRead).toBe(false);
      expect(email!.isStarred).toBe(false);
    });

    it('should return null for not found messages', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.getMessage(tokens, 'nonexistent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should return error for other API failures', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { code: 401, message: 'Unauthorized' } })
      );

      const result = await adapter.getMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
    });

    it('should return connection error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.getMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });

    it('should parse email with named sender', async () => {
      const apiResponse = createMessageApiResponse({
        payload: {
          headers: [
            { name: 'From', value: '"John Doe" <john@example.com>' },
            { name: 'To', value: 'recipient@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          mimeType: 'text/plain',
          body: { size: 0 },
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value!.from.name).toBe('John Doe');
      expect(result.value!.from.email).toBe('john@example.com');
    });

    it('should parse email with CC and BCC', async () => {
      const apiResponse = createMessageApiResponse({
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'to@example.com' },
            { name: 'Cc', value: 'cc1@example.com, cc2@example.com' },
            { name: 'Bcc', value: 'bcc@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          mimeType: 'text/plain',
          body: { size: 0 },
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value!.cc).toHaveLength(2);
      expect(result.value!.cc![0].email).toBe('cc1@example.com');
      expect(result.value!.bcc).toHaveLength(1);
      expect(result.value!.bcc![0].email).toBe('bcc@example.com');
    });

    it('should parse starred and read messages', async () => {
      const apiResponse = createMessageApiResponse({
        labelIds: ['INBOX', 'STARRED'],
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value!.isRead).toBe(true);
      expect(result.value!.isStarred).toBe(true);
    });

    it('should extract HTML body from multipart message', async () => {
      const apiResponse = createMessageApiResponse({
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'to@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { size: 5, data: Buffer.from('Plain').toString('base64url') },
            },
            {
              mimeType: 'text/html',
              body: { size: 20, data: Buffer.from('<b>HTML</b>').toString('base64url') },
            },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value!.body.text).toBe('Plain');
      expect(result.value!.body.html).toBe('<b>HTML</b>');
    });

    it('should extract attachments', async () => {
      const apiResponse = createMessageApiResponse({
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'to@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/plain',
              body: { size: 5, data: Buffer.from('text').toString('base64url') },
            },
            {
              filename: 'document.pdf',
              mimeType: 'application/pdf',
              body: { size: 50000, attachmentId: 'att-123' },
            },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(createMockResponse(200, apiResponse));

      const result = await adapter.getMessage(tokens, 'msg-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value!.attachments).toHaveLength(1);
      expect(result.value!.attachments[0].filename).toBe('document.pdf');
      expect(result.value!.attachments[0].mimeType).toBe('application/pdf');
      expect(result.value!.attachments[0].attachmentId).toBe('att-123');
    });
  });

  describe('searchMessages', () => {
    it('should search messages successfully', async () => {
      // First call: list message IDs
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
          nextPageToken: 'next-page',
          resultSizeEstimate: 2,
        })
      );

      // Second and third calls: get full messages
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createMessageApiResponse({ id: 'msg-1' })));
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createMessageApiResponse({ id: 'msg-2' })));

      const result = await adapter.searchMessages(tokens, { query: 'from:test@example.com' });

      expect(result.isSuccess).toBe(true);
      expect(result.value.messages).toHaveLength(2);
      expect(result.value.nextPageToken).toBe('next-page');
      expect(result.value.resultSizeEstimate).toBe(2);
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          resultSizeEstimate: 0,
        })
      );

      const result = await adapter.searchMessages(tokens, { query: 'nonexistent' });

      expect(result.isSuccess).toBe(true);
      expect(result.value.messages).toHaveLength(0);
    });

    it('should pass optional search parameters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { resultSizeEstimate: 0 }));

      await adapter.searchMessages(tokens, {
        query: 'test',
        maxResults: 10,
        pageToken: 'page-token',
        labelIds: ['INBOX', 'STARRED'],
        includeSpamTrash: true,
      });

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('maxResults=10');
      expect(fetchUrl).toContain('pageToken=page-token');
      expect(fetchUrl).toContain('labelIds=INBOX');
      expect(fetchUrl).toContain('labelIds=STARRED');
      expect(fetchUrl).toContain('includeSpamTrash=true');
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Unauthorized' } })
      );

      const result = await adapter.searchMessages(tokens, { query: 'test' });

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await adapter.searchMessages(tokens, { query: 'test' });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('sendMessage', () => {
    it('should send a simple message successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] })
      );

      const result = await adapter.sendMessage(tokens, createComposeParams());

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('sent-1');
      expect(result.value.threadId).toBe('thread-1');
      expect(result.value.labelIds).toEqual(['SENT']);
    });

    it('should send message with CC and BCC', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-2', threadId: 'thread-2', labelIds: ['SENT'] })
      );

      const result = await adapter.sendMessage(
        tokens,
        createComposeParams({
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
        })
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should send HTML message', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-3', threadId: 'thread-3', labelIds: [] })
      );

      const result = await adapter.sendMessage(
        tokens,
        createComposeParams({
          body: '<h1>Hello</h1>',
          isHtml: true,
        })
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should send message with attachments', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-4', threadId: 'thread-4', labelIds: [] })
      );

      const result = await adapter.sendMessage(
        tokens,
        createComposeParams({
          attachments: [
            {
              filename: 'test.txt',
              mimeType: 'text/plain',
              content: Buffer.from('Hello').toString('base64'),
            },
          ],
        })
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should send reply with In-Reply-To and References headers', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-5', threadId: 'thread-5', labelIds: [] })
      );

      const result = await adapter.sendMessage(
        tokens,
        createComposeParams({
          threadId: 'thread-5',
          inReplyTo: 'msg-original',
          references: 'msg-original',
        })
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(429, { error: { message: 'Rate limited' } }, { 'Retry-After': '30' })
      );

      const result = await adapter.sendMessage(tokens, createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailRateLimitError);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await adapter.sendMessage(tokens, createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('replyToMessage', () => {
    it('should reply to message with Re: prefix', async () => {
      // First call: getMessage
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createMessageApiResponse()));
      // Second call: sendMessage
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'reply-1', threadId: 'thread-456', labelIds: ['SENT'] })
      );

      const result = await adapter.replyToMessage(tokens, 'msg-123', createComposeParams());

      expect(result.isSuccess).toBe(true);
      expect(result.value.threadId).toBe('thread-456');
    });

    it('should not double Re: prefix if already present', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createMessageApiResponse()));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'reply-2', threadId: 'thread-456', labelIds: [] })
      );

      const result = await adapter.replyToMessage(
        tokens,
        'msg-123',
        createComposeParams({ subject: 'Re: Already prefixed' })
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should fail when original message not found (getMessage returns null)', async () => {
      // getMessage for 404 returns ok(null), then replyToMessage returns NotFoundError
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.replyToMessage(tokens, 'nonexistent', createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailNotFoundError);
    });

    it('should propagate getMessage errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Auth error' } })
      );

      const result = await adapter.replyToMessage(tokens, 'msg-1', createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
    });
  });

  describe('forwardMessage', () => {
    it('should forward a message successfully', async () => {
      // getMessage
      mockFetch.mockResolvedValueOnce(createMockResponse(200, createMessageApiResponse()));
      // sendMessage
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'fwd-1', threadId: 'thread-new', labelIds: ['SENT'] })
      );

      const result = await adapter.forwardMessage(tokens, 'msg-123', ['fwd@example.com']);

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('fwd-1');
    });

    it('should fail if original message not found', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.forwardMessage(tokens, 'nonexistent', ['fwd@example.com']);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailNotFoundError);
    });

    it('should propagate getMessage errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Auth error' } })
      );

      const result = await adapter.forwardMessage(tokens, 'msg-1', ['fwd@example.com']);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(204));

      const result = await adapter.deleteMessage(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.deleteMessage(tokens, 'nonexistent');

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection error'));

      const result = await adapter.deleteMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('trashMessage', () => {
    it('should trash a message successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.trashMessage(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/msg-123/trash'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(500, { error: { message: 'Server error' } })
      );

      const result = await adapter.trashMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await adapter.trashMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('untrashMessage', () => {
    it('should untrash a message successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.untrashMessage(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/messages/msg-123/untrash'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.untrashMessage(tokens, 'msg-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('modifyLabels', () => {
    it('should modify labels successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.modifyLabels(tokens, 'msg-123', ['STARRED'], ['UNREAD']);

      expect(result.isSuccess).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.modifyLabels(tokens, 'msg-123', [], []);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('markAsRead', () => {
    it('should remove UNREAD label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.markAsRead(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.removeLabelIds).toContain('UNREAD');
    });
  });

  describe('markAsUnread', () => {
    it('should add UNREAD label', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.markAsUnread(tokens, 'msg-123');

      expect(result.isSuccess).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.addLabelIds).toContain('UNREAD');
    });
  });

  // ==================== Thread Operations ====================

  describe('getThread', () => {
    it('should get a thread successfully', async () => {
      const threadResponse = {
        id: 'thread-1',
        historyId: '999',
        messages: [
          createMessageApiResponse({ id: 'msg-1' }),
          createMessageApiResponse({ id: 'msg-2' }),
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(200, threadResponse));

      const result = await adapter.getThread(tokens, 'thread-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value).not.toBeNull();
      expect(result.value!.id).toBe('thread-1');
      expect(result.value!.messages).toHaveLength(2);
    });

    it('should return null for not found thread', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.getThread(tokens, 'nonexistent');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should propagate non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Auth error' } })
      );

      const result = await adapter.getThread(tokens, 'thread-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.getThread(tokens, 'thread-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('deleteThread', () => {
    it('should delete a thread successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(204));

      const result = await adapter.deleteThread(tokens, 'thread-1');

      expect(result.isSuccess).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.deleteThread(tokens, 'thread-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('trashThread', () => {
    it('should trash a thread successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.trashThread(tokens, 'thread-1');

      expect(result.isSuccess).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.trashThread(tokens, 'thread-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  // ==================== Draft Operations ====================

  describe('createDraft', () => {
    it('should create a draft successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          id: 'draft-1',
          message: createMessageApiResponse(),
        })
      );

      const result = await adapter.createDraft(tokens, createComposeParams());

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('draft-1');
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, { error: { message: 'Bad request' } })
      );

      const result = await adapter.createDraft(tokens, createComposeParams());

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.createDraft(tokens, createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('updateDraft', () => {
    it('should update a draft successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          id: 'draft-1',
          message: createMessageApiResponse(),
        })
      );

      const result = await adapter.updateDraft(tokens, 'draft-1', createComposeParams());

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('draft-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/drafts/draft-1'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.updateDraft(tokens, 'draft-1', createComposeParams());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('deleteDraft', () => {
    it('should delete a draft successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(204));

      const result = await adapter.deleteDraft(tokens, 'draft-1');

      expect(result.isSuccess).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.deleteDraft(tokens, 'draft-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('sendDraft', () => {
    it('should send a draft successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] })
      );

      const result = await adapter.sendDraft(tokens, 'draft-1');

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBe('sent-1');
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.sendDraft(tokens, 'draft-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('listDrafts', () => {
    it('should list drafts successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          drafts: [
            { id: 'draft-1', message: createMessageApiResponse({ id: 'msg-1' }) },
            { id: 'draft-2', message: createMessageApiResponse({ id: 'msg-2' }) },
          ],
        })
      );

      const result = await adapter.listDrafts(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(result.value[0].id).toBe('draft-1');
    });

    it('should handle empty drafts list', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.listDrafts(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.listDrafts(tokens);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  // ==================== Label Operations ====================

  describe('listLabels', () => {
    it('should list labels successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, {
          labels: [
            { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100 },
            { id: 'Label_1', name: 'Custom', type: 'user', messagesTotal: 5 },
          ],
        })
      );

      const result = await adapter.listLabels(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(result.value[0].id).toBe('INBOX');
      expect(result.value[0].type).toBe('system');
      expect(result.value[0].messagesTotal).toBe(100);
    });

    it('should handle empty labels list', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, {}));

      const result = await adapter.listLabels(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.listLabels(tokens);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('createLabel', () => {
    it('should create a label successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { id: 'Label_new', name: 'My Label', type: 'user' })
      );

      const result = await adapter.createLabel(tokens, 'My Label');

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('My Label');
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.createLabel(tokens, 'Label');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  describe('deleteLabel', () => {
    it('should delete a label successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(204));

      const result = await adapter.deleteLabel(tokens, 'Label_1');

      expect(result.isSuccess).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.deleteLabel(tokens, 'Label_1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  // ==================== Attachment Operations ====================

  describe('getAttachment', () => {
    it('should get an attachment successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(200, { data: 'base64encodeddata', size: 1024 })
      );

      const result = await adapter.getAttachment(tokens, 'msg-123', 'att-456');

      expect(result.isSuccess).toBe(true);
      expect(result.value.data).toBe('base64encodeddata');
      expect(result.value.size).toBe(1024);
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { code: 404, message: 'Not found' } })
      );

      const result = await adapter.getAttachment(tokens, 'msg-123', 'nonexistent');

      expect(result.isFailure).toBe(true);
    });

    it('should return connection error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      const result = await adapter.getAttachment(tokens, 'msg-1', 'att-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailConnectionError);
    });
  });

  // ==================== Health Check ====================

  describe('checkConnection', () => {
    it('should return healthy status for fast responses', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(200, { emailAddress: 'test@gmail.com' }));

      const result = await adapter.checkConnection(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('healthy');
      expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when API fails', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Auth error' } })
      );

      const result = await adapter.checkConnection(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('unhealthy');
    });

    it('should return unhealthy on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.checkConnection(tokens);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('unhealthy');
    });
  });

  // ==================== Error Response Handling ====================

  describe('handleErrorResponse (via makeRequest)', () => {
    it('should handle 401 as authentication error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(401, { error: { message: 'Token expired' } })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailAuthenticationError);
      expect(result.error.message).toContain('Token expired');
    });

    it('should handle 404 as not found error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(404, { error: { message: 'msg-1' } })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailNotFoundError);
    });

    it('should handle 429 as rate limit error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(429, { error: { message: 'Rate limited' } }, { 'Retry-After': '60' })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailRateLimitError);
      expect((result.error as GmailRateLimitError).retryAfterSeconds).toBe(60);
    });

    it('should handle 429 with default retry-after when header missing', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(429, { error: { message: 'Rate limited' } })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailRateLimitError);
      expect((result.error as GmailRateLimitError).retryAfterSeconds).toBe(60);
    });

    it('should handle other errors as invalid request', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(400, { error: { message: 'Bad request' } })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailInvalidRequestError);
    });

    it('should handle 500 as invalid request error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(500, { error: { message: 'Internal server error' } })
      );

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(GmailInvalidRequestError);
    });

    it('should use default error message when error body has no message', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(401, {}));

      const result = await adapter.deleteMessage(tokens, 'msg-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Token expired or invalid');
    });
  });

  // ==================== Error Classes ====================

  describe('Error Classes', () => {
    it('GmailAuthenticationError has correct code', () => {
      const error = new GmailAuthenticationError('test');
      expect(error.code).toBe('GMAIL_AUTH_ERROR');
      expect(error.message).toBe('test');
    });

    it('GmailRateLimitError has correct code and retryAfterSeconds', () => {
      const error = new GmailRateLimitError(30);
      expect(error.code).toBe('GMAIL_RATE_LIMIT');
      expect(error.retryAfterSeconds).toBe(30);
      expect(error.message).toContain('30 seconds');
    });

    it('GmailConnectionError has correct code', () => {
      const error = new GmailConnectionError('timeout');
      expect(error.code).toBe('GMAIL_CONNECTION_ERROR');
    });

    it('GmailNotFoundError has correct code and message', () => {
      const error = new GmailNotFoundError('Message', 'msg-123');
      expect(error.code).toBe('GMAIL_NOT_FOUND');
      expect(error.message).toContain('Message');
      expect(error.message).toContain('msg-123');
    });

    it('GmailInvalidRequestError has correct code', () => {
      const error = new GmailInvalidRequestError('bad request');
      expect(error.code).toBe('GMAIL_INVALID_REQUEST');
    });
  });
});
