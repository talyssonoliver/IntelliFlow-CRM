import { generateUuid as uuidv4, isValidEntityId } from '../../shared/uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidInvoiceIdError extends DomainError {
  readonly code = 'INVALID_INVOICE_ID';

  constructor(value: string) {
    super(`Invalid invoice ID: ${value}`);
  }
}

interface InvoiceIdProps {
  value: string;
}

export class InvoiceId extends ValueObject<InvoiceIdProps> {
  private constructor(props: InvoiceIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<InvoiceId, InvalidInvoiceIdError> {
    if (!value || !isValidEntityId(value)) {
      return Result.fail(new InvalidInvoiceIdError(value));
    }
    return Result.ok(new InvoiceId({ value }));
  }

  static generate(): InvoiceId {
    return new InvoiceId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
