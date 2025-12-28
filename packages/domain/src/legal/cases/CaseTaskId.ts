import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidCaseTaskIdError extends DomainError {
  readonly code = 'INVALID_CASE_TASK_ID';

  constructor(value: string) {
    super(`Invalid case task ID: ${value}`);
  }
}

interface CaseTaskIdProps {
  value: string;
}

/**
 * Case Task ID Value Object
 * Encapsulates case task identifier validation
 */
export class CaseTaskId extends ValueObject<CaseTaskIdProps> {
  private constructor(props: CaseTaskIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<CaseTaskId, InvalidCaseTaskIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidCaseTaskIdError(value));
    }
    return Result.ok(new CaseTaskId({ value }));
  }

  static generate(): CaseTaskId {
    return new CaseTaskId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
