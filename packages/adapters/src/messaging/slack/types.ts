/**
 * Slack Messaging Types
 */

export interface SlackConfig {
  botToken: string;
  signingSecret?: string;
  appToken?: string; // For Socket Mode
}

export interface SlackUser {
  id: string;
  teamId: string;
  name: string;
  realName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  title?: string;
  statusText?: string;
  statusEmoji?: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBot: boolean;
  deleted: boolean;
  timezone?: string;
  image24?: string;
  image72?: string;
  image192?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  isGeneral: boolean;
  topic?: { value: string; creator: string; lastSet: number };
  purpose?: { value: string; creator: string; lastSet: number };
  memberCount?: number;
  created: number;
  creator: string;
}

export interface SlackMessage {
  ts: string;
  channelId: string;
  text: string;
  userId: string;
  username?: string;
  botId?: string;
  type: string;
  subtype?: string;
  threadTs?: string;
  replyCount?: number;
  replyUsersCount?: number;
  latestReply?: string;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
  files?: SlackFile[];
  edited?: { user: string; ts: string };
}

export interface SlackAttachment {
  id?: number;
  fallback?: string;
  color?: string;
  pretext?: string;
  authorName?: string;
  authorLink?: string;
  authorIcon?: string;
  title?: string;
  titleLink?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  imageUrl?: string;
  thumbUrl?: string;
  footer?: string;
  footerIcon?: string;
  ts?: number;
}

export interface SlackBlock {
  type: string;
  blockId?: string;
  text?: { type: string; text: string; emoji?: boolean };
  accessory?: Record<string, unknown>;
  elements?: Array<Record<string, unknown>>;
}

export interface SlackFile {
  id: string;
  name: string;
  title?: string;
  mimetype: string;
  size: number;
  urlPrivate?: string;
  urlPrivateDownload?: string;
  permalink?: string;
  permalinkPublic?: string;
}

export interface SlackReaction {
  name: string;
  channelId: string;
  messageTs: string;
}

export interface SlackPostMessageParams {
  channelId: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  mrkdwn?: boolean;
}

export interface PostMessageResult {
  ok: boolean;
  channelId: string;
  ts: string;
  message: SlackMessage;
}

export interface UpdateMessageParams {
  channelId: string;
  ts: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackWebhookEvent {
  type: string;
  token?: string;
  teamId?: string;
  apiAppId?: string;
  event?: Record<string, unknown>;
  eventId?: string;
  eventTime?: number;
  challenge?: string;
}

export interface UploadFileParams {
  channels: string[];
  filename: string;
  content: string | Buffer;
  title?: string;
  initialComment?: string;
}
