/**
 * Slack User Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackUser } from '../types';
import { SlackConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToUser } from '../mappers';

export async function listUsers(
  config: SlackConfig,
  limit: number = 100,
  cursor?: string
): Promise<Result<{ users: SlackUser[]; nextCursor?: string }, DomainError>> {
  try {
    const params: Record<string, unknown> = { limit };
    if (cursor) params.cursor = cursor;

    const response = await makeRequest(config, 'GET', '/users.list', params);

    if (response.isFailure) return Result.fail(response.error);

    const users = ((response.value.members as Array<Record<string, unknown>>) ?? []).map((u) =>
      mapToUser(u)
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

export async function getUser(
  config: SlackConfig,
  userId: string
): Promise<Result<SlackUser | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/users.info', { user: userId });

    if (response.isFailure) {
      if (response.error.code === 'SLACK_NOT_FOUND') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToUser(response.value.user as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getUserByEmail(
  config: SlackConfig,
  email: string
): Promise<Result<SlackUser | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/users.lookupByEmail', { email });

    if (response.isFailure) {
      if (response.error.code === 'SLACK_NOT_FOUND') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToUser(response.value.user as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
