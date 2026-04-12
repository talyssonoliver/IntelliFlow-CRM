/**
 * Slack Error Types
 */

import { DomainError } from '@intelliflow/domain';

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
