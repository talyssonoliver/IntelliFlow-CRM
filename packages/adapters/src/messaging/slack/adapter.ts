/**
 * Slack Messaging Adapter
 * Facade class that delegates to handler modules
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://api.slack.com/web
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  SlackConfig,
  SlackUser,
  SlackChannel,
  SlackMessage,
  SlackFile,
  SlackReaction,
  SlackPostMessageParams,
  PostMessageResult,
  UpdateMessageParams,
  SlackWebhookEvent,
  UploadFileParams,
} from './types';
import * as handlers from './handlers';

/**
 * Port interface for Slack messaging operations
 */
export interface SlackMessagingPort {
  // Message Operations
  postMessage(params: SlackPostMessageParams): Promise<Result<PostMessageResult, DomainError>>;
  updateMessage(params: UpdateMessageParams): Promise<Result<PostMessageResult, DomainError>>;
  deleteMessage(channelId: string, ts: string): Promise<Result<void, DomainError>>;
  getMessage(channelId: string, ts: string): Promise<Result<SlackMessage | null, DomainError>>;
  getThreadReplies(
    channelId: string,
    threadTs: string
  ): Promise<Result<SlackMessage[], DomainError>>;
  getChannelHistory(
    channelId: string,
    limit?: number,
    cursor?: string
  ): Promise<Result<{ messages: SlackMessage[]; nextCursor?: string }, DomainError>>;

  // Reaction Operations
  addReaction(reaction: SlackReaction): Promise<Result<void, DomainError>>;
  removeReaction(reaction: SlackReaction): Promise<Result<void, DomainError>>;
  getReactions(
    channelId: string,
    ts: string
  ): Promise<Result<Array<{ name: string; count: number; users: string[] }>, DomainError>>;

  // Channel Operations
  listChannels(
    excludeArchived?: boolean,
    limit?: number
  ): Promise<Result<SlackChannel[], DomainError>>;
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
  listUsers(
    limit?: number,
    cursor?: string
  ): Promise<Result<{ users: SlackUser[]; nextCursor?: string }, DomainError>>;
  getUser(userId: string): Promise<Result<SlackUser | null, DomainError>>;
  getUserByEmail(email: string): Promise<Result<SlackUser | null, DomainError>>;

  // Direct Message Operations
  openDirectMessage(userId: string): Promise<Result<SlackChannel, DomainError>>;
  openGroupDirectMessage(userIds: string[]): Promise<Result<SlackChannel, DomainError>>;

  // File Operations
  uploadFile(params: UploadFileParams): Promise<Result<SlackFile, DomainError>>;
  deleteFile(fileId: string): Promise<Result<void, DomainError>>;

  // Webhook Verification
  verifyWebhookSignature(signature: string, timestamp: string, body: string): boolean;
  parseWebhookEvent(body: string): Result<SlackWebhookEvent, DomainError>;

  // Health Check
  checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  >;
}

/**
 * Slack Messaging Adapter
 * Implements messaging operations via Slack Web API
 */
export class SlackAdapter implements SlackMessagingPort {
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  // ==================== Message Operations ====================

  async postMessage(
    params: SlackPostMessageParams
  ): Promise<Result<PostMessageResult, DomainError>> {
    return handlers.postMessage(this.config, params);
  }

  async updateMessage(
    params: UpdateMessageParams
  ): Promise<Result<PostMessageResult, DomainError>> {
    return handlers.updateMessage(this.config, params);
  }

  async deleteMessage(channelId: string, ts: string): Promise<Result<void, DomainError>> {
    return handlers.deleteMessage(this.config, channelId, ts);
  }

  async getMessage(
    channelId: string,
    ts: string
  ): Promise<Result<SlackMessage | null, DomainError>> {
    return handlers.getMessage(this.config, channelId, ts);
  }

  async getThreadReplies(
    channelId: string,
    threadTs: string
  ): Promise<Result<SlackMessage[], DomainError>> {
    return handlers.getThreadReplies(this.config, channelId, threadTs);
  }

  async getChannelHistory(
    channelId: string,
    limit: number = 100,
    cursor?: string
  ): Promise<Result<{ messages: SlackMessage[]; nextCursor?: string }, DomainError>> {
    return handlers.getChannelHistory(this.config, channelId, limit, cursor);
  }

  // ==================== Reaction Operations ====================

  async addReaction(reaction: SlackReaction): Promise<Result<void, DomainError>> {
    return handlers.addReaction(this.config, reaction);
  }

  async removeReaction(reaction: SlackReaction): Promise<Result<void, DomainError>> {
    return handlers.removeReaction(this.config, reaction);
  }

  async getReactions(
    channelId: string,
    ts: string
  ): Promise<Result<Array<{ name: string; count: number; users: string[] }>, DomainError>> {
    return handlers.getReactions(this.config, channelId, ts);
  }

  // ==================== Channel Operations ====================

  async listChannels(
    excludeArchived: boolean = true,
    limit: number = 100
  ): Promise<Result<SlackChannel[], DomainError>> {
    return handlers.listChannels(this.config, excludeArchived, limit);
  }

  async getChannel(channelId: string): Promise<Result<SlackChannel | null, DomainError>> {
    return handlers.getChannel(this.config, channelId);
  }

  async createChannel(
    name: string,
    isPrivate: boolean = false
  ): Promise<Result<SlackChannel, DomainError>> {
    return handlers.createChannel(this.config, name, isPrivate);
  }

  async archiveChannel(channelId: string): Promise<Result<void, DomainError>> {
    return handlers.archiveChannel(this.config, channelId);
  }

  async unarchiveChannel(channelId: string): Promise<Result<void, DomainError>> {
    return handlers.unarchiveChannel(this.config, channelId);
  }

  async joinChannel(channelId: string): Promise<Result<SlackChannel, DomainError>> {
    return handlers.joinChannel(this.config, channelId);
  }

  async leaveChannel(channelId: string): Promise<Result<void, DomainError>> {
    return handlers.leaveChannel(this.config, channelId);
  }

  async inviteToChannel(channelId: string, userIds: string[]): Promise<Result<void, DomainError>> {
    return handlers.inviteToChannel(this.config, channelId, userIds);
  }

  async kickFromChannel(channelId: string, userId: string): Promise<Result<void, DomainError>> {
    return handlers.kickFromChannel(this.config, channelId, userId);
  }

  async setChannelTopic(channelId: string, topic: string): Promise<Result<void, DomainError>> {
    return handlers.setChannelTopic(this.config, channelId, topic);
  }

  async setChannelPurpose(channelId: string, purpose: string): Promise<Result<void, DomainError>> {
    return handlers.setChannelPurpose(this.config, channelId, purpose);
  }

  // ==================== User Operations ====================

  async listUsers(
    limit: number = 100,
    cursor?: string
  ): Promise<Result<{ users: SlackUser[]; nextCursor?: string }, DomainError>> {
    return handlers.listUsers(this.config, limit, cursor);
  }

  async getUser(userId: string): Promise<Result<SlackUser | null, DomainError>> {
    return handlers.getUser(this.config, userId);
  }

  async getUserByEmail(email: string): Promise<Result<SlackUser | null, DomainError>> {
    return handlers.getUserByEmail(this.config, email);
  }

  // ==================== Direct Message Operations ====================

  async openDirectMessage(userId: string): Promise<Result<SlackChannel, DomainError>> {
    return handlers.openDirectMessage(this.config, userId);
  }

  async openGroupDirectMessage(userIds: string[]): Promise<Result<SlackChannel, DomainError>> {
    return handlers.openGroupDirectMessage(this.config, userIds);
  }

  // ==================== File Operations ====================

  async uploadFile(params: UploadFileParams): Promise<Result<SlackFile, DomainError>> {
    return handlers.uploadFile(this.config, params);
  }

  async deleteFile(fileId: string): Promise<Result<void, DomainError>> {
    return handlers.deleteFile(this.config, fileId);
  }

  // ==================== Webhook Verification ====================

  verifyWebhookSignature(signature: string, timestamp: string, body: string): boolean {
    return handlers.verifyWebhookSignature(this.config, signature, timestamp, body);
  }

  parseWebhookEvent(body: string): Result<SlackWebhookEvent, DomainError> {
    return handlers.parseWebhookEvent(body);
  }

  // ==================== Health Check ====================

  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    return handlers.checkConnection(this.config);
  }
}
