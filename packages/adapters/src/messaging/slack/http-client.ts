/**
 * Slack HTTP Client
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig } from './types';
import {
  SlackAuthenticationError,
  SlackRateLimitError,
  SlackNotFoundError,
  SlackInvalidRequestError,
} from './errors';

const API_BASE_URL = 'https://slack.com/api';

export async function makeRequest(
  config: SlackConfig,
  method: string,
  endpoint: string,
  params?: Record<string, unknown>
): Promise<Result<Record<string, unknown>, DomainError>> {
  let url = `${API_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${config.botToken}`,
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
  const data = (await response.json()) as Record<string, unknown> & {
    ok: boolean;
    error?: string;
  };

  if (!data.ok) {
    return handleErrorResponse(data.error as string);
  }

  return Result.ok(data as Record<string, unknown>);
}

export function handleErrorResponse(
  error: string
): Result<Record<string, unknown>, DomainError> {
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

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
