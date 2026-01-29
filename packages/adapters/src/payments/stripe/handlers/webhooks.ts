/**
 * Stripe Webhook Operations
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig, StripeWebhookEvent } from '../types';
import { StripeInvalidRequestError } from '../errors';

export function constructWebhookEvent(
  config: StripeConfig,
  payload: string,
  signature: string
): Result<StripeWebhookEvent, DomainError> {
  if (!config.webhookSecret) {
    return Result.fail(new StripeInvalidRequestError('Webhook secret not configured'));
  }

  try {
    // Parse signature header
    const elements = signature.split(',');
    const signatureMap: Record<string, string> = {};

    elements.forEach((element) => {
      const [key, value] = element.split('=');
      signatureMap[key] = value;
    });

    const timestamp = signatureMap['t'];
    const v1Signature = signatureMap['v1'];

    if (!timestamp || !v1Signature) {
      return Result.fail(new StripeInvalidRequestError('Invalid signature format'));
    }

    // Check timestamp tolerance (5 minutes)
    const tolerance = 300;
    const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);

    if (timestampAge > tolerance) {
      return Result.fail(new StripeInvalidRequestError('Webhook timestamp too old'));
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = createHmac('sha256', config.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Compare signatures
    const signaturesMatch = timingSafeEqual(
      Buffer.from(v1Signature),
      Buffer.from(expectedSignature)
    );

    if (!signaturesMatch) {
      return Result.fail(new StripeInvalidRequestError('Invalid signature'));
    }

    const event = JSON.parse(payload);

    return Result.ok({
      id: event.id,
      type: event.type,
      data: {
        object: event.data.object,
        previousAttributes: event.data.previous_attributes,
      },
      created: new Date(event.created * 1000),
      livemode: event.livemode,
    });
  } catch (error) {
    return Result.fail(
      new StripeInvalidRequestError(
        error instanceof Error ? error.message : 'Invalid webhook payload'
      )
    );
  }
}
