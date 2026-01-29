/**
 * Microsoft Teams Messaging Adapter
 * Implements messaging operations via Microsoft Graph API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://docs.microsoft.com/en-us/graph/api/resources/teams-api-overview
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface TeamsConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri?: string;
}

export interface TeamsOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
}

export interface TeamsTeam {
  id: string;
  displayName: string;
  description?: string;
  visibility: 'private' | 'public';
  isArchived: boolean;
  createdDateTime: Date;
  webUrl?: string;
}

export interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  membershipType: 'standard' | 'private' | 'shared';
  createdDateTime: Date;
  webUrl?: string;
  email?: string;
}

export interface TeamsMessage {
  id: string;
  createdDateTime: Date;
  lastModifiedDateTime?: Date;
  deletedDateTime?: Date;
  subject?: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from?: {
    user?: {
      id: string;
      displayName: string;
      userIdentityType: string;
    };
    application?: {
      id: string;
      displayName: string;
      applicationIdentityType: string;
    };
  };
  attachments?: TeamsAttachment[];
  mentions?: TeamsMention[];
  reactions?: TeamsReaction[];
  importance: 'normal' | 'high' | 'urgent';
  webUrl?: string;
  replyToId?: string;
}

export interface TeamsAttachment {
  id: string;
  contentType: string;
  contentUrl?: string;
  content?: string;
  name?: string;
  thumbnailUrl?: string;
}

export interface TeamsMention {
  id: number;
  mentionText: string;
  mentioned: {
    user?: { id: string; displayName: string };
    application?: { id: string; displayName: string };
  };
}

export interface TeamsReaction {
  reactionType: 'like' | 'angry' | 'sad' | 'laugh' | 'heart' | 'surprised';
  user: { id: string; displayName: string };
  createdDateTime: Date;
}

export interface TeamsMember {
  id: string;
  roles: string[];
  displayName?: string;
  userId?: string;
  email?: string;
}

export interface TeamsChat {
  id: string;
  topic?: string;
  chatType: 'oneOnOne' | 'group' | 'meeting';
  createdDateTime: Date;
  lastUpdatedDateTime?: Date;
  members?: TeamsMember[];
  webUrl?: string;
}

export interface PostMessageParams {
  body: string;
  isHtml?: boolean;
  subject?: string;
  importance?: 'normal' | 'high' | 'urgent';
  attachments?: Array<{
    contentType: string;
    contentUrl?: string;
    content?: string;
    name?: string;
  }>;
  mentions?: Array<{
    id: number;
    mentionText: string;
    userId: string;
    displayName: string;
  }>;
}

export interface TeamsWebhookEvent {
  subscriptionId?: string;
  subscriptionExpirationDateTime?: Date;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData: Record<string, unknown>;
  clientState?: string;
  tenantId?: string;
}

// ==================== Error Types ====================

export class TeamsAuthenticationError extends DomainError {
  readonly code = 'TEAMS_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class TeamsRateLimitError extends DomainError {
  readonly code = 'TEAMS_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TeamsConnectionError extends DomainError {
  readonly code = 'TEAMS_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class TeamsNotFoundError extends DomainError {
  readonly code = 'TEAMS_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

export class TeamsInvalidRequestError extends DomainError {
  readonly code = 'TEAMS_INVALID_REQUEST';

  constructor(message: string) {
    super(message);
  }
}

// ==================== Adapter Interface ====================

export interface TeamsMessagingPort {
  // Authentication
  getAccessToken(): Promise<Result<TeamsOAuthTokens, DomainError>>;

  // Team Operations
  listTeams(tokens: TeamsOAuthTokens): Promise<Result<TeamsTeam[], DomainError>>;
  getTeam(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<TeamsTeam | null, DomainError>>;
  createTeam(tokens: TeamsOAuthTokens, displayName: string, description?: string, visibility?: 'private' | 'public'): Promise<Result<TeamsTeam, DomainError>>;
  archiveTeam(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<void, DomainError>>;
  unarchiveTeam(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<void, DomainError>>;

  // Channel Operations
  listChannels(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<TeamsChannel[], DomainError>>;
  getChannel(tokens: TeamsOAuthTokens, teamId: string, channelId: string): Promise<Result<TeamsChannel | null, DomainError>>;
  createChannel(tokens: TeamsOAuthTokens, teamId: string, displayName: string, description?: string, membershipType?: 'standard' | 'private'): Promise<Result<TeamsChannel, DomainError>>;
  deleteChannel(tokens: TeamsOAuthTokens, teamId: string, channelId: string): Promise<Result<void, DomainError>>;

  // Channel Message Operations
  sendChannelMessage(tokens: TeamsOAuthTokens, teamId: string, channelId: string, params: PostMessageParams): Promise<Result<TeamsMessage, DomainError>>;
  replyToChannelMessage(tokens: TeamsOAuthTokens, teamId: string, channelId: string, messageId: string, params: PostMessageParams): Promise<Result<TeamsMessage, DomainError>>;
  getChannelMessage(tokens: TeamsOAuthTokens, teamId: string, channelId: string, messageId: string): Promise<Result<TeamsMessage | null, DomainError>>;
  listChannelMessages(tokens: TeamsOAuthTokens, teamId: string, channelId: string, top?: number): Promise<Result<TeamsMessage[], DomainError>>;
  getMessageReplies(tokens: TeamsOAuthTokens, teamId: string, channelId: string, messageId: string): Promise<Result<TeamsMessage[], DomainError>>;
  updateChannelMessage(tokens: TeamsOAuthTokens, teamId: string, channelId: string, messageId: string, body: string, isHtml?: boolean): Promise<Result<TeamsMessage, DomainError>>;
  deleteChannelMessage(tokens: TeamsOAuthTokens, teamId: string, channelId: string, messageId: string): Promise<Result<void, DomainError>>;

  // Chat Operations
  listChats(tokens: TeamsOAuthTokens): Promise<Result<TeamsChat[], DomainError>>;
  getChat(tokens: TeamsOAuthTokens, chatId: string): Promise<Result<TeamsChat | null, DomainError>>;
  createGroupChat(tokens: TeamsOAuthTokens, topic: string, memberUserIds: string[]): Promise<Result<TeamsChat, DomainError>>;
  createOneOnOneChat(tokens: TeamsOAuthTokens, userId: string): Promise<Result<TeamsChat, DomainError>>;

  // Chat Message Operations
  sendChatMessage(tokens: TeamsOAuthTokens, chatId: string, params: PostMessageParams): Promise<Result<TeamsMessage, DomainError>>;
  getChatMessage(tokens: TeamsOAuthTokens, chatId: string, messageId: string): Promise<Result<TeamsMessage | null, DomainError>>;
  listChatMessages(tokens: TeamsOAuthTokens, chatId: string, top?: number): Promise<Result<TeamsMessage[], DomainError>>;
  updateChatMessage(tokens: TeamsOAuthTokens, chatId: string, messageId: string, body: string, isHtml?: boolean): Promise<Result<TeamsMessage, DomainError>>;
  deleteChatMessage(tokens: TeamsOAuthTokens, chatId: string, messageId: string): Promise<Result<void, DomainError>>;

  // Member Operations
  listTeamMembers(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<TeamsMember[], DomainError>>;
  addTeamMember(tokens: TeamsOAuthTokens, teamId: string, userId: string, roles?: string[]): Promise<Result<TeamsMember, DomainError>>;
  removeTeamMember(tokens: TeamsOAuthTokens, teamId: string, membershipId: string): Promise<Result<void, DomainError>>;
  listChannelMembers(tokens: TeamsOAuthTokens, teamId: string, channelId: string): Promise<Result<TeamsMember[], DomainError>>;
  addChannelMember(tokens: TeamsOAuthTokens, teamId: string, channelId: string, userId: string, roles?: string[]): Promise<Result<TeamsMember, DomainError>>;
  removeChannelMember(tokens: TeamsOAuthTokens, teamId: string, channelId: string, membershipId: string): Promise<Result<void, DomainError>>;

  // Webhook Operations
  parseWebhookEvent(body: string): Result<TeamsWebhookEvent, DomainError>;

  // Health Check
  checkConnection(tokens: TeamsOAuthTokens): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * Microsoft Teams Messaging Adapter
 * Implements messaging operations via Microsoft Graph API
 */
export class TeamsAdapter implements TeamsMessagingPort {
  private config: TeamsConfig;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
  private readonly oauthBaseUrl: string;

  constructor(config: TeamsConfig) {
    this.config = config;
    this.oauthBaseUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`;
  }

  // ==================== Authentication ====================

  async getAccessToken(): Promise<Result<TeamsOAuthTokens, DomainError>> {
    try {
      const response = await fetch(`${this.oauthBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error_description?: string };
        return Result.fail(
          new TeamsAuthenticationError(errorData.error_description ?? 'Authentication failed')
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        scope?: string;
        token_type: string;
      };
      return Result.ok({
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: (data.scope ?? '').split(' '),
        tokenType: data.token_type,
      });
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Team Operations ====================

  async listTeams(tokens: TeamsOAuthTokens): Promise<Result<TeamsTeam[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/teams');

      if (response.isFailure) return Result.fail(response.error);

      const teams = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((t) =>
        this.mapToTeam(t)
      );
      return Result.ok(teams);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getTeam(
    tokens: TeamsOAuthTokens,
    teamId: string
  ): Promise<Result<TeamsTeam | null, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', `/teams/${teamId}`);

      if (response.isFailure) {
        if (response.error.code === 'TEAMS_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToTeam(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createTeam(
    tokens: TeamsOAuthTokens,
    displayName: string,
    description?: string,
    visibility: 'private' | 'public' = 'private'
  ): Promise<Result<TeamsTeam, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/teams', {
        'template@odata.bind':
          "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
        displayName,
        description,
        visibility,
      });

      if (response.isFailure) return Result.fail(response.error);

      // Creating a team is async, so we may get a 202 with a location header
      // For simplicity, we return a minimal team object
      return Result.ok({
        id: String(response.value.id ?? 'pending'),
        displayName,
        description,
        visibility,
        isArchived: false,
        createdDateTime: new Date(),
      });
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async archiveTeam(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/teams/${teamId}/archive`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async unarchiveTeam(tokens: TeamsOAuthTokens, teamId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/teams/${teamId}/unarchive`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Channel Operations ====================

  async listChannels(
    tokens: TeamsOAuthTokens,
    teamId: string
  ): Promise<Result<TeamsChannel[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', `/teams/${teamId}/channels`);

      if (response.isFailure) return Result.fail(response.error);

      const channels = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((c) =>
        this.mapToChannel(c)
      );
      return Result.ok(channels);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChannel(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string
  ): Promise<Result<TeamsChannel | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/teams/${teamId}/channels/${channelId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'TEAMS_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToChannel(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createChannel(
    tokens: TeamsOAuthTokens,
    teamId: string,
    displayName: string,
    description?: string,
    membershipType: 'standard' | 'private' = 'standard'
  ): Promise<Result<TeamsChannel, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/teams/${teamId}/channels`, {
        displayName,
        description,
        membershipType,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChannel(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteChannel(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'DELETE',
        `/teams/${teamId}/channels/${channelId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Channel Message Operations ====================

  async sendChannelMessage(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    params: PostMessageParams
  ): Promise<Result<TeamsMessage, DomainError>> {
    try {
      const messageBody = this.composeMessageBody(params);

      const response = await this.makeRequest(
        tokens,
        'POST',
        `/teams/${teamId}/channels/${channelId}/messages`,
        messageBody
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async replyToChannelMessage(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    messageId: string,
    params: PostMessageParams
  ): Promise<Result<TeamsMessage, DomainError>> {
    try {
      const messageBody = this.composeMessageBody(params);

      const response = await this.makeRequest(
        tokens,
        'POST',
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`,
        messageBody
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChannelMessage(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    messageId: string
  ): Promise<Result<TeamsMessage | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'TEAMS_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listChannelMessages(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    top: number = 50
  ): Promise<Result<TeamsMessage[], DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/teams/${teamId}/channels/${channelId}/messages?$top=${top}`
      );

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMessage(m)
      );
      return Result.ok(messages);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getMessageReplies(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    messageId: string
  ): Promise<Result<TeamsMessage[], DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`
      );

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMessage(m)
      );
      return Result.ok(messages);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateChannelMessage(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    messageId: string,
    body: string,
    isHtml: boolean = false
  ): Promise<Result<TeamsMessage, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'PATCH',
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}`,
        {
          body: {
            contentType: isHtml ? 'html' : 'text',
            content: body,
          },
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteChannelMessage(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      // Soft delete - sets the message state to deleted
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/teams/${teamId}/channels/${channelId}/messages/${messageId}/softDelete`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Chat Operations ====================

  async listChats(tokens: TeamsOAuthTokens): Promise<Result<TeamsChat[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/chats');

      if (response.isFailure) return Result.fail(response.error);

      const chats = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((c) =>
        this.mapToChat(c)
      );
      return Result.ok(chats);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChat(
    tokens: TeamsOAuthTokens,
    chatId: string
  ): Promise<Result<TeamsChat | null, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', `/chats/${chatId}`);

      if (response.isFailure) {
        if (response.error.code === 'TEAMS_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToChat(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createGroupChat(
    tokens: TeamsOAuthTokens,
    topic: string,
    memberUserIds: string[]
  ): Promise<Result<TeamsChat, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/chats', {
        chatType: 'group',
        topic,
        members: memberUserIds.map((userId) => ({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
        })),
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChat(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createOneOnOneChat(
    tokens: TeamsOAuthTokens,
    userId: string
  ): Promise<Result<TeamsChat, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/chats', {
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
          },
        ],
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToChat(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Chat Message Operations ====================

  async sendChatMessage(
    tokens: TeamsOAuthTokens,
    chatId: string,
    params: PostMessageParams
  ): Promise<Result<TeamsMessage, DomainError>> {
    try {
      const messageBody = this.composeMessageBody(params);

      const response = await this.makeRequest(
        tokens,
        'POST',
        `/chats/${chatId}/messages`,
        messageBody
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getChatMessage(
    tokens: TeamsOAuthTokens,
    chatId: string,
    messageId: string
  ): Promise<Result<TeamsMessage | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/chats/${chatId}/messages/${messageId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'TEAMS_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listChatMessages(
    tokens: TeamsOAuthTokens,
    chatId: string,
    top: number = 50
  ): Promise<Result<TeamsMessage[], DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/chats/${chatId}/messages?$top=${top}`
      );

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMessage(m)
      );
      return Result.ok(messages);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateChatMessage(
    tokens: TeamsOAuthTokens,
    chatId: string,
    messageId: string,
    body: string,
    isHtml: boolean = false
  ): Promise<Result<TeamsMessage, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'PATCH',
        `/chats/${chatId}/messages/${messageId}`,
        {
          body: {
            contentType: isHtml ? 'html' : 'text',
            content: body,
          },
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteChatMessage(
    tokens: TeamsOAuthTokens,
    chatId: string,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/chats/${chatId}/messages/${messageId}/softDelete`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Member Operations ====================

  async listTeamMembers(
    tokens: TeamsOAuthTokens,
    teamId: string
  ): Promise<Result<TeamsMember[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', `/teams/${teamId}/members`);

      if (response.isFailure) return Result.fail(response.error);

      const members = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMember(m)
      );
      return Result.ok(members);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async addTeamMember(
    tokens: TeamsOAuthTokens,
    teamId: string,
    userId: string,
    roles: string[] = ['member']
  ): Promise<Result<TeamsMember, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/teams/${teamId}/members`, {
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles,
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMember(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async removeTeamMember(
    tokens: TeamsOAuthTokens,
    teamId: string,
    membershipId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'DELETE',
        `/teams/${teamId}/members/${membershipId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listChannelMembers(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string
  ): Promise<Result<TeamsMember[], DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/teams/${teamId}/channels/${channelId}/members`
      );

      if (response.isFailure) return Result.fail(response.error);

      const members = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMember(m)
      );
      return Result.ok(members);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async addChannelMember(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    userId: string,
    roles: string[] = ['member']
  ): Promise<Result<TeamsMember, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/teams/${teamId}/channels/${channelId}/members`,
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles,
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMember(response.value));
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async removeChannelMember(
    tokens: TeamsOAuthTokens,
    teamId: string,
    channelId: string,
    membershipId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'DELETE',
        `/teams/${teamId}/channels/${channelId}/members/${membershipId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new TeamsConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Webhook Operations ====================

  parseWebhookEvent(body: string): Result<TeamsWebhookEvent, DomainError> {
    try {
      const event = JSON.parse(body);

      return Result.ok({
        subscriptionId: event.subscriptionId,
        subscriptionExpirationDateTime: event.subscriptionExpirationDateTime
          ? new Date(event.subscriptionExpirationDateTime)
          : undefined,
        changeType: event.changeType,
        resource: event.resource,
        resourceData: event.resourceData ?? {},
        clientState: event.clientState,
        tenantId: event.tenantId,
      });
    } catch (error) {
      return Result.fail(
        new TeamsInvalidRequestError(
          error instanceof Error ? error.message : 'Invalid webhook payload'
        )
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(
    tokens: TeamsOAuthTokens
  ): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>> {
    const start = Date.now();

    try {
      const response = await this.makeRequest(tokens, 'GET', '/me');
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
    tokens: TeamsOAuthTokens,
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const response = await fetch(`${this.graphBaseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 202 || response.status === 204) {
      return Result.ok({});
    }

    if (!response.ok) {
      return this.handleErrorResponse(response);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return Result.ok(data);
  }

  private async handleErrorResponse(
    response: Response
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const error = data.error ?? {};

    switch (response.status) {
      case 401:
        return Result.fail(new TeamsAuthenticationError(error.message ?? 'Token expired or invalid'));
      case 404:
        return Result.fail(new TeamsNotFoundError('Resource', error.message ?? 'unknown'));
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new TeamsRateLimitError(retryAfter));
      }
      default:
        return Result.fail(new TeamsInvalidRequestError(error.message ?? 'Request failed'));
    }
  }

  private composeMessageBody(params: PostMessageParams): Record<string, unknown> {
    const messageBody: Record<string, unknown> = {
      body: {
        contentType: params.isHtml ? 'html' : 'text',
        content: params.body,
      },
      importance: params.importance ?? 'normal',
    };

    if (params.subject) {
      messageBody.subject = params.subject;
    }

    if (params.attachments?.length) {
      messageBody.attachments = params.attachments.map((att) => ({
        contentType: att.contentType,
        contentUrl: att.contentUrl,
        content: att.content,
        name: att.name,
      }));
    }

    if (params.mentions?.length) {
      messageBody.mentions = params.mentions.map((mention) => ({
        id: mention.id,
        mentionText: mention.mentionText,
        mentioned: {
          user: {
            id: mention.userId,
            displayName: mention.displayName,
            userIdentityType: 'aadUser',
          },
        },
      }));
    }

    return messageBody;
  }

  private mapToTeam(data: Record<string, unknown>): TeamsTeam {
    return {
      id: String(data.id ?? ''),
      displayName: String(data.displayName ?? ''),
      description: data.description ? String(data.description) : undefined,
      visibility: (data.visibility ?? 'private') as 'private' | 'public',
      isArchived: Boolean(data.isArchived),
      createdDateTime: new Date(String(data.createdDateTime ?? new Date().toISOString())),
      webUrl: data.webUrl ? String(data.webUrl) : undefined,
    };
  }

  private mapToChannel(data: Record<string, unknown>): TeamsChannel {
    return {
      id: String(data.id ?? ''),
      displayName: String(data.displayName ?? ''),
      description: data.description ? String(data.description) : undefined,
      membershipType: (data.membershipType ?? 'standard') as 'standard' | 'private' | 'shared',
      createdDateTime: new Date(String(data.createdDateTime ?? new Date().toISOString())),
      webUrl: data.webUrl ? String(data.webUrl) : undefined,
      email: data.email ? String(data.email) : undefined,
    };
  }

  private mapToMessage(data: Record<string, unknown>): TeamsMessage {
    const body = (data.body as Record<string, unknown>) ?? {};
    const from = data.from as Record<string, unknown> | undefined;

    return {
      id: String(data.id ?? ''),
      createdDateTime: new Date(String(data.createdDateTime ?? new Date().toISOString())),
      lastModifiedDateTime: data.lastModifiedDateTime
        ? new Date(String(data.lastModifiedDateTime))
        : undefined,
      deletedDateTime: data.deletedDateTime ? new Date(String(data.deletedDateTime)) : undefined,
      subject: data.subject ? String(data.subject) : undefined,
      body: {
        contentType: (body.contentType ?? 'text') as 'text' | 'html',
        content: String(body.content ?? ''),
      },
      from: from ? this.mapToFrom(from) : undefined,
      attachments: data.attachments as TeamsAttachment[] | undefined,
      mentions: data.mentions as TeamsMention[] | undefined,
      reactions: data.reactions as TeamsReaction[] | undefined,
      importance: (data.importance ?? 'normal') as 'normal' | 'high' | 'urgent',
      webUrl: data.webUrl ? String(data.webUrl) : undefined,
      replyToId: data.replyToId ? String(data.replyToId) : undefined,
    };
  }

  private mapToFrom(data: Record<string, unknown>): TeamsMessage['from'] {
    const user = data.user as Record<string, unknown> | undefined;
    const application = data.application as Record<string, unknown> | undefined;

    return {
      user: user
        ? {
            id: String(user.id ?? ''),
            displayName: String(user.displayName ?? ''),
            userIdentityType: String(user.userIdentityType ?? ''),
          }
        : undefined,
      application: application
        ? {
            id: String(application.id ?? ''),
            displayName: String(application.displayName ?? ''),
            applicationIdentityType: String(application.applicationIdentityType ?? ''),
          }
        : undefined,
    };
  }

  private mapToChat(data: Record<string, unknown>): TeamsChat {
    return {
      id: String(data.id ?? ''),
      topic: data.topic ? String(data.topic) : undefined,
      chatType: (data.chatType ?? 'oneOnOne') as 'oneOnOne' | 'group' | 'meeting',
      createdDateTime: new Date(String(data.createdDateTime ?? new Date().toISOString())),
      lastUpdatedDateTime: data.lastUpdatedDateTime
        ? new Date(String(data.lastUpdatedDateTime))
        : undefined,
      members: data.members
        ? ((data.members as Array<Record<string, unknown>>).map((m) => this.mapToMember(m)))
        : undefined,
      webUrl: data.webUrl ? String(data.webUrl) : undefined,
    };
  }

  private mapToMember(data: Record<string, unknown>): TeamsMember {
    return {
      id: String(data.id ?? ''),
      roles: (data.roles as string[]) ?? [],
      displayName: data.displayName ? String(data.displayName) : undefined,
      userId: data.userId ? String(data.userId) : undefined,
      email: data.email ? String(data.email) : undefined,
    };
  }
}

export default TeamsAdapter;
