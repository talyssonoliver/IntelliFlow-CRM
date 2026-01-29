import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidCaseIdError extends DomainError {
  readonly code = 'INVALID_CASE_ID';

  constructor(value: string) {
    super(`Invalid case ID: ${value}`);
  }
}

interface CaseIdProps {
  value: string;
}

/**
 * Case ID Value Object
 * Encapsulates case identifier validation
 */
export class CaseId extends ValueObject<CaseIdProps> {
  private constructor(props: CaseIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<CaseId, InvalidCaseIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidCaseIdError(value));
    }
    return Result.ok(new CaseId({ value }));
  }

  static generate(): CaseId {
    return new CaseId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
