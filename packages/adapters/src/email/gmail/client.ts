/**
 * Gmail Email Adapter
 * Implements email operations via Gmail API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://developers.google.com/gmail/api/reference/rest
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== API Response Types ====================

/** OAuth token response from Google */
interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

/** Generic Gmail API error response */
interface GmailApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

// ==================== Types ====================

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface GmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: Date;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { size: number; data?: string };
    parts?: GmailMessagePart[];
  };
  sizeEstimate: number;
  raw?: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers: Array<{ name: string; value: string }>;
  body: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

export interface GmailDraft {
  id: string;
  message: GmailMessage;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  from: { name?: string; email: string };
  to: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email: string }>;
  bcc?: Array<{ name?: string; email: string }>;
  subject: string;
  date: Date;
  body: {
    text?: string;
    html?: string;
  };
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
}

export interface GmailComposeEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: string; // Base64 encoded
  }>;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface GmailSearchEmailsParams {
  query: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GmailSearchEmailsResult {
  messages: ParsedEmail[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

// ==================== Error Types ====================

export class GmailAuthenticationError extends DomainError {
  readonly code = 'GMAIL_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class GmailRateLimitError extends DomainError {
  readonly code = 'GMAIL_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GmailConnectionError extends DomainError {
  readonly code = 'GMAIL_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class GmailNotFoundError extends DomainError {
  readonly code = 'GMAIL_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

export class GmailInvalidRequestError extends DomainError {
  readonly code = 'GMAIL_INVALID_REQUEST';

  constructor(message: string) {
    super(message);
  }
}

// ==================== Adapter Interface ====================

export interface EmailServicePort {
  // OAuth
  getAuthorizationUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<Result<GmailOAuthTokens, DomainError>>;
  refreshAccessToken(refreshToken: string): Promise<Result<GmailOAuthTokens, DomainError>>;
  revokeTokens(accessToken: string): Promise<Result<void, DomainError>>;
  validateTokens(tokens: GmailOAuthTokens): boolean;

  // Message Operations
  getMessage(tokens: GmailOAuthTokens, messageId: string): Promise<Result<ParsedEmail | null, DomainError>>;
  searchMessages(tokens: GmailOAuthTokens, params: GmailSearchEmailsParams): Promise<Result<GmailSearchEmailsResult, DomainError>>;
  sendMessage(tokens: GmailOAuthTokens, params: GmailComposeEmailParams): Promise<Result<GmailSendResult, DomainError>>;
  replyToMessage(tokens: GmailOAuthTokens, messageId: string, params: GmailComposeEmailParams): Promise<Result<GmailSendResult, DomainError>>;
  forwardMessage(tokens: GmailOAuthTokens, messageId: string, to: string[]): Promise<Result<GmailSendResult, DomainError>>;
  deleteMessage(tokens: GmailOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;
  trashMessage(tokens: GmailOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;
  untrashMessage(tokens: GmailOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;
  modifyLabels(tokens: GmailOAuthTokens, messageId: string, addLabels: string[], removeLabels: string[]): Promise<Result<void, DomainError>>;
  markAsRead(tokens: GmailOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;
  markAsUnread(tokens: GmailOAuthTokens, messageId: string): Promise<Result<void, DomainError>>;

  // Thread Operations
  getThread(tokens: GmailOAuthTokens, threadId: string): Promise<Result<GmailThread | null, DomainError>>;
  deleteThread(tokens: GmailOAuthTokens, threadId: string): Promise<Result<void, DomainError>>;
  trashThread(tokens: GmailOAuthTokens, threadId: string): Promise<Result<void, DomainError>>;

  // Draft Operations
  createDraft(tokens: GmailOAuthTokens, params: GmailComposeEmailParams): Promise<Result<GmailDraft, DomainError>>;
  updateDraft(tokens: GmailOAuthTokens, draftId: string, params: GmailComposeEmailParams): Promise<Result<GmailDraft, DomainError>>;
  deleteDraft(tokens: GmailOAuthTokens, draftId: string): Promise<Result<void, DomainError>>;
  sendDraft(tokens: GmailOAuthTokens, draftId: string): Promise<Result<GmailSendResult, DomainError>>;
  listDrafts(tokens: GmailOAuthTokens): Promise<Result<GmailDraft[], DomainError>>;

  // Label Operations
  listLabels(tokens: GmailOAuthTokens): Promise<Result<GmailLabel[], DomainError>>;
  createLabel(tokens: GmailOAuthTokens, name: string): Promise<Result<GmailLabel, DomainError>>;
  deleteLabel(tokens: GmailOAuthTokens, labelId: string): Promise<Result<void, DomainError>>;

  // Attachment Operations
  getAttachment(tokens: GmailOAuthTokens, messageId: string, attachmentId: string): Promise<Result<{ data: string; size: number }, DomainError>>;

  // Health Check
  checkConnection(tokens: GmailOAuthTokens): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * Gmail Email Adapter
 * Implements email operations via Gmail REST API
 */
export class GmailAdapter implements EmailServicePort {
  private config: GmailConfig;
  private readonly apiBaseUrl = 'https://gmail.googleapis.com/gmail/v1';
  private readonly oauthBaseUrl = 'https://oauth2.googleapis.com';

  private readonly defaultScopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
  ];

  constructor(config: GmailConfig) {
    this.config = config;
  }

  // ==================== OAuth ====================

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: (this.config.scopes ?? this.defaultScopes).join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<Result<GmailOAuthTokens, DomainError>> {
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
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as OAuthTokenResponse;
        return Result.fail(
          new GmailAuthenticationError(errorData.error_description ?? 'Token exchange failed')
        );
      }

      const data = (await response.json()) as OAuthTokenResponse;
      return Result.ok({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      });
    } catch (err) {
      return Result.fail(
        new GmailConnectionError(err instanceof Error ? err.message : 'Unknown error')
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<Result<GmailOAuthTokens, DomainError>> {
    try {
      const response = await fetch(`${this.oauthBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as OAuthTokenResponse;
        return Result.fail(
          new GmailAuthenticationError(errorData.error_description ?? 'Token refresh failed')
        );
      }

      const data = (await response.json()) as OAuthTokenResponse;
      return Result.ok({
        accessToken: data.access_token,
        refreshToken: refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope.split(' '),
        tokenType: data.token_type,
      });
    } catch (err) {
      return Result.fail(
        new GmailConnectionError(err instanceof Error ? err.message : 'Unknown error')
      );
    }
  }

  async revokeTokens(accessToken: string): Promise<Result<void, DomainError>> {
    try {
      const response = await fetch(`${this.oauthBaseUrl}/revoke?token=${accessToken}`, {
        method: 'POST',
      });

      if (!response.ok && response.status !== 400) {
        return Result.fail(new GmailAuthenticationError('Token revocation failed'));
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  validateTokens(tokens: GmailOAuthTokens): boolean {
    const bufferMs = 5 * 60 * 1000;
    return tokens.expiresAt.getTime() > Date.now() + bufferMs;
  }

  // ==================== Message Operations ====================

  async getMessage(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<ParsedEmail | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/users/me/messages/${messageId}?format=full`
      );

      if (response.isFailure) {
        if (response.error.code === 'GMAIL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.parseMessage(response.value));
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async searchMessages(
    tokens: GmailOAuthTokens,
    params: GmailSearchEmailsParams
  ): Promise<Result<GmailSearchEmailsResult, DomainError>> {
    try {
      const queryParams = new URLSearchParams({
        q: params.query,
        maxResults: String(params.maxResults ?? 25),
      });

      if (params.pageToken) queryParams.set('pageToken', params.pageToken);
      if (params.labelIds) params.labelIds.forEach((id) => queryParams.append('labelIds', id));
      if (params.includeSpamTrash) queryParams.set('includeSpamTrash', 'true');

      const response = await this.makeRequest(
        tokens,
        'GET',
        `/users/me/messages?${queryParams}`
      );

      if (response.isFailure) return Result.fail(response.error);

      const messages: ParsedEmail[] = [];
      const messageRefs = (response.value.messages as Array<{ id: string }>) ?? [];

      // Fetch full message details for each message
      for (const ref of messageRefs) {
        const msgResult = await this.getMessage(tokens, ref.id);
        if (msgResult.isSuccess && msgResult.value) {
          messages.push(msgResult.value);
        }
      }

      return Result.ok({
        messages,
        nextPageToken: response.value.nextPageToken as string | undefined,
        resultSizeEstimate: Number(response.value.resultSizeEstimate ?? 0),
      });
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendMessage(
    tokens: GmailOAuthTokens,
    params: GmailComposeEmailParams
  ): Promise<Result<GmailSendResult, DomainError>> {
    try {
      const raw = this.composeRawMessage(params);

      const response = await this.makeRequest(tokens, 'POST', '/users/me/messages/send', {
        raw,
        threadId: params.threadId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        id: String(response.value.id ?? ''),
        threadId: String(response.value.threadId ?? ''),
        labelIds: (response.value.labelIds as string[]) ?? [],
      });
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async replyToMessage(
    tokens: GmailOAuthTokens,
    messageId: string,
    params: GmailComposeEmailParams
  ): Promise<Result<GmailSendResult, DomainError>> {
    // Get original message to get threadId and headers
    const originalResult = await this.getMessage(tokens, messageId);
    if (originalResult.isFailure) return Result.fail(originalResult.error);
    if (!originalResult.value) {
      return Result.fail(new GmailNotFoundError('Message', messageId));
    }

    const original = originalResult.value;

    // Set reply headers
    const replyParams: GmailComposeEmailParams = {
      ...params,
      threadId: original.threadId,
      inReplyTo: messageId,
      references: messageId,
      subject: params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`,
    };

    return this.sendMessage(tokens, replyParams);
  }

  async forwardMessage(
    tokens: GmailOAuthTokens,
    messageId: string,
    to: string[]
  ): Promise<Result<GmailSendResult, DomainError>> {
    const originalResult = await this.getMessage(tokens, messageId);
    if (originalResult.isFailure) return Result.fail(originalResult.error);
    if (!originalResult.value) {
      return Result.fail(new GmailNotFoundError('Message', messageId));
    }

    const original = originalResult.value;
    const forwardBody = `
---------- Forwarded message ----------
From: ${original.from.name ?? ''} <${original.from.email}>
Date: ${original.date.toISOString()}
Subject: ${original.subject}
To: ${original.to.map((t) => t.email).join(', ')}

${original.body.text ?? original.body.html ?? ''}
`;

    return this.sendMessage(tokens, {
      to,
      subject: `Fwd: ${original.subject}`,
      body: forwardBody,
      isHtml: false,
    });
  }

  async deleteMessage(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'DELETE',
        `/users/me/messages/${messageId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async trashMessage(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/users/me/messages/${messageId}/trash`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async untrashMessage(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/users/me/messages/${messageId}/untrash`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async modifyLabels(
    tokens: GmailOAuthTokens,
    messageId: string,
    addLabels: string[],
    removeLabels: string[]
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/users/me/messages/${messageId}/modify`,
        {
          addLabelIds: addLabels,
          removeLabelIds: removeLabels,
        }
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async markAsRead(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    return this.modifyLabels(tokens, messageId, [], ['UNREAD']);
  }

  async markAsUnread(
    tokens: GmailOAuthTokens,
    messageId: string
  ): Promise<Result<void, DomainError>> {
    return this.modifyLabels(tokens, messageId, ['UNREAD'], []);
  }

  // ==================== Thread Operations ====================

  async getThread(
    tokens: GmailOAuthTokens,
    threadId: string
  ): Promise<Result<GmailThread | null, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/users/me/threads/${threadId}?format=full`
      );

      if (response.isFailure) {
        if (response.error.code === 'GMAIL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      const messages = ((response.value.messages as Array<Record<string, unknown>>) ?? []).map(
        (msg) => this.mapToGmailMessage(msg)
      );

      return Result.ok({
        id: String(response.value.id ?? ''),
        historyId: String(response.value.historyId ?? ''),
        messages,
      });
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteThread(
    tokens: GmailOAuthTokens,
    threadId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'DELETE',
        `/users/me/threads/${threadId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async trashThread(
    tokens: GmailOAuthTokens,
    threadId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'POST',
        `/users/me/threads/${threadId}/trash`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Draft Operations ====================

  async createDraft(
    tokens: GmailOAuthTokens,
    params: GmailComposeEmailParams
  ): Promise<Result<GmailDraft, DomainError>> {
    try {
      const raw = this.composeRawMessage(params);

      const response = await this.makeRequest(tokens, 'POST', '/users/me/drafts', {
        message: { raw, threadId: params.threadId },
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToDraft(response.value));
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateDraft(
    tokens: GmailOAuthTokens,
    draftId: string,
    params: GmailComposeEmailParams
  ): Promise<Result<GmailDraft, DomainError>> {
    try {
      const raw = this.composeRawMessage(params);

      const response = await this.makeRequest(tokens, 'PUT', `/users/me/drafts/${draftId}`, {
        message: { raw, threadId: params.threadId },
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToDraft(response.value));
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteDraft(
    tokens: GmailOAuthTokens,
    draftId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'DELETE', `/users/me/drafts/${draftId}`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async sendDraft(
    tokens: GmailOAuthTokens,
    draftId: string
  ): Promise<Result<GmailSendResult, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/users/me/drafts/send', {
        id: draftId,
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        id: String(response.value.id ?? ''),
        threadId: String(response.value.threadId ?? ''),
        labelIds: (response.value.labelIds as string[]) ?? [],
      });
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listDrafts(tokens: GmailOAuthTokens): Promise<Result<GmailDraft[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/users/me/drafts');

      if (response.isFailure) return Result.fail(response.error);

      const drafts = ((response.value.drafts as Array<Record<string, unknown>>) ?? []).map((d) =>
        this.mapToDraft(d)
      );
      return Result.ok(drafts);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Label Operations ====================

  async listLabels(tokens: GmailOAuthTokens): Promise<Result<GmailLabel[], DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'GET', '/users/me/labels');

      if (response.isFailure) return Result.fail(response.error);

      const labels = ((response.value.labels as Array<Record<string, unknown>>) ?? []).map((l) =>
        this.mapToLabel(l)
      );
      return Result.ok(labels);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createLabel(
    tokens: GmailOAuthTokens,
    name: string
  ): Promise<Result<GmailLabel, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'POST', '/users/me/labels', {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      });

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToLabel(response.value));
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteLabel(
    tokens: GmailOAuthTokens,
    labelId: string
  ): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest(tokens, 'DELETE', `/users/me/labels/${labelId}`);

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Attachment Operations ====================

  async getAttachment(
    tokens: GmailOAuthTokens,
    messageId: string,
    attachmentId: string
  ): Promise<Result<{ data: string; size: number }, DomainError>> {
    try {
      const response = await this.makeRequest(
        tokens,
        'GET',
        `/users/me/messages/${messageId}/attachments/${attachmentId}`
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok({
        data: String(response.value.data ?? ''),
        size: Number(response.value.size ?? 0),
      });
    } catch (error) {
      return Result.fail(
        new GmailConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(
    tokens: GmailOAuthTokens
  ): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>> {
    const start = Date.now();

    try {
      const response = await this.makeRequest(tokens, 'GET', '/users/me/profile');
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
    tokens: GmailOAuthTokens,
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
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
    const data = (await response.json().catch(() => ({}))) as GmailApiErrorResponse;
    const error = data.error ?? {};

    switch (response.status) {
      case 401:
        return Result.fail(new GmailAuthenticationError(error.message ?? 'Token expired or invalid'));
      case 404:
        return Result.fail(new GmailNotFoundError('Resource', error.message ?? 'unknown'));
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new GmailRateLimitError(retryAfter));
      }
      default:
        return Result.fail(new GmailInvalidRequestError(error.message ?? 'Request failed'));
    }
  }

  private composeRawMessage(params: GmailComposeEmailParams): string {
    const boundary = `boundary_${Date.now()}`;
    const lines: string[] = [];

    // Headers
    lines.push(`To: ${params.to.join(', ')}`);
    if (params.cc?.length) lines.push(`Cc: ${params.cc.join(', ')}`);
    if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(', ')}`);
    lines.push(`Subject: ${params.subject}`);
    if (params.inReplyTo) lines.push(`In-Reply-To: <${params.inReplyTo}>`);
    if (params.references) lines.push(`References: <${params.references}>`);

    if (params.attachments?.length) {
      lines.push(`MIME-Version: 1.0`);
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      lines.push('');
      lines.push(`--${boundary}`);
    }

    // Body
    lines.push(`Content-Type: ${params.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`);
    lines.push('');
    lines.push(params.body);

    // Attachments
    if (params.attachments?.length) {
      for (const attachment of params.attachments) {
        lines.push('');
        lines.push(`--${boundary}`);
        lines.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        lines.push('');
        lines.push(attachment.content);
      }
      lines.push('');
      lines.push(`--${boundary}--`);
    }

    const message = lines.join('\r\n');
    return Buffer.from(message).toString('base64url');
  }

  private parseMessage(data: Record<string, unknown>): ParsedEmail {
    const payload = (data.payload as Record<string, unknown>) ?? {};
    const headers = (payload.headers as Array<{ name: string; value: string }>) ?? [];
    const labelIds = (data.labelIds as string[]) ?? [];

    const getHeader = (name: string): string => {
      const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
      return header?.value ?? '';
    };

    const parseEmailAddress = (
      value: string
    ): { name?: string; email: string } => {
      // Check if the email has angle brackets (e.g., "Name" <email@example.com>)
      if (value.includes('<') && value.includes('>')) {
        const match = value.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
        if (match) {
          return {
            name: match[1]?.trim() || undefined,
            email: match[2]?.trim() ?? value,
          };
        }
      }
      // Plain email without angle brackets
      return { email: value.trim() };
    };

    const parseEmailAddresses = (
      value: string
    ): Array<{ name?: string; email: string }> => {
      return value
        .split(',')
        .map((addr) => parseEmailAddress(addr.trim()))
        .filter((addr) => addr.email);
    };

    const body = this.extractBody(payload);
    const attachments = this.extractAttachments(payload);

    return {
      id: String(data.id ?? ''),
      threadId: String(data.threadId ?? ''),
      from: parseEmailAddress(getHeader('From')),
      to: parseEmailAddresses(getHeader('To')),
      cc: getHeader('Cc') ? parseEmailAddresses(getHeader('Cc')) : undefined,
      bcc: getHeader('Bcc') ? parseEmailAddresses(getHeader('Bcc')) : undefined,
      subject: getHeader('Subject'),
      date: new Date(Number(data.internalDate ?? 0)),
      body,
      attachments,
      labels: labelIds,
      isRead: !labelIds.includes('UNREAD'),
      isStarred: labelIds.includes('STARRED'),
    };
  }

  private extractBody(payload: Record<string, unknown>): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};

    const extractFromPart = (part: Record<string, unknown>): void => {
      const mimeType = String(part.mimeType ?? '');
      const body = part.body as Record<string, unknown> | undefined;
      const parts = part.parts as Array<Record<string, unknown>> | undefined;

      if (mimeType === 'text/plain' && body?.data) {
        result.text = Buffer.from(String(body.data), 'base64url').toString('utf-8');
      } else if (mimeType === 'text/html' && body?.data) {
        result.html = Buffer.from(String(body.data), 'base64url').toString('utf-8');
      } else if (parts) {
        parts.forEach(extractFromPart);
      }
    };

    extractFromPart(payload);
    return result;
  }

  private extractAttachments(
    payload: Record<string, unknown>
  ): Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> {
    const attachments: Array<{
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
    }> = [];

    const extractFromPart = (part: Record<string, unknown>): void => {
      const body = part.body as Record<string, unknown> | undefined;
      const parts = part.parts as Array<Record<string, unknown>> | undefined;

      if (body?.attachmentId && part.filename) {
        attachments.push({
          filename: String(part.filename),
          mimeType: String(part.mimeType ?? 'application/octet-stream'),
          size: Number(body.size ?? 0),
          attachmentId: String(body.attachmentId),
        });
      }

      if (parts) {
        parts.forEach(extractFromPart);
      }
    };

    extractFromPart(payload);
    return attachments;
  }

  private mapToGmailMessage(data: Record<string, unknown>): GmailMessage {
    const payload = (data.payload as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      threadId: String(data.threadId ?? ''),
      labelIds: (data.labelIds as string[]) ?? [],
      snippet: String(data.snippet ?? ''),
      historyId: String(data.historyId ?? ''),
      internalDate: new Date(Number(data.internalDate ?? 0)),
      payload: {
        headers: (payload.headers as Array<{ name: string; value: string }>) ?? [],
        mimeType: String(payload.mimeType ?? ''),
        body: payload.body as { size: number; data?: string } | undefined,
        parts: payload.parts as GmailMessagePart[] | undefined,
      },
      sizeEstimate: Number(data.sizeEstimate ?? 0),
      raw: data.raw ? String(data.raw) : undefined,
    };
  }

  private mapToDraft(data: Record<string, unknown>): GmailDraft {
    const message = (data.message as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      message: this.mapToGmailMessage(message),
    };
  }

  private mapToLabel(data: Record<string, unknown>): GmailLabel {
    return {
      id: String(data.id ?? ''),
      name: String(data.name ?? ''),
      type: String(data.type ?? 'user') as 'system' | 'user',
      messageListVisibility: data.messageListVisibility as 'show' | 'hide' | undefined,
      labelListVisibility: data.labelListVisibility as
        | 'labelShow'
        | 'labelShowIfUnread'
        | 'labelHide'
        | undefined,
      messagesTotal: data.messagesTotal ? Number(data.messagesTotal) : undefined,
      messagesUnread: data.messagesUnread ? Number(data.messagesUnread) : undefined,
      threadsTotal: data.threadsTotal ? Number(data.threadsTotal) : undefined,
      threadsUnread: data.threadsUnread ? Number(data.threadsUnread) : undefined,
    };
  }
}

export default GmailAdapter;
