import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidLeadIdError extends DomainError {
  readonly code = 'INVALID_LEAD_ID';

  constructor(value: string) {
    super(`Invalid lead ID: ${value}`);
  }
}

interface LeadIdProps {
  value: string;
}

/**
 * Lead ID Value Object
 * Encapsulates lead identifier validation
 */
export class LeadId extends ValueObject<LeadIdProps> {
  private constructor(props: LeadIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<LeadId, InvalidLeadIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidLeadIdError(value));
    }
    return Result.ok(new LeadId({ value }));
  }

  static generate(): LeadId {
    return new LeadId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
