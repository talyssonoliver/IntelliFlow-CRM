/**
 * Slack Messaging Adapter
 *
 * DEPRECATED: This file re-exports from the refactored module.
 * Import from './index' instead for new code.
 *
 * @see ./index.ts for the refactored module
 */

// Re-export everything for backward compatibility
export { SlackAdapter, SlackAdapter as default } from './adapter';

export type { SlackMessagingPort } from './adapter';

export type {
  SlackConfig,
  SlackUser,
  SlackChannel,
  SlackMessage,
  SlackAttachment,
  SlackBlock,
  SlackFile,
  SlackReaction,
  SlackPostMessageParams,
  PostMessageResult,
  UpdateMessageParams,
  SlackWebhookEvent,
  UploadFileParams,
} from './types';

export {
  SlackAuthenticationError,
  SlackRateLimitError,
  SlackConnectionError,
  SlackNotFoundError,
  SlackInvalidRequestError,
} from './errors';
