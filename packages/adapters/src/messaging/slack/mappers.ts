/**
 * Slack Data Mappers
 */

import type {
  SlackMessage,
  SlackChannel,
  SlackUser,
  SlackFile,
  SlackAttachment,
  SlackBlock,
} from './types';

export function mapToMessage(data: Record<string, unknown>): SlackMessage {
  return {
    ts: (data.ts as string | null | undefined) ?? '',
    channelId: (data.channel as string | null | undefined) ?? '',
    text: (data.text as string | null | undefined) ?? '',
    userId: (data.user as string | null | undefined) ?? '',
    username: data.username ? (data.username as string) : undefined,
    botId: data.bot_id ? (data.bot_id as string) : undefined,
    type: (data.type as string | null | undefined) ?? 'message',
    subtype: data.subtype ? (data.subtype as string) : undefined,
    threadTs: data.thread_ts ? (data.thread_ts as string) : undefined,
    replyCount: data.reply_count ? Number(data.reply_count) : undefined,
    replyUsersCount: data.reply_users_count ? Number(data.reply_users_count) : undefined,
    latestReply: data.latest_reply ? (data.latest_reply as string) : undefined,
    reactions: data.reactions as SlackMessage['reactions'],
    attachments: data.attachments as SlackAttachment[] | undefined,
    blocks: data.blocks as SlackBlock[] | undefined,
    files: data.files
      ? (data.files as Array<Record<string, unknown>>).map((f) => mapToFile(f))
      : undefined,
    edited: data.edited
      ? {
          user: ((data.edited as Record<string, unknown>).user as string | null | undefined) ?? '',
          ts: ((data.edited as Record<string, unknown>).ts as string | null | undefined) ?? '',
        }
      : undefined,
  };
}

export function mapToChannel(data: Record<string, unknown>): SlackChannel {
  const topic = data.topic as Record<string, unknown> | undefined;
  const purpose = data.purpose as Record<string, unknown> | undefined;

  return {
    id: (data.id as string | null | undefined) ?? '',
    name: (data.name as string | null | undefined) ?? '',
    isChannel: Boolean(data.is_channel),
    isPrivate: Boolean(data.is_private),
    isArchived: Boolean(data.is_archived),
    isMember: Boolean(data.is_member),
    isGeneral: Boolean(data.is_general),
    topic: topic
      ? {
          value: (topic.value as string | null | undefined) ?? '',
          creator: (topic.creator as string | null | undefined) ?? '',
          lastSet: Number(topic.last_set ?? 0),
        }
      : undefined,
    purpose: purpose
      ? {
          value: (purpose.value as string | null | undefined) ?? '',
          creator: (purpose.creator as string | null | undefined) ?? '',
          lastSet: Number(purpose.last_set ?? 0),
        }
      : undefined,
    memberCount: data.num_members ? Number(data.num_members) : undefined,
    created: Number(data.created ?? 0),
    creator: (data.creator as string | null | undefined) ?? '',
  };
}

export function mapToUser(data: Record<string, unknown>): SlackUser {
  const profile = (data.profile as Record<string, unknown>) ?? {};

  return {
    id: (data.id as string | null | undefined) ?? '',
    teamId: (data.team_id as string | null | undefined) ?? '',
    name: (data.name as string | null | undefined) ?? '',
    realName: profile.real_name ? (profile.real_name as string) : undefined,
    displayName: profile.display_name ? (profile.display_name as string) : undefined,
    email: profile.email ? (profile.email as string) : undefined,
    phone: profile.phone ? (profile.phone as string) : undefined,
    title: profile.title ? (profile.title as string) : undefined,
    statusText: profile.status_text ? (profile.status_text as string) : undefined,
    statusEmoji: profile.status_emoji ? (profile.status_emoji as string) : undefined,
    isAdmin: Boolean(data.is_admin),
    isOwner: Boolean(data.is_owner),
    isBot: Boolean(data.is_bot),
    deleted: Boolean(data.deleted),
    timezone: data.tz ? (data.tz as string) : undefined,
    image24: profile.image_24 ? (profile.image_24 as string) : undefined,
    image72: profile.image_72 ? (profile.image_72 as string) : undefined,
    image192: profile.image_192 ? (profile.image_192 as string) : undefined,
  };
}

export function mapToFile(data: Record<string, unknown>): SlackFile {
  return {
    id: (data.id as string | null | undefined) ?? '',
    name: (data.name as string | null | undefined) ?? '',
    title: data.title ? (data.title as string) : undefined,
    mimetype: (data.mimetype as string | null | undefined) ?? 'application/octet-stream',
    size: Number(data.size ?? 0),
    urlPrivate: data.url_private ? (data.url_private as string) : undefined,
    urlPrivateDownload: data.url_private_download
      ? (data.url_private_download as string)
      : undefined,
    permalink: data.permalink ? (data.permalink as string) : undefined,
    permalinkPublic: data.permalink_public ? (data.permalink_public as string) : undefined,
  };
}

export function mapReactions(
  reactions: Array<Record<string, unknown>>
): Array<{ name: string; count: number; users: string[] }> {
  return reactions.map((r) => ({
    name: (r.name as string | null | undefined) ?? '',
    count: Number(r.count ?? 0),
    users: (r.users as string[]) ?? [],
  }));
}
