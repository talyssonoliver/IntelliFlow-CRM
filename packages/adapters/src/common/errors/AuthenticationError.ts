import { AdapterError } from './AdapterError';

/**
 * Base authentication error for all adapters
 * Handles OAuth, API key, and other auth failures
 */
export class AuthenticationError extends AdapterError {
  readonly code: string;
  readonly authType: 'oauth' | 'api_key' | 'bearer' | 'basic' | 'unknown';
  readonly isExpired: boolean;
  readonly isRevoked: boolean;

  constructor(
    code: string,
    provider: string,
    options?: {
      authType?: 'oauth' | 'api_key' | 'bearer' | 'basic' | 'unknown';
      isExpired?: boolean;
      isRevoked?: boolean;
      requestId?: string;
      message?: string;
    }
  ) {
    const message =
      options?.message ?? `Authentication failed for ${provider}`;
    super(message, provider, options?.requestId);
    this.code = code;
    this.authType = options?.authType ?? 'unknown';
    this.isExpired = options?.isExpired ?? false;
    this.isRevoked = options?.isRevoked ?? false;
  }

  /**
   * Check if the error is recoverable (e.g., token refresh might help)
   */
  isRecoverable(): boolean {
    return this.isExpired && !this.isRevoked;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      authType: this.authType,
      isExpired: this.isExpired,
      isRevoked: this.isRevoked,
      isRecoverable: this.isRecoverable(),
    };
  }
}
