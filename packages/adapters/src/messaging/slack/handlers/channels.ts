/**
 * Slack Channel Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackChannel } from '../types';
import { SlackConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToChannel } from '../mappers';

export async function listChannels(
  config: SlackConfig,
  excludeArchived: boolean = true,
  limit: number = 100
): Promise<Result<SlackChannel[], DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/conversations.list', {
      exclude_archived: excludeArchived,
      limit,
      types: 'public_channel,private_channel',
    });

    if (response.isFailure) return Result.fail(response.error);

    const channels = ((response.value.channels as Array<Record<string, unknown>>) ?? []).map((c) =>
      mapToChannel(c)
    );
    return Result.ok(channels);
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getChannel(
  config: SlackConfig,
  channelId: string
): Promise<Result<SlackChannel | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/conversations.info', {
      channel: channelId,
    });

    if (response.isFailure) {
      if (response.error.code === 'SLACK_NOT_FOUND') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    return Result.ok(mapToChannel(response.value.channel as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function createChannel(
  config: SlackConfig,
  name: string,
  isPrivate: boolean = false
): Promise<Result<SlackChannel, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.create', {
      name,
      is_private: isPrivate,
    });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToChannel(response.value.channel as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function archiveChannel(
  config: SlackConfig,
  channelId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.archive', {
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

export async function unarchiveChannel(
  config: SlackConfig,
  channelId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.unarchive', {
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

export async function joinChannel(
  config: SlackConfig,
  channelId: string
): Promise<Result<SlackChannel, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.join', {
      channel: channelId,
    });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(mapToChannel(response.value.channel as Record<string, unknown>));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function leaveChannel(
  config: SlackConfig,
  channelId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.leave', {
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

export async function inviteToChannel(
  config: SlackConfig,
  channelId: string,
  userIds: string[]
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.invite', {
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

export async function kickFromChannel(
  config: SlackConfig,
  channelId: string,
  userId: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.kick', {
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

export async function setChannelTopic(
  config: SlackConfig,
  channelId: string,
  topic: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.setTopic', {
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

export async function setChannelPurpose(
  config: SlackConfig,
  channelId: string,
  purpose: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/conversations.setPurpose', {
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
