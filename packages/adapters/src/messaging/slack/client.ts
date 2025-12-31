/**
 * Slack Messaging Adapter
 * Implements messaging operations via Slack Web API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://api.slack.com/web
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface SlackConfig {
  botToken: string;
  signingSecret?: string;
  appToken?: string; // For Socket Mode
}

export interface SlackUser {
  id: string;
  teamId: string;
  name: string;
  realName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  title?: string;
  statusText?: string;
  statusEmoji?: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBot: boolean;
  deleted: boolean;
  timezone?: string;
  image24?: string;
  image72?: string;
  image192?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  isGeneral: boolean;
  topic?: { value: string; creator: string; lastSet: number };
  purpose?: { value: string; creator: string; lastSet: number };
  memberCount?: number;
  created: number;
  creator: string;
}

export interface SlackMessage {
  ts: string;
  channelId: string;
  text: string;
  userId: string;
  username?: string;
  botId?: string;
  type: string;
  subtype?: string;
  threadTs?: string;
  replyCount?: number;
  replyUsersCount?: number;
  latestReply?: string;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
  files?: SlackFile[];
  edited?: { user: string; ts: string };
}

export interface SlackAttachment {
  id?: number;
  fallback?: string;
  color?: string;
  pretext?: string;
  authorName?: string;
  authorLink?: string;
  authorIcon?: string;
  title?: string;
  titleLink?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  imageUrl?: string;
  thumbUrl?: string;
  footer?: string;
  footerIcon?: string;
  ts?: number;
}

export interface SlackBlock {
  type: string;
  blockId?: string;
  text?: { type: string; text: string; emoji?: boolean };
  accessory?: Record<string, unknown>;
  elements?: Array<Record<string, unknown>>;
}

export interface SlackFile {
  id: string;
  name: string;
  title?: string;
  mimetype: string;
  size: number;
  urlPrivate?: string;
  urlPrivateDownload?: string;
  permalink?: string;
  permalinkPublic?: string;
}

export interface SlackReaction {
  name: string;
  channelId: string;
  messageTs: string;
}

export interface SlackPostMessageParams {
  channelId: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  mrkdwn?: boolean;
}

export interface PostMessageResult {
  ok: boolean;
  channelId: string;
  ts: string;
  message: SlackMessage;
}

export interface UpdateMessageParams {
  channelId: string;
  ts: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackWebhookEvent {
  type: string;
  token?: string;
  teamId?: string;
  apiAppId?: string;
  event?: Record<string, unknown>;
  eventId?: string;
  eventTime?: number;
  challenge?: string;
}

// ==================== Error Types ====================

export class SlackAuthenticationError extends DomainError {
  readonly code = 'SLACK_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class SlackRateLimitError extends DomainError {
  readonly code = 'SLACK_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SlackConnectionError extends DomainError {
  readonly code = 'SLACK_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class SlackNotFoundError extends DomainError {
  readonly code = 'SLACK_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

export class SlackInvalidRequestError extends DomainError {
  readonly code = 'SLACK_INVALID_REQUEST';
  readonly slackError?: string;

  constructor(message: string, slackError?: string) {
    super(message);
    this.slackError = slackError;
  }
}

// ==================== Adapter Interface ====================

export interface SlackMessagingPort {
  // Message Operations
  postMessage(params: SlackPostMessageParams): Promise<Result<PostMessageResult, DomainError>>;
  updateMessage(params: UpdateMessageParams): Promise<Result<PostMessageResult, DomainError>>;
  deleteMessage(channelId: string, ts: string): Promise<Result<void, DomainError>>;
  getMessage(channelId: string, ts: string): Promise<Result<SlackMessage | null, DomainError>>;
  getThreadReplies(channelId: string, threadTs: string): Promise<Result<SlackMessage[], DomainError>>;
  getChannelHistory(channelId: string, limit?: number, cursor?: string): Promise<Result<{ messages: SlackMessage[]; nextCursor?: string }, DomainError>>;

  // Reaction Operations
  addReaction(reaction: SlackReaction): Promise<Result<void, DomainError>>;
  removeReaction(reaction: SlackReaction): Promise<Result<void, DomainError>>;
  getReactions(channelId: string, ts: string): Promise<Result<Array<{ name: string; count: number; users: string[] }>, DomainError>>;

  // Channel Operations
  listChannels(excludeArchived?: boolean, limit?: number): Promise<Result<SlackChannel[], DomainError>>;
  getChannel(channelId: string): Promise<Result<SlackChannel | null, DomainError>>;
  createChannel(name: string, isPrivate?: boolean): Promise<Result<SlackChannel, DomainError>>;
  archiveChannel(channelId: string): Promise<Result<void, DomainError>>;
  unarchiveChannel(channelId: string): Promise<Result<void, DomainError>>;
  joinChannel(channelId: string): Promise<Result<SlackChannel, DomainError>>;
  leaveChannel(channelId: string): Promise<Result<void, DomainError>>;
  inviteToChannel(channelId: string, userIds: string[]): Promise<Result<void, DomainError>>;
  kickFromChannel(channelId: string, userId: string): Promise<Result<void, DomainError>>;
  setChannelTopic(channelId: string, topic: string): Promise<Result<void, DomainError>>;
  setChannelPurpose(channelId: string, purpose: string): Promise<Result<void, DomainError>>;

  // User Operations
  listUsers(limit?: number, cursor?: string): Promise<Result<{ users: SlackUser[]; nextCursor?: string }, DomainError>>;
  getUser(userId: string): Promise<Result<SlackUser | null, DomainError>>;
  getUserByEmail(email: string): Promise<Result<SlackUser | null, DomainError>>;

  // Direct Message Operations
  openDirectMessage(userId: string): Promise<Result<SlackChannel, DomainError>>;
  openGroupDirectMessage(userIds: string[]): Promise<Result<SlackChannel, DomainError>>;

  // File Operations
  uploadFile(params: { channels: string[]; filename: string; content: string | Buffer; title?: string; initialComment?: string }): Promise<Result<SlackFile, DomainError>>;
  deleteFile(fileId: string): Promise<Result<void, DomainError>>;

  // Webhook Verification
  verifyWebhookSignature(signature: string, timestamp: string, body: string): boolean;
  parseWebhookEvent(body: string): Result<SlackWebhookEvent, DomainError>;

  // Health Check
  checkConnection(): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * Slack Messaging Adapter
 * Implements messaging operations via Slack Web API
 */
export class SlackAdapter implements SlackMessagingPort {
  private config: SlackConfig;
  private readonly apiBaseUrl = 'https://slack.com/api';

  constructor(config: SlackConfig) {
    this.config = config;
  }

  // ==================== Message Operations ====================

  async postMessage(params: SlackPostMessageParams): Promise<Result<PostMessageResult, DomainError>> {
    try {
      const body: Record<string, unknown> = {
        channel: params.channelId,
        text: params.text,
        mrkdwn: params.mrkdwn ?? true,
      };

      if (params.blocks) body.blocks = params.blocks;
      if (params.attachments) body.attachments = params.attachments;
      if (params.threadTs) body.thread_ts = params.threadTs;
      if (params.replyBroadcast) body.reply_broadcast = params.replyBroadcast;
      if (params.unfurlLinks !== undefined) body.unfurl_links = params.unfurlLinks;
      if (params.unfurlMedia !== undefined) body.unfurl_media = params.unfurlMedia;

      const response = await this.makeRequest('POST', '/chat.postMessage', body);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        ok: true,
        channelId: String(response.value.channel ?? ''),
        ts: String(response.value.ts ?? ''),
        message: this.mapToMessage(response.value.message as Record<string, unknown>),
      });
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateMessage(params: UpdateMessageParams): Promise<Result<PostMessageResult, DomainError>> {
    try {
      const body: Record<string, unknown> = {
        channel: params.channelId,
        ts: params.ts,
        text: params.text,
      };

      if (params.blocks) body.blocks = params.blocks;
      if (params.attachments) body.attachments = params.attachments;

      const response = await this.makeRequest('POST', '/chat.update', body);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        ok: true,
        channelId: String(response.value.channel ?? ''),
        ts: String(response.value.ts ?? ''),
        message: this.mapToMessage(response.value.message as Record<string, unknown>),
      });
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteMessage(channelId: string, ts: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/chat.delete', {
        channel: channelId,
        ts,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getMessage(
    channelId: string,
    ts: string
  ): Promise<Result<SlackMessage | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/conversations.history', {
        channel: channelId,
        latest: ts,
        limit: 1,
        inclusive: true,
      });

      if (response.isFailure) {
        if (response.error.code === 'SLACK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      const messages = (response.value.messages as Array<Record<string, unknown>>) ?? [];
      if (messages.length === 0) {
        return Result.ok(null);
      }

      return Result.ok(this.mapToMessage(messages[0]));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getThreadReplies(
    channelId: string,
    threadTs: string
  ): Promise<Result<SlackMessage[], DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/conversations.replies', {
        channel: channelId,
        ts: threadTs,
      });

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.messages as Array<Record<string, unknown>>) ?? []).map(
        (m) => this.mapToMessage(m)
      );
      return Result.ok(messages);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChannelHistory(
    channelId: string,
    limit: number = 100,
    cursor?: string
  ): Promise<Result<{ messages: SlackMessage[]; nextCursor?: string }, DomainError>> {
    try {
      const params: Record<string, unknown> = {
        channel: channelId,
        limit,
      };

      if (cursor) params.cursor = cursor;

      const response = await this.makeRequest('GET', '/conversations.history', params);

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.messages as Array<Record<string, unknown>>) ?? []).map(
        (m) => this.mapToMessage(m)
      );
      const metadata = response.value.response_metadata as Record<string, unknown> | undefined;

      return Result.ok({
        messages,
        nextCursor: metadata?.next_cursor ? String(metadata.next_cursor) : undefined,
      });
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Reaction Operations ====================

  async addReaction(reaction: SlackReaction): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/reactions.add', {
        channel: reaction.channelId,
        timestamp: reaction.messageTs,
        name: reaction.name,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async removeReaction(reaction: SlackReaction): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/reactions.remove', {
        channel: reaction.channelId,
        timestamp: reaction.messageTs,
        name: reaction.name,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getReactions(
    channelId: string,
    ts: string
  ): Promise<Result<Array<{ name: string; count: number; users: string[] }>, DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/reactions.get', {
        channel: channelId,
        timestamp: ts,
      });

      if (response.isFailure) return Result.fail(response.error);

      const message = response.value.message as Record<string, unknown>;
      const reactions = (message?.reactions as Array<Record<string, unknown>>) ?? [];

      return Result.ok(
        reactions.map((r) => ({
          name: String(r.name ?? ''),
          count: Number(r.count ?? 0),
          users: (r.users as string[]) ?? [],
        }))
      );
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Channel Operations ====================

  async listChannels(
    excludeArchived: boolean = true,
    limit: number = 100
  ): Promise<Result<SlackChannel[], DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/conversations.list', {
        exclude_archived: excludeArchived,
        limit,
        types: 'public_channel,private_channel',
      });

      if (response.isFailure) return Result.fail(response.error);

      const channels = ((response.value.channels as Array<Record<string, unknown>>) ?? []).map(
        (c) => this.mapToChannel(c)
      );
      return Result.ok(channels);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChannel(channelId: string): Promise<Result<SlackChannel | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/conversations.info', {
        channel: channelId,
      });

      if (response.isFailure) {
        if (response.error.code === 'SLACK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToChannel(response.value.channel as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createChannel(
    name: string,
    isPrivate: boolean = false
  ): Promise<Result<SlackChannel, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.create', {
        name,
        is_private: isPrivate,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChannel(response.value.channel as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async archiveChannel(channelId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.archive', {
        channel: channelId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async unarchiveChannel(channelId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.unarchive', {
        channel: channelId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async joinChannel(channelId: string): Promise<Result<SlackChannel, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.join', {
        channel: channelId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChannel(response.value.channel as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async leaveChannel(channelId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.leave', {
        channel: channelId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async inviteToChannel(channelId: string, userIds: string[]): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.invite', {
        channel: channelId,
        users: userIds.join(','),
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async kickFromChannel(channelId: string, userId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.kick', {
        channel: channelId,
        user: userId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async setChannelTopic(channelId: string, topic: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.setTopic', {
        channel: channelId,
        topic,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async setChannelPurpose(channelId: string, purpose: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.setPurpose', {
        channel: channelId,
        purpose,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== User Operations ====================

  async listUsers(
    limit: number = 100,
    cursor?: string
  ): Promise<Result<{ users: SlackUser[]; nextCursor?: string }, DomainError>> {
    try {
      const params: Record<string, unknown> = { limit };
      if (cursor) params.cursor = cursor;

      const response = await this.makeRequest('GET', '/users.list', params);

      if (response.isFailure) return Result.fail(response.error);

      const users = ((response.value.members as Array<Record<string, unknown>>) ?? []).map((u) =>
        this.mapToUser(u)
      );
      const metadata = response.value.response_metadata as Record<string, unknown> | undefined;

      return Result.ok({
        users,
        nextCursor: metadata?.next_cursor ? String(metadata.next_cursor) : undefined,
      });
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getUser(userId: string): Promise<Result<SlackUser | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/users.info', { user: userId });

      if (response.isFailure) {
        if (response.error.code === 'SLACK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToUser(response.value.user as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getUserByEmail(email: string): Promise<Result<SlackUser | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', '/users.lookupByEmail', { email });

      if (response.isFailure) {
        if (response.error.code === 'SLACK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToUser(response.value.user as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Direct Message Operations ====================

  async openDirectMessage(userId: string): Promise<Result<SlackChannel, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.open', {
        users: userId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChannel(response.value.channel as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async openGroupDirectMessage(userIds: string[]): Promise<Result<SlackChannel, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/conversations.open', {
        users: userIds.join(','),
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChannel(response.value.channel as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== File Operations ====================

  async uploadFile(params: {
    channels: string[];
    filename: string;
    content: string | Buffer;
    title?: string;
    initialComment?: string;
  }): Promise<Result<SlackFile, DomainError>> {
    try {
      const formData = new FormData();
      formData.append('channels', params.channels.join(','));
      formData.append('filename', params.filename);

      if (typeof params.content === 'string') {
        formData.append('content', params.content);
      } else {
        formData.append('file', new Blob([params.content]), params.filename);
      }

      if (params.title) formData.append('title', params.title);
      if (params.initialComment) formData.append('initial_comment', params.initialComment);

      const response = await fetch(`${this.apiBaseUrl}/files.upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.botToken}`,
        },
        body: formData,
      });

      const data = (await response.json()) as { ok: boolean; error?: string; file?: Record<string, unknown> };

      if (!data.ok) {
        return Result.fail(new SlackInvalidRequestError(data.error ?? 'File upload failed', data.error));
      }

      return Result.ok(this.mapToFile(data.file as Record<string, unknown>));
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteFile(fileId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', '/files.delete', { file: fileId });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Webhook Verification ====================

  verifyWebhookSignature(signature: string, timestamp: string, body: string): boolean {
    if (!this.config.signingSecret) return false;

    const crypto = require('crypto');
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;

    if (parseInt(timestamp) < fiveMinutesAgo) {
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = `v0=${crypto
      .createHmac('sha256', this.config.signingSecret)
      .update(sigBasestring)
      .digest('hex')}`;

    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  }

  parseWebhookEvent(body: string): Result<SlackWebhookEvent, DomainError> {
    try {
      const event = JSON.parse(body);

      return Result.ok({
        type: event.type,
        token: event.token,
        teamId: event.team_id,
        apiAppId: event.api_app_id,
        event: event.event,
        eventId: event.event_id,
        eventTime: event.event_time,
        challenge: event.challenge,
      });
    } catch (error) {
      return Result.fail(
        new SlackInvalidRequestError(
          error instanceof Error ? error.message : 'Invalid webhook payload'
        )
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    const start = Date.now();

    try {
      const response = await this.makeRequest('GET', '/auth.test', {});
      const latencyMs = Date.now() - start;

      if (response.isFailure) {
        return Result.ok({
          status: 'unhealthy',
          latencyMs,
        });
      }

      return Result.ok({
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        latencyMs,
      });
    } catch (error) {
      return Result.ok({
        status: 'unhealthy',
        latencyMs: Date.now() - start,
      });
    }
  }

  // ==================== Private Helpers ====================

  private async makeRequest(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    let url = `${this.apiBaseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    };

    if (method === 'GET' && params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.set(key, String(value));
        }
      });
      url += `?${queryParams}`;
    } else if (params) {
      options.body = JSON.stringify(params);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as Record<string, unknown> & { ok: boolean; error?: string };

    if (!data.ok) {
      return this.handleErrorResponse(data.error as string);
    }

    return Result.ok(data as Record<string, unknown>);
  }

  private handleErrorResponse(error: string): Result<Record<string, unknown>, DomainError> {
    switch (error) {
      case 'invalid_auth':
      case 'not_authed':
      case 'account_inactive':
      case 'token_revoked':
        return Result.fail(new SlackAuthenticationError(error));
      case 'channel_not_found':
      case 'user_not_found':
      case 'message_not_found':
        return Result.fail(new SlackNotFoundError('Resource', error));
      case 'ratelimited':
        return Result.fail(new SlackRateLimitError(60));
      default:
        return Result.fail(new SlackInvalidRequestError(error, error));
    }
  }

  private mapToMessage(data: Record<string, unknown>): SlackMessage {
    return {
      ts: String(data.ts ?? ''),
      channelId: String(data.channel ?? ''),
      text: String(data.text ?? ''),
      userId: String(data.user ?? ''),
      username: data.username ? String(data.username) : undefined,
      botId: data.bot_id ? String(data.bot_id) : undefined,
      type: String(data.type ?? 'message'),
      subtype: data.subtype ? String(data.subtype) : undefined,
      threadTs: data.thread_ts ? String(data.thread_ts) : undefined,
      replyCount: data.reply_count ? Number(data.reply_count) : undefined,
      replyUsersCount: data.reply_users_count ? Number(data.reply_users_count) : undefined,
      latestReply: data.latest_reply ? String(data.latest_reply) : undefined,
      reactions: data.reactions as SlackMessage['reactions'],
      attachments: data.attachments as SlackAttachment[] | undefined,
      blocks: data.blocks as SlackBlock[] | undefined,
      files: data.files
        ? ((data.files as Array<Record<string, unknown>>).map((f) => this.mapToFile(f)))
        : undefined,
      edited: data.edited
        ? {
            user: String((data.edited as Record<string, unknown>).user ?? ''),
            ts: String((data.edited as Record<string, unknown>).ts ?? ''),
          }
        : undefined,
    };
  }

  private mapToChannel(data: Record<string, unknown>): SlackChannel {
    const topic = data.topic as Record<string, unknown> | undefined;
    const purpose = data.purpose as Record<string, unknown> | undefined;

    return {
      id: String(data.id ?? ''),
      name: String(data.name ?? ''),
      isChannel: Boolean(data.is_channel),
      isPrivate: Boolean(data.is_private),
      isArchived: Boolean(data.is_archived),
      isMember: Boolean(data.is_member),
      isGeneral: Boolean(data.is_general),
      topic: topic
        ? {
            value: String(topic.value ?? ''),
            creator: String(topic.creator ?? ''),
            lastSet: Number(topic.last_set ?? 0),
          }
        : undefined,
      purpose: purpose
        ? {
            value: String(purpose.value ?? ''),
            creator: String(purpose.creator ?? ''),
            lastSet: Number(purpose.last_set ?? 0),
          }
        : undefined,
      memberCount: data.num_members ? Number(data.num_members) : undefined,
      created: Number(data.created ?? 0),
      creator: String(data.creator ?? ''),
    };
  }

  private mapToUser(data: Record<string, unknown>): SlackUser {
    const profile = (data.profile as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      teamId: String(data.team_id ?? ''),
      name: String(data.name ?? ''),
      realName: profile.real_name ? String(profile.real_name) : undefined,
      displayName: profile.display_name ? String(profile.display_name) : undefined,
      email: profile.email ? String(profile.email) : undefined,
      phone: profile.phone ? String(profile.phone) : undefined,
      title: profile.title ? String(profile.title) : undefined,
      statusText: profile.status_text ? String(profile.status_text) : undefined,
      statusEmoji: profile.status_emoji ? String(profile.status_emoji) : undefined,
      isAdmin: Boolean(data.is_admin),
      isOwner: Boolean(data.is_owner),
      isBot: Boolean(data.is_bot),
      deleted: Boolean(data.deleted),
      timezone: data.tz ? String(data.tz) : undefined,
      image24: profile.image_24 ? String(profile.image_24) : undefined,
      image72: profile.image_72 ? String(profile.image_72) : undefined,
      image192: profile.image_192 ? String(profile.image_192) : undefined,
    };
  }

  private mapToFile(data: Record<string, unknown>): SlackFile {
    return {
      id: String(data.id ?? ''),
      name: String(data.name ?? ''),
      title: data.title ? String(data.title) : undefined,
      mimetype: String(data.mimetype ?? 'application/octet-stream'),
      size: Number(data.size ?? 0),
      urlPrivate: data.url_private ? String(data.url_private) : undefined,
      urlPrivateDownload: data.url_private_download ? String(data.url_private_download) : undefined,
      permalink: data.permalink ? String(data.permalink) : undefined,
      permalinkPublic: data.permalink_public ? String(data.permalink_public) : undefined,
    };
  }
}

export default SlackAdapter;
