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
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
