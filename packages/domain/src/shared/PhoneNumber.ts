import { ValueObject } from './ValueObject';
import { Result, DomainError } from './Result';

export class InvalidPhoneNumberError extends DomainError {
  readonly code = 'INVALID_PHONE_NUMBER';

  constructor(value: string) {
    super(`Invalid phone number: ${value}`);
  }
}

interface PhoneNumberProps {
  value: string;
}

/**
 * PhoneNumber Value Object
 * Encapsulates phone number validation and E.164 formatting
 *
 * E.164 format: +[country code][subscriber number]
 * Example: +14155552671 (US), +442071838750 (UK)
 */
export class PhoneNumber extends ValueObject<PhoneNumberProps> {
  // E.164: + followed by 1-15 digits
  private static readonly E164_REGEX = /^\+[1-9]\d{1,14}$/;

  // Flexible input pattern (allows various formats to be normalized)
  private static readonly FLEXIBLE_REGEX = /^[\d\s()+-]+$/;

  private constructor(props: PhoneNumberProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  get countryCode(): string {
    // Extract country code (1-3 digits after +)
    const match = this.props.value.match(/^\+(\d{1,3})/);
    return match ? match[1] : '';
  }

  get nationalNumber(): string {
    // Remove country code prefix
    return this.props.value.replace(/^\+\d{1,3}/, '');
  }

  /**
   * Create PhoneNumber from string input
   * Accepts various formats and normalizes to E.164
   */
  static create(value: string | null | undefined): Result<PhoneNumber, InvalidPhoneNumberError> {
    if (!value) {
      return Result.fail(new InvalidPhoneNumberError('empty'));
    }

    const trimmed = value.trim();

    // Check if input contains only valid characters
    if (!PhoneNumber.FLEXIBLE_REGEX.test(trimmed)) {
      return Result.fail(new InvalidPhoneNumberError(value));
    }

    // Normalize: remove all non-digit characters except leading +
    let normalized = trimmed.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      // Assume US/Canada if no country code (NANP default)
      // This is a simplification - in production, use user's locale
      if (normalized.length === 10) {
        normalized = `+1${normalized}`;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = `+${normalized}`;
      } else {
        return Result.fail(new InvalidPhoneNumberError(value));
      }
    }

    // Validate E.164 format
    if (!PhoneNumber.E164_REGEX.test(normalized)) {
      return Result.fail(new InvalidPhoneNumberError(value));
    }

    return Result.ok(new PhoneNumber({ value: normalized }));
  }

  /**
   * Format for display
   * Example: +14155552671 → +1 (415) 555-2671
   */
  get formatted(): string {
    const cc = this.countryCode;
    const national = this.nationalNumber;

    // US/Canada formatting (NANP)
    if (cc === '1' && national.length === 10) {
      return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    }

    // UK formatting
    if (cc === '44' && national.length === 10) {
      return `+44 ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
    }

    // Generic international format
    return `+${cc} ${national}`;
  }

  /**
   * Format for linking (tel: protocol)
   */
  get telLink(): string {
    return `tel:${this.props.value}`;
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.formatted;
  }
}
