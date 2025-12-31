/**
 * Slack Messaging Adapter Integration Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackAdapter, SlackConfig } from '../../../packages/adapters/src/messaging/slack/client';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;
  let config: SlackConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      botToken: 'xoxb-test-token',
      signingSecret: 'test-signing-secret',
    };

    adapter = new SlackAdapter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('postMessage', () => {
    it('should post message successfully', async () => {
      const mockResponse = {
        ok: true,
        channel: 'C123456',
        ts: '1234567890.123456',
        message: {
          ts: '1234567890.123456',
          text: 'Hello, World!',
          user: 'U123456',
          type: 'message',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.postMessage({
        channelId: 'C123456',
        text: 'Hello, World!',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.channelId).toBe('C123456');
      expect(result.value?.ts).toBe('1234567890.123456');
    });

    it('should post message with blocks', async () => {
      const blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Bold text*' },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          channel: 'C123456',
          ts: '1234567890.123456',
          message: { ts: '1234567890.123456', text: 'Bold text', type: 'message' },
        }),
      });

      const result = await adapter.postMessage({
        channelId: 'C123456',
        text: 'Bold text',
        blocks,
      });

      expect(result.isSuccess).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat.postMessage'),
        expect.objectContaining({
          body: expect.stringContaining('blocks'),
        })
      );
    });

    it('should handle channel not found error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'channel_not_found',
        }),
      });

      const result = await adapter.postMessage({
        channelId: 'INVALID',
        text: 'Hello',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('SLACK_NOT_FOUND');
    });
  });

  describe('updateMessage', () => {
    it('should update message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          channel: 'C123456',
          ts: '1234567890.123456',
          message: { ts: '1234567890.123456', text: 'Updated!', type: 'message' },
        }),
      });

      const result = await adapter.updateMessage({
        channelId: 'C123456',
        ts: '1234567890.123456',
        text: 'Updated!',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.message.text).toBe('Updated!');
    });
  });

  describe('deleteMessage', () => {
    it('should delete message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const result = await adapter.deleteMessage('C123456', '1234567890.123456');

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('getChannelHistory', () => {
    it('should return channel messages with pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          messages: [
            { ts: '1234567890.123456', text: 'Message 1', user: 'U1', type: 'message' },
            { ts: '1234567890.123457', text: 'Message 2', user: 'U2', type: 'message' },
          ],
          response_metadata: {
            next_cursor: 'next_page_token',
          },
        }),
      });

      const result = await adapter.getChannelHistory('C123456', 10);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.messages).toHaveLength(2);
      expect(result.value?.nextCursor).toBe('next_page_token');
    });
  });

  describe('addReaction', () => {
    it('should add reaction successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const result = await adapter.addReaction({
        name: 'thumbsup',
        channelId: 'C123456',
        messageTs: '1234567890.123456',
      });

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('listChannels', () => {
    it('should list channels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          channels: [
            { id: 'C1', name: 'general', is_channel: true, is_private: false },
            { id: 'C2', name: 'random', is_channel: true, is_private: false },
          ],
        }),
      });

      const result = await adapter.listChannels();

      expect(result.isSuccess).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(result.value?.[0].name).toBe('general');
    });
  });

  describe('createChannel', () => {
    it('should create channel successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          channel: {
            id: 'C123456',
            name: 'new-channel',
            is_channel: true,
            is_private: false,
          },
        }),
      });

      const result = await adapter.createChannel('new-channel');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.name).toBe('new-channel');
    });
  });

  describe('getUser', () => {
    it('should return user info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          user: {
            id: 'U123456',
            name: 'testuser',
            profile: {
              real_name: 'Test User',
              email: 'test@example.com',
            },
            is_admin: false,
            is_owner: false,
            is_bot: false,
            deleted: false,
          },
        }),
      });

      const result = await adapter.getUser('U123456');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.name).toBe('testuser');
      expect(result.value?.email).toBe('test@example.com');
    });
  });

  describe('getUserByEmail', () => {
    it('should find user by email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          user: {
            id: 'U123456',
            name: 'testuser',
            profile: { email: 'test@example.com' },
          },
        }),
      });

      const result = await adapter.getUserByEmail('test@example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('U123456');
    });
  });

  describe('openDirectMessage', () => {
    it('should open DM channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          channel: {
            id: 'D123456',
            is_im: true,
          },
        }),
      });

      const result = await adapter.openDirectMessage('U123456');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.id).toBe('D123456');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = '{"test": "data"}';

      const crypto = require('crypto');
      const sigBasestring = `v0:${timestamp}:${body}`;
      const signature = `v0=${crypto
        .createHmac('sha256', 'test-signing-secret')
        .update(sigBasestring)
        .digest('hex')}`;

      const isValid = adapter.verifyWebhookSignature(signature, timestamp, body);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const isValid = adapter.verifyWebhookSignature(
        'v0=invalid',
        String(Math.floor(Date.now() / 1000)),
        '{}'
      );

      expect(isValid).toBe(false);
    });

    it('should reject old timestamps', () => {
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes ago

      const isValid = adapter.verifyWebhookSignature('v0=sig', oldTimestamp, '{}');

      expect(isValid).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse valid event', () => {
      const event = JSON.stringify({
        type: 'event_callback',
        team_id: 'T123456',
        api_app_id: 'A123456',
        event: {
          type: 'message',
          text: 'Hello',
        },
        event_id: 'Ev123456',
        event_time: 1234567890,
      });

      const result = adapter.parseWebhookEvent(event);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.type).toBe('event_callback');
      expect(result.value?.event?.type).toBe('message');
    });

    it('should handle URL verification challenge', () => {
      const event = JSON.stringify({
        type: 'url_verification',
        challenge: 'challenge_token',
      });

      const result = adapter.parseWebhookEvent(event);

      expect(result.isSuccess).toBe(true);
      expect(result.value?.challenge).toBe('challenge_token');
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          team: 'Test Team',
          user: 'testbot',
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('healthy');
    });

    it('should return unhealthy on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'invalid_auth',
        }),
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('unhealthy');
    });
  });
});
