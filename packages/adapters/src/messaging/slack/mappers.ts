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
    ts: String(data.ts ?? ''),
    channelId: String(data.channel ?? ''),
    text: String(data.text ?? ''),
    userId: String(data.user ?? ''),
    username: data.username ? String(data.username) : undefined,
    botId: data.bot_id ? String(data.bot_id) : undefined,
    type: String(data.type ?? 'message'),
    subtype: data.subtype ? String(data.subtype) : undefined,
    threadTs: data.thread_ts ? String(data.thread_ts) : undefined,
    replyCount: data.reply_count ? Number(data.reply_count) : undefined,
    replyUsersCount: data.reply_users_count ? Number(data.reply_users_count) : undefined,
    latestReply: data.latest_reply ? String(data.latest_reply) : undefined,
    reactions: data.reactions as SlackMessage['reactions'],
    attachments: data.attachments as SlackAttachment[] | undefined,
    blocks: data.blocks as SlackBlock[] | undefined,
    files: data.files
      ? (data.files as Array<Record<string, unknown>>).map((f) => mapToFile(f))
      : undefined,
    edited: data.edited
      ? {
          user: String((data.edited as Record<string, unknown>).user ?? ''),
          ts: String((data.edited as Record<string, unknown>).ts ?? ''),
        }
      : undefined,
  };
}

export function mapToChannel(data: Record<string, unknown>): SlackChannel {
  const topic = data.topic as Record<string, unknown> | undefined;
  const purpose = data.purpose as Record<string, unknown> | undefined;

  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    isChannel: Boolean(data.is_channel),
    isPrivate: Boolean(data.is_private),
    isArchived: Boolean(data.is_archived),
    isMember: Boolean(data.is_member),
    isGeneral: Boolean(data.is_general),
    topic: topic
      ? {
          value: String(topic.value ?? ''),
          creator: String(topic.creator ?? ''),
          lastSet: Number(topic.last_set ?? 0),
        }
      : undefined,
    purpose: purpose
      ? {
          value: String(purpose.value ?? ''),
          creator: String(purpose.creator ?? ''),
          lastSet: Number(purpose.last_set ?? 0),
        }
      : undefined,
    memberCount: data.num_members ? Number(data.num_members) : undefined,
    created: Number(data.created ?? 0),
    creator: String(data.creator ?? ''),
  };
}

export function mapToUser(data: Record<string, unknown>): SlackUser {
  const profile = (data.profile as Record<string, unknown>) ?? {};

  return {
    id: String(data.id ?? ''),
    teamId: String(data.team_id ?? ''),
    name: String(data.name ?? ''),
    realName: profile.real_name ? String(profile.real_name) : undefined,
    displayName: profile.display_name ? String(profile.display_name) : undefined,
    email: profile.email ? String(profile.email) : undefined,
    phone: profile.phone ? String(profile.phone) : undefined,
    title: profile.title ? String(profile.title) : undefined,
    statusText: profile.status_text ? String(profile.status_text) : undefined,
    statusEmoji: profile.status_emoji ? String(profile.status_emoji) : undefined,
    isAdmin: Boolean(data.is_admin),
    isOwner: Boolean(data.is_owner),
    isBot: Boolean(data.is_bot),
    deleted: Boolean(data.deleted),
    timezone: data.tz ? String(data.tz) : undefined,
    image24: profile.image_24 ? String(profile.image_24) : undefined,
    image72: profile.image_72 ? String(profile.image_72) : undefined,
    image192: profile.image_192 ? String(profile.image_192) : undefined,
  };
}

export function mapToFile(data: Record<string, unknown>): SlackFile {
  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    title: data.title ? String(data.title) : undefined,
    mimetype: String(data.mimetype ?? 'application/octet-stream'),
    size: Number(data.size ?? 0),
    urlPrivate: data.url_private ? String(data.url_private) : undefined,
    urlPrivateDownload: data.url_private_download ? String(data.url_private_download) : undefined,
    permalink: data.permalink ? String(data.permalink) : undefined,
    permalinkPublic: data.permalink_public ? String(data.permalink_public) : undefined,
  };
}

export function mapReactions(
  reactions: Array<Record<string, unknown>>
): Array<{ name: string; count: number; users: string[] }> {
  return reactions.map((r) => ({
    name: String(r.name ?? ''),
    count: Number(r.count ?? 0),
    users: (r.users as string[]) ?? [],
  }));
}
