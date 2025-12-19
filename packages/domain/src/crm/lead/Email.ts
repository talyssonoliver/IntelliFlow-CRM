import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(value: string) {
    super(`Invalid email address: ${value}`);
  }
}

interface EmailProps {
  value: string;
}

/**
 * Email Value Object
 * Encapsulates email validation and formatting
 */
export class Email extends ValueObject<EmailProps> {
  // Safe regex with bounded quantifiers to prevent ReDoS
  // Local part: up to 64 chars, domain: up to 255 chars total
  private static readonly EMAIL_REGEX =
    /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}$/;
  private static readonly MAX_EMAIL_LENGTH = 320; // RFC 5321

  private constructor(props: EmailProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  get domain(): string {
    return this.props.value.split('@')[1];
  }

  get localPart(): string {
    return this.props.value.split('@')[0];
  }

  static create(value: string): Result<Email, InvalidEmailError> {
    if (!value) {
      return Result.fail(new InvalidEmailError('empty'));
    }

    const normalizedEmail = value.toLowerCase().trim();

    // Length check before regex to prevent ReDoS on very long inputs
    if (normalizedEmail.length > Email.MAX_EMAIL_LENGTH) {
      return Result.fail(new InvalidEmailError(value));
    }

    if (!Email.EMAIL_REGEX.test(normalizedEmail)) {
      return Result.fail(new InvalidEmailError(value));
    }

    return Result.ok(new Email({ value: normalizedEmail }));
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
