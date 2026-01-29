/**
 * Slack Webhook Handlers
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig, SlackWebhookEvent } from '../types';
import { SlackInvalidRequestError } from '../errors';

export function verifyWebhookSignature(
  config: SlackConfig,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  if (!config.signingSecret) return false;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;

  if (parseInt(timestamp) < fiveMinutesAgo) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac('sha256', config.signingSecret)
    .update(sigBasestring)
    .digest('hex')}`;

  const myBuffer = Buffer.from(mySignature);
  const theirBuffer = Buffer.from(signature);

  // timingSafeEqual requires same length buffers - reject if lengths differ
  if (myBuffer.length !== theirBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(myBuffer, theirBuffer);
}

export function parseWebhookEvent(body: string): Result<SlackWebhookEvent, DomainError> {
  try {
    const event = JSON.parse(body);

    return Result.ok({
      type: event.type,
      token: event.token,
      teamId: event.team_id,
      apiAppId: event.api_app_id,
      event: event.event,
      eventId: event.event_id,
      eventTime: event.event_time,
      challenge: event.challenge,
    });
  } catch (error) {
    return Result.fail(
      new SlackInvalidRequestError(
        error instanceof Error ? error.message : 'Invalid webhook payload'
      )
    );
  }
}
