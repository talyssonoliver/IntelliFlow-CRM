/**
 * Slack Direct Message Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackChannel } from '../types';
import { SlackConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToChannel } from '../mappers';

export async function openDirectMessage(
  config: SlackConfig,
  userId: string
): Promise<Result<SlackChannel, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.open', {
      users: userId,
    });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToChannel(response.value.channel as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function openGroupDirectMessage(
  config: SlackConfig,
  userIds: string[]
): Promise<Result<SlackChannel, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.open', {
      users: userIds.join(','),
    });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToChannel(response.value.channel as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
