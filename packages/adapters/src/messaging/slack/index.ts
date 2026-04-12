/**
 * Slack Messaging Adapter Module
 *
 * Refactored from monolithic client.ts
 */

// Main adapter
export { SlackAdapter } from './adapter';
export type { SlackMessagingPort } from './adapter';

// Types
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

// Errors
export {
  SlackAuthenticationError,
  SlackRateLimitError,
  SlackConnectionError,
  SlackNotFoundError,
  SlackInvalidRequestError,
} from './errors';

// Mappers (for testing/extension)
export { mapToMessage, mapToChannel, mapToUser, mapToFile, mapReactions } from './mappers';

// Default export for backward compatibility
export { SlackAdapter as default } from './adapter';
