/**
 * Slack Message Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  SlackConfig,
  SlackMessage,
  SlackPostMessageParams,
  PostMessageResult,
  UpdateMessageParams,
} from '../types';
import { SlackConnectionError } from '../errors';
import { makeRequest } from '../http-client';
import { mapToMessage } from '../mappers';

export async function postMessage(
  config: SlackConfig,
  params: SlackPostMessageParams
): Promise<Result<PostMessageResult, DomainError>> {
  try {
    const body: Record<string, unknown> = {
      channel: params.channelId,
      text: params.text,
      mrkdwn: params.mrkdwn ?? true,
    };

    if (params.blocks) body.blocks = params.blocks;
    if (params.attachments) body.attachments = params.attachments;
    if (params.threadTs) body.thread_ts = params.threadTs;
    if (params.replyBroadcast) body.reply_broadcast = params.replyBroadcast;
    if (params.unfurlLinks !== undefined) body.unfurl_links = params.unfurlLinks;
    if (params.unfurlMedia !== undefined) body.unfurl_media = params.unfurlMedia;

    const response = await makeRequest(config, 'POST', '/chat.postMessage', body);

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok({
      ok: true,
      channelId: String(response.value.channel ?? ''),
      ts: String(response.value.ts ?? ''),
      message: mapToMessage(response.value.message as Record<string, unknown>),
    });
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function updateMessage(
  config: SlackConfig,
  params: UpdateMessageParams
): Promise<Result<PostMessageResult, DomainError>> {
  try {
    const body: Record<string, unknown> = {
      channel: params.channelId,
      ts: params.ts,
      text: params.text,
    };

    if (params.blocks) body.blocks = params.blocks;
    if (params.attachments) body.attachments = params.attachments;

    const response = await makeRequest(config, 'POST', '/chat.update', body);

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok({
      ok: true,
      channelId: String(response.value.channel ?? ''),
      ts: String(response.value.ts ?? ''),
      message: mapToMessage(response.value.message as Record<string, unknown>),
    });
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function deleteMessage(
  config: SlackConfig,
  channelId: string,
  ts: string
): Promise<Result<void, DomainError>> {
  try {
    const response = await makeRequest(config, 'POST', '/chat.delete', {
      channel: channelId,
      ts,
    });

    if (response.isFailure) return Result.fail(response.error);

    return Result.ok(undefined);
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getMessage(
  config: SlackConfig,
  channelId: string,
  ts: string
): Promise<Result<SlackMessage | null, DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/conversations.history', {
      channel: channelId,
      latest: ts,
      limit: 1,
      inclusive: true,
    });

    if (response.isFailure) {
      if (response.error.code === 'SLACK_NOT_FOUND') {
        return Result.ok(null);
      }
      return Result.fail(response.error);
    }

    const messages = (response.value.messages as Array<Record<string, unknown>>) ?? [];
    if (messages.length === 0) {
      return Result.ok(null);
    }

    return Result.ok(mapToMessage(messages[0]));
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getThreadReplies(
  config: SlackConfig,
  channelId: string,
  threadTs: string
): Promise<Result<SlackMessage[], DomainError>> {
  try {
    const response = await makeRequest(config, 'GET', '/conversations.replies', {
      channel: channelId,
      ts: threadTs,
    });

    if (response.isFailure) return Result.fail(response.error);

    const messages = ((response.value.messages as Array<Record<string, unknown>>) ?? []).map((m) =>
      mapToMessage(m)
    );
    return Result.ok(messages);
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

export async function getChannelHistory(
  config: SlackConfig,
  channelId: string,
  limit: number = 100,
  cursor?: string
): Promise<Result<{ messages: SlackMessage[]; nextCursor?: string }, DomainError>> {
  try {
    const params: Record<string, unknown> = {
      channel: channelId,
      limit,
    };

    if (cursor) params.cursor = cursor;

    const response = await makeRequest(config, 'GET', '/conversations.history', params);

    if (response.isFailure) return Result.fail(response.error);

    const messages = ((response.value.messages as Array<Record<string, unknown>>) ?? []).map((m) =>
      mapToMessage(m)
    );
    const metadata = response.value.response_metadata as Record<string, unknown> | undefined;

    return Result.ok({
      messages,
      nextCursor: metadata?.next_cursor ? String(metadata.next_cursor) : undefined,
    });
  } catch (error) {
    return Result.fail(
      new SlackConnectionError(error instanceof Error ? error.message : 'Unknown error')
    );
  }
}
