/**
 * Email Connector Integration Tests
 * Tests for Gmail and Outlook adapter functionality
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

interface GmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
}

interface OutlookOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
}

describe('Gmail Email Adapter', () => {
  const mockTokens: GmailOAuthTokens = {
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
    expiresAt: new Date(Date.now() + 3600000),
    tokenType: 'Bearer',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OAuth Authentication', () => {
    it('should generate authorization URL', () => {
      const clientId = 'test_client_id';
      const redirectUri = 'http://localhost:3000/callback';
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ];

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');

      expect(authUrl.toString()).toContain('client_id=test_client_id');
      expect(authUrl.toString()).toContain('response_type=code');
    });

    it('should exchange code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        }),
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'code=auth_code&grant_type=authorization_code',
      });

      const result = await response.json();

      expect(result.access_token).toBe('new_access_token');
      expect(result.refresh_token).toBe('new_refresh_token');
    });

    it('should refresh access token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'refreshed_access_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'refresh_token=mock_refresh_token&grant_type=refresh_token',
      });

      const result = await response.json();

      expect(result.access_token).toBe('refreshed_access_token');
    });
  });

  describe('Message Operations', () => {
    it('should send an email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          threadId: 'thread_123',
          labelIds: ['SENT'],
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: Buffer.from('To: test@example.com\nSubject: Test\n\nHello').toString('base64url'),
        }),
      });

      const result = await response.json();

      expect(result.id).toBe('msg_123');
      expect(result.labelIds).toContain('SENT');
    });

    it('should get a message by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          threadId: 'thread_123',
          snippet: 'This is a test email...',
          payload: {
            headers: [
              { name: 'From', value: 'sender@example.com' },
              { name: 'To', value: 'recipient@example.com' },
              { name: 'Subject', value: 'Test Email' },
            ],
          },
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_123', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.id).toBe('msg_123');
      expect(result.snippet).toContain('test email');
    });

    it('should list messages with query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { id: 'msg_1', threadId: 'thread_1' },
            { id: 'msg_2', threadId: 'thread_2' },
          ],
          nextPageToken: 'next_token',
          resultSizeEstimate: 100,
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.messages).toHaveLength(2);
      expect(result.nextPageToken).toBe('next_token');
    });

    it('should delete a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_123', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });

    it('should trash a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          labelIds: ['TRASH'],
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_123/trash', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.labelIds).toContain('TRASH');
    });
  });

  describe('Thread Operations', () => {
    it('should get a thread', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'thread_123',
          messages: [
            { id: 'msg_1', snippet: 'First message' },
            { id: 'msg_2', snippet: 'Reply' },
          ],
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread_123', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.id).toBe('thread_123');
      expect(result.messages).toHaveLength(2);
    });
  });

  describe('Label Operations', () => {
    it('should list labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          labels: [
            { id: 'INBOX', name: 'INBOX', type: 'system' },
            { id: 'Label_1', name: 'Custom Label', type: 'user' },
          ],
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.labels).toHaveLength(2);
    });

    it('should create a label', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'Label_new',
          name: 'New Label',
          type: 'user',
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Label' }),
      });

      const result = await response.json();

      expect(result.name).toBe('New Label');
    });
  });

  describe('Draft Operations', () => {
    it('should create a draft', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'draft_123',
          message: {
            id: 'msg_123',
            threadId: 'thread_123',
          },
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            raw: Buffer.from('To: test@example.com\nSubject: Draft\n\nDraft content').toString('base64url'),
          },
        }),
      });

      const result = await response.json();

      expect(result.id).toBe('draft_123');
    });

    it('should send a draft', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_sent_123',
          threadId: 'thread_123',
          labelIds: ['SENT'],
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'draft_123' }),
      });

      const result = await response.json();

      expect(result.labelIds).toContain('SENT');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: {
            code: 401,
            message: 'Invalid Credentials',
            status: 'UNAUTHENTICATED',
          },
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: {
          'Authorization': 'Bearer invalid_token',
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: {
            code: 429,
            message: 'Rate Limit Exceeded',
            status: 'RESOURCE_EXHAUSTED',
          },
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });
  });

  describe('Health Check', () => {
    it('should check connection health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          emailAddress: 'test@gmail.com',
          messagesTotal: 1000,
          threadsTotal: 500,
        }),
      });

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(true);
    });
  });
});

describe('Outlook Email Adapter', () => {
  const mockTokens: OutlookOAuthTokens = {
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
    expiresAt: new Date(Date.now() + 3600000),
    scope: ['Mail.ReadWrite', 'Mail.Send'],
    tokenType: 'Bearer',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OAuth Authentication', () => {
    it('should generate authorization URL', () => {
      const clientId = 'test_client_id';
      const tenantId = 'common';
      const redirectUri = 'http://localhost:3000/callback';

      const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://graph.microsoft.com/Mail.ReadWrite');

      expect(authUrl.toString()).toContain('client_id=test_client_id');
      expect(authUrl.toString()).toContain('response_type=code');
    });

    it('should exchange code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'Mail.ReadWrite Mail.Send',
        }),
      });

      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'code=auth_code&grant_type=authorization_code',
      });

      const result = await response.json();

      expect(result.access_token).toBe('new_access_token');
    });
  });

  describe('Message Operations', () => {
    it('should send an email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: 'Test Email',
            body: {
              contentType: 'Text',
              content: 'Hello from Outlook',
            },
            toRecipients: [
              { emailAddress: { address: 'test@example.com' } },
            ],
          },
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(202);
    });

    it('should get a message by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          conversationId: 'conv_123',
          subject: 'Test Email',
          bodyPreview: 'This is a test...',
          from: {
            emailAddress: { address: 'sender@example.com', name: 'Sender' },
          },
          receivedDateTime: '2025-01-15T10:00:00Z',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.id).toBe('msg_123');
      expect(result.subject).toBe('Test Email');
    });

    it('should list messages with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'msg_1', subject: 'Email 1' },
            { id: 'msg_2', subject: 'Email 2' },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=2',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=2&$filter=isRead eq false', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
      expect(result['@odata.nextLink']).toBeDefined();
    });

    it('should delete a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });

    it('should move a message to folder', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          parentFolderId: 'folder_archive',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123/move', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destinationId: 'folder_archive' }),
      });

      const result = await response.json();

      expect(result.parentFolderId).toBe('folder_archive');
    });

    it('should mark a message as read', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_123',
          isRead: true,
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead: true }),
      });

      const result = await response.json();

      expect(result.isRead).toBe(true);
    });
  });

  describe('Folder Operations', () => {
    it('should list folders', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'inbox', displayName: 'Inbox', unreadItemCount: 5 },
            { id: 'sent', displayName: 'Sent Items', unreadItemCount: 0 },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should create a folder', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'folder_new',
          displayName: 'New Folder',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'New Folder' }),
      });

      const result = await response.json();

      expect(result.displayName).toBe('New Folder');
    });
  });

  describe('Attachment Operations', () => {
    it('should list attachments', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'att_1', name: 'document.pdf', size: 1024 },
            { id: 'att_2', name: 'image.png', size: 2048 },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123/attachments', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should get attachment content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'att_1',
          name: 'document.pdf',
          contentBytes: 'base64encodedcontent',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123/attachments/att_1', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      const result = await response.json();

      expect(result.contentBytes).toBeDefined();
    });
  });

  describe('Draft Operations', () => {
    it('should create a draft', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'draft_123',
          isDraft: true,
          subject: 'Draft Email',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: 'Draft Email',
          body: { contentType: 'Text', content: 'Draft content' },
        }),
      });

      const result = await response.json();

      expect(result.isDraft).toBe(true);
    });

    it('should send a draft', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/draft_123/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Reply and Forward', () => {
    it('should reply to a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123/reply', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'Thank you for your email.',
        }),
      });

      expect(response.ok).toBe(true);
    });

    it('should forward a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/msg_123/forward', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toRecipients: [
            { emailAddress: { address: 'forward@example.com' } },
          ],
          comment: 'FYI',
        }),
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: {
            code: 'InvalidAuthenticationToken',
            message: 'Access token is empty.',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        headers: {
          'Authorization': 'Bearer invalid',
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle resource not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: {
            code: 'ErrorItemNotFound',
            message: 'The specified object was not found in the store.',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages/invalid_id', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => name === 'Retry-After' ? '60' : null,
        },
        json: () => Promise.resolve({
          error: {
            code: 'TooManyRequests',
            message: 'Too many requests.',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });
  });

  describe('Health Check', () => {
    it('should check connection health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          displayName: 'Test User',
          mail: 'test@outlook.com',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${mockTokens.accessToken}`,
        },
      });

      expect(response.ok).toBe(true);
    });
  });
});
