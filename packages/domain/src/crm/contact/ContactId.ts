import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidContactIdError extends DomainError {
  readonly code = 'INVALID_CONTACT_ID';

  constructor(value: string) {
    super(`Invalid contact ID: ${value}`);
  }
}

interface ContactIdProps {
  value: string;
}

/**
 * Contact ID Value Object
 * Encapsulates contact identifier validation
 */
export class ContactId extends ValueObject<ContactIdProps> {
  private constructor(props: ContactIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<ContactId, InvalidContactIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidContactIdError(value));
    }
    return Result.ok(new ContactId({ value }));
  }

  static generate(): ContactId {
    return new ContactId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
