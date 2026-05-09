import { generateUuid as uuidv4, isValidEntityId } from '../../shared/uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidAccountIdError extends DomainError {
  readonly code = 'INVALID_ACCOUNT_ID';

  constructor(value: string) {
    super(`Invalid account ID: ${value}`);
  }
}

interface AccountIdProps {
  value: string;
}

/**
 * Account ID Value Object
 * Encapsulates account identifier validation
 */
export class AccountId extends ValueObject<AccountIdProps> {
  private constructor(props: AccountIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<AccountId, InvalidAccountIdError> {
    if (!value || !isValidEntityId(value)) {
      return Result.fail(new InvalidAccountIdError(value));
    }
    return Result.ok(new AccountId({ value }));
  }

  static generate(): AccountId {
    return new AccountId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
