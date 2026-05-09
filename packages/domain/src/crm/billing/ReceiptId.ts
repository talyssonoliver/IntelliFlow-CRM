import { generateUuid as uuidv4, isValidEntityId } from '../../shared/uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidReceiptIdError extends DomainError {
  readonly code = 'INVALID_RECEIPT_ID';

  constructor(value: string) {
    super(`Invalid receipt ID: ${value}`);
  }
}

interface ReceiptIdProps {
  value: string;
}

export class ReceiptId extends ValueObject<ReceiptIdProps> {
  private constructor(props: ReceiptIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<ReceiptId, InvalidReceiptIdError> {
    if (!value || !isValidEntityId(value)) {
      return Result.fail(new InvalidReceiptIdError(value));
    }
    return Result.ok(new ReceiptId({ value }));
  }

  static generate(): ReceiptId {
    return new ReceiptId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
