import { DomainError } from '@intelliflow/domain';

/**
 * Base error class for all adapter errors
 * Provides common functionality for external service adapter errors
 *
 * @see packages/domain/src/shared/Result.ts for DomainError base
 */
export abstract class AdapterError extends DomainError {
  abstract readonly code: string;
  readonly provider: string;
  readonly timestamp: Date;
  readonly requestId?: string;

  constructor(message: string, provider: string, requestId?: string) {
    super(message);
    this.provider = provider;
    this.timestamp = new Date();
    this.requestId = requestId;
  }

  /**
   * Create a serializable representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
    };
  }
}

/**
 * Generic adapter API error for unexpected failures
 */
export class UnexpectedAdapterError extends AdapterError {
  readonly code = 'ADAPTER_UNEXPECTED_ERROR';

  constructor(message: string, provider: string, requestId?: string) {
    super(`Unexpected ${provider} error: ${message}`, provider, requestId);
  }
}
