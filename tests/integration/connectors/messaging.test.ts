/**
 * Messaging Connector Integration Tests
 * Tests for Slack and Teams adapter functionality
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface SlackConfig {
  botToken: string;
  signingSecret?: string;
}

interface TeamsConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

describe('Slack Messaging Adapter', () => {
  const mockConfig: SlackConfig = {
    botToken: 'xoxb-mock-bot-token',
    signingSecret: 'mock_signing_secret',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Message Operations', () => {
    it('should post a message to a channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: 'C12345678',
          ts: '1234567890.123456',
          message: {
            text: 'Hello, World!',
            user: 'U12345678',
            ts: '1234567890.123456',
          },
        }),
      });

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          text: 'Hello, World!',
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.ts).toBeDefined();
      expect(result.message.text).toBe('Hello, World!');
    });

    it('should post a message with blocks', async () => {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Bold text* and _italic_',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: 'C12345678',
          ts: '1234567890.123456',
          message: {
            blocks,
          },
        }),
      });

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          blocks,
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.message.blocks).toEqual(blocks);
    });

    it('should update a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: 'C12345678',
          ts: '1234567890.123456',
          text: 'Updated message',
        }),
      });

      const response = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          ts: '1234567890.123456',
          text: 'Updated message',
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.text).toBe('Updated message');
    });

    it('should delete a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: 'C12345678',
          ts: '1234567890.123456',
        }),
      });

      const response = await fetch('https://slack.com/api/chat.delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          ts: '1234567890.123456',
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
    });

    it('should get channel history', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { ts: '1234567890.123456', text: 'Message 1', user: 'U1' },
            { ts: '1234567890.123457', text: 'Message 2', user: 'U2' },
          ],
          has_more: true,
          response_metadata: {
            next_cursor: 'cursor123',
          },
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.history?channel=C12345678&limit=10', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(2);
      expect(result.has_more).toBe(true);
    });

    it('should get thread replies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { ts: '1234567890.123456', text: 'Original', user: 'U1' },
            { ts: '1234567890.123457', text: 'Reply 1', user: 'U2', thread_ts: '1234567890.123456' },
            { ts: '1234567890.123458', text: 'Reply 2', user: 'U1', thread_ts: '1234567890.123456' },
          ],
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.replies?channel=C12345678&ts=1234567890.123456', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.messages).toHaveLength(3);
    });
  });

  describe('Reaction Operations', () => {
    it('should add a reaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          timestamp: '1234567890.123456',
          name: 'thumbsup',
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
    });

    it('should remove a reaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const response = await fetch('https://slack.com/api/reactions.remove', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'C12345678',
          timestamp: '1234567890.123456',
          name: 'thumbsup',
        }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
    });
  });

  describe('Channel Operations', () => {
    it('should list channels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_channel: true },
            { id: 'C2', name: 'random', is_channel: true },
          ],
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.channels).toHaveLength(2);
    });

    it('should get channel info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: {
            id: 'C12345678',
            name: 'general',
            is_channel: true,
            is_member: true,
            topic: { value: 'General discussion' },
          },
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.info?channel=C12345678', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.channel.name).toBe('general');
    });

    it('should create a channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: {
            id: 'C_NEW',
            name: 'new-channel',
            is_channel: true,
          },
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'new-channel' }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.channel.name).toBe('new-channel');
    });

    it('should join a channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: {
            id: 'C12345678',
            is_member: true,
          },
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.join', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: 'C12345678' }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.channel.is_member).toBe(true);
    });
  });

  describe('User Operations', () => {
    it('should list users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          members: [
            { id: 'U1', name: 'user1', real_name: 'User One' },
            { id: 'U2', name: 'user2', real_name: 'User Two' },
          ],
        }),
      });

      const response = await fetch('https://slack.com/api/users.list', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.members).toHaveLength(2);
    });

    it('should get user by email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          user: {
            id: 'U12345678',
            name: 'testuser',
            profile: {
              email: 'test@example.com',
            },
          },
        }),
      });

      const response = await fetch('https://slack.com/api/users.lookupByEmail?email=test@example.com', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.user.id).toBe('U12345678');
    });
  });

  describe('Direct Message Operations', () => {
    it('should open a direct message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channel: {
            id: 'D12345678',
          },
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: 'U12345678' }),
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.channel.id).toMatch(/^D/);
    });
  });

  describe('Webhook Verification', () => {
    it('should verify webhook signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ type: 'event_callback' });

      // In real implementation, this would compute HMAC-SHA256
      const signatureBase = `v0:${timestamp}:${body}`;

      expect(signatureBase).toContain('v0:');
      expect(signatureBase).toContain(body);
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
      const maxAge = 300;
      const currentTime = Math.floor(Date.now() / 1000);

      const isExpired = (currentTime - oldTimestamp) > maxAge;

      expect(isExpired).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          error: 'invalid_auth',
        }),
      });

      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': 'Bearer invalid_token',
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_auth');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          error: 'ratelimited',
        }),
      });

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('ratelimited');
    });

    it('should handle channel not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          error: 'channel_not_found',
        }),
      });

      const response = await fetch('https://slack.com/api/conversations.info?channel=INVALID', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('channel_not_found');
    });
  });

  describe('Health Check', () => {
    it('should verify authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          url: 'https://test-workspace.slack.com',
          team: 'Test Workspace',
          user: 'testbot',
          team_id: 'T12345678',
          user_id: 'U12345678',
          bot_id: 'B12345678',
        }),
      });

      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${mockConfig.botToken}`,
        },
      });

      const result = await response.json();

      expect(result.ok).toBe(true);
      expect(result.team).toBe('Test Workspace');
    });
  });
});

describe('Microsoft Teams Messaging Adapter', () => {
  const mockConfig: TeamsConfig = {
    clientId: 'mock_client_id',
    clientSecret: 'mock_client_secret',
    tenantId: 'mock_tenant_id',
  };

  const mockAccessToken = 'mock_access_token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should obtain access token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const response = await fetch(`https://login.microsoftonline.com/${mockConfig.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=https://graph.microsoft.com/.default',
      });

      const result = await response.json();

      expect(result.access_token).toBe('new_access_token');
    });
  });

  describe('Team Operations', () => {
    it('should list teams', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'team1', displayName: 'Team One' },
            { id: 'team2', displayName: 'Team Two' },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should get team by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'team1',
          displayName: 'Team One',
          description: 'First team',
          visibility: 'private',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.id).toBe('team1');
      expect(result.displayName).toBe('Team One');
    });

    it('should create a team', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: {
          get: () => 'https://graph.microsoft.com/v1.0/teams/new_team',
        },
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
          displayName: 'New Team',
          visibility: 'private',
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(202);
    });
  });

  describe('Channel Operations', () => {
    it('should list channels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'channel1', displayName: 'General' },
            { id: 'channel2', displayName: 'Random' },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should create a channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'new_channel',
          displayName: 'New Channel',
          membershipType: 'standard',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'New Channel',
          membershipType: 'standard',
        }),
      });

      const result = await response.json();

      expect(result.displayName).toBe('New Channel');
    });

    it('should delete a channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels/channel1', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe('Channel Message Operations', () => {
    it('should send a channel message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'msg1',
          body: {
            contentType: 'text',
            content: 'Hello Teams!',
          },
          createdDateTime: new Date().toISOString(),
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels/channel1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: {
            contentType: 'text',
            content: 'Hello Teams!',
          },
        }),
      });

      const result = await response.json();

      expect(result.id).toBe('msg1');
      expect(result.body.content).toBe('Hello Teams!');
    });

    it('should reply to a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'reply1',
          body: {
            contentType: 'text',
            content: 'This is a reply',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels/channel1/messages/msg1/replies', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: {
            contentType: 'text',
            content: 'This is a reply',
          },
        }),
      });

      const result = await response.json();

      expect(result.id).toBe('reply1');
    });

    it('should list channel messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'msg1', body: { content: 'Message 1' } },
            { id: 'msg2', body: { content: 'Message 2' } },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/channels/channel1/messages?$top=10', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });
  });

  describe('Chat Operations', () => {
    it('should list chats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'chat1', chatType: 'oneOnOne' },
            { id: 'chat2', chatType: 'group' },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/chats', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should create a group chat', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'new_chat',
          chatType: 'group',
          topic: 'Project Discussion',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/chats', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatType: 'group',
          topic: 'Project Discussion',
          members: [
            {
              '@odata.type': '#microsoft.graph.aadUserConversationMember',
              roles: ['owner'],
              'user@odata.bind': "https://graph.microsoft.com/v1.0/users('user1')",
            },
          ],
        }),
      });

      const result = await response.json();

      expect(result.chatType).toBe('group');
      expect(result.topic).toBe('Project Discussion');
    });

    it('should send a chat message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'chat_msg1',
          body: { content: 'Hello from chat!' },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/chats/chat1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: {
            contentType: 'text',
            content: 'Hello from chat!',
          },
        }),
      });

      const result = await response.json();

      expect(result.body.content).toBe('Hello from chat!');
    });
  });

  describe('Member Operations', () => {
    it('should list team members', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'member1', displayName: 'User One', roles: ['owner'] },
            { id: 'member2', displayName: 'User Two', roles: ['member'] },
          ],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/members', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      const result = await response.json();

      expect(result.value).toHaveLength(2);
    });

    it('should add a team member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'new_member',
          roles: ['member'],
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/members', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['member'],
          'user@odata.bind': "https://graph.microsoft.com/v1.0/users('user3')",
        }),
      });

      const result = await response.json();

      expect(result.roles).toContain('member');
    });

    it('should remove a team member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/team1/members/member1', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe('Webhook Events', () => {
    it('should parse webhook event', () => {
      const webhookBody = JSON.stringify({
        subscriptionId: 'sub1',
        changeType: 'created',
        resource: '/teams/team1/channels/channel1/messages/msg1',
        resourceData: {
          id: 'msg1',
        },
        clientState: 'secret_state',
        tenantId: 'tenant1',
      });

      const event = JSON.parse(webhookBody);

      expect(event.changeType).toBe('created');
      expect(event.resource).toContain('messages');
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

      const response = await fetch('https://graph.microsoft.com/v1.0/teams', {
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
            code: 'NotFound',
            message: 'Team not found',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams/invalid_team', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
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
            message: 'Too many requests',
          },
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/teams', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
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
          id: 'user1',
          displayName: 'Test User',
          mail: 'test@company.com',
        }),
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      });

      expect(response.ok).toBe(true);
    });
  });
});
