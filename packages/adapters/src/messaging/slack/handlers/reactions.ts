/**
 * Slack Reaction Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackReaction } from '../types';
import { SlackConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapReactions } from '../mappers';

export async function addReaction(
  config: SlackConfig,
  reaction: SlackReaction
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/reactions.add', {
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

export async function removeReaction(
  config: SlackConfig,
  reaction: SlackReaction
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/reactions.remove', {
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

export async function getReactions(
  config: SlackConfig,
  channelId: string,
  ts: string
): Promise<Result<Array<{ name: string; count: number; users: string[] }>, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/reactions.get', {
      channel: channelId,
      timestamp: ts,
    });

    if (response.isFailure) return Result.fail(response.error);

    const message = response.value.message as Record<string, unknown>;
    const reactions = (message?.reactions as Array<Record<string, unknown>>) ?? [];

    return Result.ok(mapReactions(reactions));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
