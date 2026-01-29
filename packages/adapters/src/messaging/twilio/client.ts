/**
 * Twilio SMS Client Adapter
 *
 * Provides a reusable Twilio client wrapper for SMS operations.
 * Used by the notifications worker SMS channel.
 *
 * @module adapters/messaging/twilio
 * @task IFC-170 - Implement Twilio SMS channel
 * @artifact packages/adapters/src/messaging/twilio/client.ts
 */

import { Twilio } from 'twilio';
import { z } from 'zod';

// ============================================================================
// Configuration Schema
// ============================================================================

export const TwilioConfigSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  fromNumber: z.string().min(10),
  statusCallbackUrl: z.string().url().optional(),
  messagingServiceSid: z.string().optional(),
});

export type TwilioConfig = z.infer<typeof TwilioConfigSchema>;

// ============================================================================
// Message Types
// ============================================================================

export interface SendSMSRequest {
  to: string;
  body: string;
  from?: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

export interface SendSMSResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  numSegments: number;
  price?: string;
  priceUnit?: string;
  dateCreated: Date;
  errorCode?: string;
  errorMessage?: string;
}

export interface MessageStatus {
  sid: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  errorCode?: string;
  errorMessage?: string;
  dateUpdated: Date;
}

// ============================================================================
// Twilio Client Wrapper
// ============================================================================

export class TwilioClient {
  private readonly client: Twilio;
  private readonly config: TwilioConfig;

  constructor(config: TwilioConfig) {
    this.config = TwilioConfigSchema.parse(config);
    this.client = new Twilio(config.accountSid, config.authToken);
  }

  /**
   * Send an SMS message
   */
  async sendSMS(request: SendSMSRequest): Promise<SendSMSResponse> {
    const message = await this.client.messages.create({
      to: request.to,
      body: request.body,
      from: request.from || this.config.fromNumber,
      mediaUrl: request.mediaUrls,
      statusCallback: request.statusCallback || this.config.statusCallbackUrl,
      messagingServiceSid: this.config.messagingServiceSid,
    });

    return {
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body || '',
      numSegments: parseInt(message.numSegments || '1', 10),
      price: message.price ?? undefined,
      priceUnit: message.priceUnit ?? undefined,
      dateCreated: message.dateCreated,
      errorCode: message.errorCode?.toString(),
      errorMessage: message.errorMessage ?? undefined,
    };
  }

  /**
   * Get message status by SID
   */
  async getMessageStatus(sid: string): Promise<MessageStatus> {
    const message = await this.client.messages(sid).fetch();

    return {
      sid: message.sid,
      status: message.status as MessageStatus['status'],
      errorCode: message.errorCode?.toString(),
      errorMessage: message.errorMessage ?? undefined,
      dateUpdated: message.dateUpdated,
    };
  }

  /**
   * List recent messages
   */
  async listMessages(options?: {
    to?: string;
    from?: string;
    dateSentAfter?: Date;
    limit?: number;
  }): Promise<SendSMSResponse[]> {
    const messages = await this.client.messages.list({
      to: options?.to,
      from: options?.from,
      dateSentAfter: options?.dateSentAfter,
      limit: options?.limit || 20,
    });

    return messages.map((message) => ({
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body || '',
      numSegments: parseInt(message.numSegments || '1', 10),
      price: message.price ?? undefined,
      priceUnit: message.priceUnit ?? undefined,
      dateCreated: message.dateCreated,
      errorCode: message.errorCode?.toString(),
      errorMessage: message.errorMessage ?? undefined,
    }));
  }

  /**
   * Validate phone number format
   */
  async lookupPhoneNumber(phoneNumber: string): Promise<{
    valid: boolean;
    phoneNumber: string;
    countryCode: string;
    carrier?: {
      name: string;
      type: string;
    };
  }> {
    try {
      const lookup = await this.client.lookups.v2.phoneNumbers(phoneNumber).fetch();

      return {
        valid: lookup.valid,
        phoneNumber: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        carrier: lookup.callerName
          ? {
              name: lookup.callerName.callerName || '',
              type: lookup.callerName.callerType || '',
            }
          : undefined,
      };
    } catch (error) {
      return {
        valid: false,
        phoneNumber,
        countryCode: '',
      };
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(): Promise<{
    balance: string;
    currency: string;
  }> {
    const account = await this.client.api.v2010.accounts(this.config.accountSid).fetch();

    return {
      balance: account.balance ?? '0',
      currency: account.currency ?? 'USD',
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTwilioClient(config?: Partial<TwilioConfig>): TwilioClient {
  const fullConfig: TwilioConfig = {
    accountSid: config?.accountSid || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: config?.authToken || process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: config?.fromNumber || process.env.TWILIO_FROM_NUMBER || '',
    statusCallbackUrl: config?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL,
    messagingServiceSid: config?.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID,
  };

  return new TwilioClient(fullConfig);
}

// Export singleton for convenience
let defaultClient: TwilioClient | null = null;

export function getTwilioClient(): TwilioClient {
  if (!defaultClient) {
    defaultClient = createTwilioClient();
  }
  return defaultClient;
}
