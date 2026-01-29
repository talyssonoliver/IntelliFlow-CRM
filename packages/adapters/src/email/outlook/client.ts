/**
 * Outlook Email Adapter
 * Implements email operations via Microsoft Graph API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://docs.microsoft.com/en-us/graph/api/overview
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface OutlookConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  scopes?: string[];
}

export interface OutlookOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
}

export interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from: OutlookEmailAddress;
  toRecipients: OutlookEmailAddress[];
  ccRecipients?: OutlookEmailAddress[];
  bccRecipients?: OutlookEmailAddress[];
  replyTo?: OutlookEmailAddress[];
  receivedDateTime: Date;
  sentDateTime?: Date;
  hasAttachments: boolean;
  importance: 'low' | 'normal' | 'high';
  isRead: boolean;
  isDraft: boolean;
  flag: { flagStatus: 'notFlagged' | 'flagged' | 'complete' };
  categories: string[];
  parentFolderId: string;
  webLink?: string;
}

export interface OutlookEmailAddress {
  emailAddress: {
    name?: string;
    address: string;
  };
}

export interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
  contentBytes?: string;
}

export interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount: number;
  totalItemCount: number;
  unreadItemCount: number;
}

export interface OutlookCategory {
  id: string;
  displayName: string;
  color:
    | 'none'
    | 'preset0'
    | 'preset1'
    | 'preset2'
    | 'preset3'
    | 'preset4'
    | 'preset5'
    | 'preset6'
    | 'preset7'
    | 'preset8'
    | 'preset9'
    | 'preset10'
    | 'preset11'
    | 'preset12'
    | 'preset13'
    | 'preset14'
    | 'preset15'
    | 'preset16'
    | 'preset17'
    | 'preset18'
    | 'preset19'
    | 'preset20'
    | 'preset21'
    | 'preset22'
    | 'preset23'
    | 'preset24';
}

export interface OutlookSendResult {
  id: string;
  conversationId: string;
}

export interface ComposeEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  importance?: 'low' | 'normal' | 'high';
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string; // Base64 encoded
  }>;
  conversationId?: string;
}

export interface SearchEmailsParams {
  query?: string;
  folderId?: string;
  top?: number;
  skip?: number;
  filter?: string;
  orderBy?: string;
  select?: string[];
}

export interface SearchEmailsResult {
  messages: OutlookMessage[];
  nextLink?: string;
  totalCount?: number;
}

// ==================== Error Types ====================

export class OutlookAuthenticationError extends DomainError {
  readonly code = 'OUTLOOK_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class OutlookRateLimitError extends DomainError {
  readonly code = 'OUTLOOK_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class OutlookConnectionError extends DomainError {
  readonly code = 'OUTLOOK_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class OutlookNotFoundError extends DomainError {
  readonly code = 'OUTLOOK_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

export class OutlookInvalidRequestError extends DomainError {
  readonly code = 'OUTLOOK_INVALID_REQUEST';

  constructor(message: string) {
    super(message);
  }
}

// ==================== Adapter Interface ====================

export interface OutlookEmailServicePort {
  // OAuth
  getAuthorizationUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<Result<OutlookOAuthTokens, DomainError>>;
  refreshAccessToken(refreshToken: string): Promise<Result<OutlookOAuthTokens, DomainError>>;
  validateTokens(tokens: OutlookOAuthTokens): boolean;

  // Message Operations
  getMessage(tokens: OutlookOAuthTokens, messageId: string): Promise<Result<OutlookMessage | null, DomainError>>;
  searchMessages(tokens: OutlookOAuthTokens, params: SearchEmailsParams): Promise<Result<SearchEmailsResult, DomainError>>;
  sendMessage(tokens: OutlookOAuthTokens, params: ComposeEmailParams): Promise<Result<OutlookSendResult, DomainError>>;
  replyToMessage(tokens: OutlookOAuthTokens, messageId: string, params: ComposeEmailParams): Promise<Result<OutlookSendResult, DomainError>>;
  replyAllToMessage(tokens: OutlookOAuthTokens, messageId: string, params: ComposeEmailParams): Promise<Result<OutlookSendResult, DomainError>>;
  forwardMessage(tokens: OutlookOAuthTokens, messageId: string, to: string[], comment?: string): Promise<Result<void, DomainError>>;
  deleteMessage(tokens: OutlookOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;
  moveMessage(tokens: OutlookOAuthTokens, messageId: string, destinationFolderId: string): Promise<Result<OutlookMessage, DomainError>>;
  copyMessage(tokens: OutlookOAuthTokens, messageId: string, destinationFolderId: string): Promise<Result<OutlookMessage, DomainError>>;
  updateMessage(tokens: OutlookOAuthTokens, messageId: string, updates: Partial<{ isRead: boolean; categories: string[]; flag: { flagStatus: string } }>): Promise<Result<OutlookMessage, DomainError>>;

  // Draft Operations
  createDraft(tokens: OutlookOAuthTokens, params: ComposeEmailParams): Promise<Result<OutlookMessage, DomainError>>;
  updateDraft(tokens: OutlookOAuthTokens, draftId: string, params: ComposeEmailParams): Promise<Result<OutlookMessage, DomainError>>;
  sendDraft(tokens: OutlookOAuthTokens, draftId: string): Promise<Result<void, DomainError>>;

  // Folder Operations
  listFolders(tokens: OutlookOAuthTokens): Promise<Result<OutlookFolder[], DomainError>>;
  createFolder(tokens: OutlookOAuthTokens, displayName: string, parentFolderId?: string): Promise<Result<OutlookFolder, DomainError>>;
  deleteFolder(tokens: OutlookOAuthTokens, folderId: string): Promise<Result<void, DomainError>>;

  // Attachment Operations
  listAttachments(tokens: OutlookOAuthTokens, messageId: string): Promise<Result<OutlookAttachment[], DomainError>>;
  getAttachment(tokens: OutlookOAuthTokens, messageId: string, attachmentId: string): Promise<Result<OutlookAttachment | null, DomainError>>;
  addAttachment(tokens: OutlookOAuthTokens, messageId: string, attachment: { name: string; contentType: string; contentBytes: string }): Promise<Result<OutlookAttachment, DomainError>>;

  // Category Operations
  listCategories(tokens: OutlookOAuthTokens): Promise<Result<OutlookCategory[], DomainError>>;
  createCategory(tokens: OutlookOAuthTokens, displayName: string, color: OutlookCategory['color']): Promise<Result<OutlookCategory, DomainError>>;

  // Health Check
  checkConnection(tokens: OutlookOAuthTokens): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * Outlook Email Adapter
 * Implements email operations via Microsoft Graph API
 */
export class OutlookAdapter implements OutlookEmailServicePort {
  private config: OutlookConfig;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
  private readonly oauthBaseUrl: string;

  private readonly defaultScopes = [
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/User.Read',
    'offline_access',
  ];

  constructor(config: OutlookConfig) {
    this.config = config;
    this.oauthBaseUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`;
  }

  // ==================== OAuth ====================

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: (this.config.scopes ?? this.defaultScopes).join(' '),
      state,
      response_mode: 'query',
    });

    return `${this.oauthBaseUrl}/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<Result<OutlookOAuthTokens, DomainError>> {
    try {
      const response = await fetch(`${this.oauthBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri,
          scope: (this.config.scopes ?? this.defaultScopes).join(' '),
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error_description?: string };
        return Result.fail(
          new OutlookAuthenticationError(errorData.error_description ?? 'Token exchange failed')
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
        token_type: string;
      };
      return Result.ok({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      });
    } catch (err) {
      return Result.fail(
        new OutlookConnectionError(err instanceof Error ? err.message : 'Unknown error')
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<Result<OutlookOAuthTokens, DomainError>> {
    try {
      const response = await fetch(`${this.oauthBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: (this.config.scopes ?? this.defaultScopes).join(' '),
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error_description?: string };
        return Result.fail(
          new OutlookAuthenticationError(errorData.error_description ?? 'Token refresh failed')
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
        token_type: string;
      };
      return Result.ok({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      });
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  validateTokens(tokens: OutlookOAuthTokens): boolean {
    const bufferMs = 5 * 60 * 1000;
    return tokens.expiresAt.getTime() > Date.now() + bufferMs;
  }

  // ==================== Message Operations ====================

  async getMessage(
    tokens: OutlookOAuthTokens,
    messageId: string
  ): Promise<Result<OutlookMessage | null, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', `/me/messages/${messageId}`);

      if (response.isFailure) {
        if (response.error.code === 'OUTLOOK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async searchMessages(
    tokens: OutlookOAuthTokens,
    params: SearchEmailsParams
  ): Promise<Result<SearchEmailsResult, DomainError>> {
    try {
      let endpoint = params.folderId
        ? `/me/mailFolders/${params.folderId}/messages`
        : '/me/messages';

      const queryParams = new URLSearchParams();
      if (params.top) queryParams.set('$top', String(params.top));
      if (params.skip) queryParams.set('$skip', String(params.skip));
      if (params.filter) queryParams.set('$filter', params.filter);
      if (params.orderBy) queryParams.set('$orderby', params.orderBy);
      if (params.select?.length) queryParams.set('$select', params.select.join(','));
      if (params.query) queryParams.set('$search', `"${params.query}"`);

      if (queryParams.toString()) {
        endpoint += `?${queryParams}`;
      }

      const response = await this.makeRequest(tokens, 'GET', endpoint);

      if (response.isFailure) return Result.fail(response.error);

      const messages = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((m) =>
        this.mapToMessage(m)
      );

      return Result.ok({
        messages,
        nextLink: response.value['@odata.nextLink'] as string | undefined,
        totalCount: response.value['@odata.count'] as number | undefined,
      });
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendMessage(
    tokens: OutlookOAuthTokens,
    params: ComposeEmailParams
  ): Promise<Result<OutlookSendResult, DomainError>> {
    try {
      const message = this.composeMessage(params);

      const response = await this.makeRequest(tokens, 'POST', '/me/sendMail', {
        message,
        saveToSentItems: true,
      });

      if (response.isFailure) return Result.fail(response.error);

      // sendMail returns 202 with no body, so we return a placeholder result
      return Result.ok({
        id: 'sent',
        conversationId: params.conversationId ?? 'new',
      });
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async replyToMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    params: ComposeEmailParams
  ): Promise<Result<OutlookSendResult, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/me/messages/${messageId}/reply`, {
        message: {
          toRecipients: params.to.map((email) => ({
            emailAddress: { address: email },
          })),
        },
        comment: params.body,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        id: 'replied',
        conversationId: 'reply',
      });
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async replyAllToMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    params: ComposeEmailParams
  ): Promise<Result<OutlookSendResult, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/me/messages/${messageId}/replyAll`,
        {
          comment: params.body,
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        id: 'replied-all',
        conversationId: 'reply-all',
      });
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async forwardMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    to: string[],
    comment?: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/me/messages/${messageId}/forward`, {
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
        comment: comment ?? '',
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteMessage(
    tokens: OutlookOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'DELETE', `/me/messages/${messageId}`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async moveMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    destinationFolderId: string
  ): Promise<Result<OutlookMessage, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/me/messages/${messageId}/move`, {
        destinationId: destinationFolderId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async copyMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    destinationFolderId: string
  ): Promise<Result<OutlookMessage, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/me/messages/${messageId}/copy`, {
        destinationId: destinationFolderId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateMessage(
    tokens: OutlookOAuthTokens,
    messageId: string,
    updates: Partial<{ isRead: boolean; categories: string[]; flag: { flagStatus: string } }>
  ): Promise<Result<OutlookMessage, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'PATCH', `/me/messages/${messageId}`, updates);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Draft Operations ====================

  async createDraft(
    tokens: OutlookOAuthTokens,
    params: ComposeEmailParams
  ): Promise<Result<OutlookMessage, DomainError>> {
    try {
      const message = this.composeMessage(params);

      const response = await this.makeRequest(tokens, 'POST', '/me/messages', message);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateDraft(
    tokens: OutlookOAuthTokens,
    draftId: string,
    params: ComposeEmailParams
  ): Promise<Result<OutlookMessage, DomainError>> {
    try {
      const message = this.composeMessage(params);

      const response = await this.makeRequest(tokens, 'PATCH', `/me/messages/${draftId}`, message);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToMessage(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendDraft(tokens: OutlookOAuthTokens, draftId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', `/me/messages/${draftId}/send`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Folder Operations ====================

  async listFolders(tokens: OutlookOAuthTokens): Promise<Result<OutlookFolder[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/me/mailFolders');

      if (response.isFailure) return Result.fail(response.error);

      const folders = ((response.value.value as Array<Record<string, unknown>>) ?? []).map((f) =>
        this.mapToFolder(f)
      );
      return Result.ok(folders);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createFolder(
    tokens: OutlookOAuthTokens,
    displayName: string,
    parentFolderId?: string
  ): Promise<Result<OutlookFolder, DomainError>> {
    try {
      const endpoint = parentFolderId
        ? `/me/mailFolders/${parentFolderId}/childFolders`
        : '/me/mailFolders';

      const response = await this.makeRequest(tokens, 'POST', endpoint, { displayName });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToFolder(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteFolder(
    tokens: OutlookOAuthTokens,
    folderId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'DELETE', `/me/mailFolders/${folderId}`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Attachment Operations ====================

  async listAttachments(
    tokens: OutlookOAuthTokens,
    messageId: string
  ): Promise<Result<OutlookAttachment[], DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/me/messages/${messageId}/attachments`
      );

      if (response.isFailure) return Result.fail(response.error);

      const attachments = ((response.value.value as Array<Record<string, unknown>>) ?? []).map(
        (a) => this.mapToAttachment(a)
      );
      return Result.ok(attachments);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getAttachment(
    tokens: OutlookOAuthTokens,
    messageId: string,
    attachmentId: string
  ): Promise<Result<OutlookAttachment | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/me/messages/${messageId}/attachments/${attachmentId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'OUTLOOK_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToAttachment(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async addAttachment(
    tokens: OutlookOAuthTokens,
    messageId: string,
    attachment: { name: string; contentType: string; contentBytes: string }
  ): Promise<Result<OutlookAttachment, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/me/messages/${messageId}/attachments`,
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.name,
          contentType: attachment.contentType,
          contentBytes: attachment.contentBytes,
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToAttachment(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Category Operations ====================

  async listCategories(
    tokens: OutlookOAuthTokens
  ): Promise<Result<OutlookCategory[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/me/outlook/masterCategories');

      if (response.isFailure) return Result.fail(response.error);

      const categories = ((response.value.value as Array<Record<string, unknown>>) ?? []).map(
        (c) => this.mapToCategory(c)
      );
      return Result.ok(categories);
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createCategory(
    tokens: OutlookOAuthTokens,
    displayName: string,
    color: OutlookCategory['color']
  ): Promise<Result<OutlookCategory, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/me/outlook/masterCategories', {
        displayName,
        color,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToCategory(response.value));
    } catch (error) {
      return Result.fail(
        new OutlookConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(
    tokens: OutlookOAuthTokens
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
    tokens: OutlookOAuthTokens,
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
    const data = (await response.json().catch(() => ({}))) as { error?: { code?: number; message?: string; status?: string } };
    const error = data.error ?? {};

    switch (response.status) {
      case 401:
        return Result.fail(new OutlookAuthenticationError(error.message ?? 'Token expired or invalid'));
      case 404:
        return Result.fail(new OutlookNotFoundError('Resource', error.message ?? 'unknown'));
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new OutlookRateLimitError(retryAfter));
      }
      default:
        return Result.fail(new OutlookInvalidRequestError(error.message ?? 'Request failed'));
    }
  }

  private composeMessage(params: ComposeEmailParams): Record<string, unknown> {
    const message: Record<string, unknown> = {
      subject: params.subject,
      body: {
        contentType: params.isHtml ? 'html' : 'text',
        content: params.body,
      },
      toRecipients: params.to.map((email) => ({
        emailAddress: { address: email },
      })),
      importance: params.importance ?? 'normal',
    };

    if (params.cc?.length) {
      message.ccRecipients = params.cc.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    if (params.bcc?.length) {
      message.bccRecipients = params.bcc.map((email) => ({
        emailAddress: { address: email },
      }));
    }

    if (params.attachments?.length) {
      message.attachments = params.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes,
      }));
    }

    return message;
  }

  private mapToMessage(data: Record<string, unknown>): OutlookMessage {
    const body = (data.body as Record<string, unknown>) ?? {};
    const from = (data.from as Record<string, unknown>) ?? {};
    const flag = (data.flag as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      conversationId: String(data.conversationId ?? ''),
      subject: String(data.subject ?? ''),
      bodyPreview: String(data.bodyPreview ?? ''),
      body: {
        contentType: (body.contentType ?? 'text') as 'text' | 'html',
        content: String(body.content ?? ''),
      },
      from: this.mapToEmailAddress(from),
      toRecipients: ((data.toRecipients as Array<Record<string, unknown>>) ?? []).map((r) =>
        this.mapToEmailAddress(r)
      ),
      ccRecipients: data.ccRecipients
        ? ((data.ccRecipients as Array<Record<string, unknown>>) ?? []).map((r) =>
            this.mapToEmailAddress(r)
          )
        : undefined,
      bccRecipients: data.bccRecipients
        ? ((data.bccRecipients as Array<Record<string, unknown>>) ?? []).map((r) =>
            this.mapToEmailAddress(r)
          )
        : undefined,
      receivedDateTime: new Date(String(data.receivedDateTime ?? new Date().toISOString())),
      sentDateTime: data.sentDateTime
        ? new Date(String(data.sentDateTime))
        : undefined,
      hasAttachments: Boolean(data.hasAttachments),
      importance: (data.importance ?? 'normal') as 'low' | 'normal' | 'high',
      isRead: Boolean(data.isRead),
      isDraft: Boolean(data.isDraft),
      flag: {
        flagStatus: (flag.flagStatus ?? 'notFlagged') as 'notFlagged' | 'flagged' | 'complete',
      },
      categories: (data.categories as string[]) ?? [],
      parentFolderId: String(data.parentFolderId ?? ''),
      webLink: data.webLink ? String(data.webLink) : undefined,
    };
  }

  private mapToEmailAddress(data: Record<string, unknown>): OutlookEmailAddress {
    const emailAddress = (data.emailAddress as Record<string, unknown>) ?? data;

    return {
      emailAddress: {
        name: emailAddress.name ? String(emailAddress.name) : undefined,
        address: String(emailAddress.address ?? ''),
      },
    };
  }

  private mapToFolder(data: Record<string, unknown>): OutlookFolder {
    return {
      id: String(data.id ?? ''),
      displayName: String(data.displayName ?? ''),
      parentFolderId: data.parentFolderId ? String(data.parentFolderId) : undefined,
      childFolderCount: Number(data.childFolderCount ?? 0),
      totalItemCount: Number(data.totalItemCount ?? 0),
      unreadItemCount: Number(data.unreadItemCount ?? 0),
    };
  }

  private mapToAttachment(data: Record<string, unknown>): OutlookAttachment {
    return {
      id: String(data.id ?? ''),
      name: String(data.name ?? ''),
      contentType: String(data.contentType ?? 'application/octet-stream'),
      size: Number(data.size ?? 0),
      isInline: Boolean(data.isInline),
      contentId: data.contentId ? String(data.contentId) : undefined,
      contentBytes: data.contentBytes ? String(data.contentBytes) : undefined,
    };
  }

  private mapToCategory(data: Record<string, unknown>): OutlookCategory {
    return {
      id: String(data.id ?? ''),
      displayName: String(data.displayName ?? ''),
      color: (data.color ?? 'none') as OutlookCategory['color'],
    };
  }
}

export default OutlookAdapter;
