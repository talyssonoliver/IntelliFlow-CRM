import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidTaskIdError extends DomainError {
  readonly code = 'INVALID_TASK_ID';

  constructor(value: string) {
    super(`Invalid task ID: ${value}`);
  }
}

interface TaskIdProps {
  value: string;
}

/**
 * Task ID Value Object
 * Encapsulates task identifier validation
 */
export class TaskId extends ValueObject<TaskIdProps> {
  private constructor(props: TaskIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<TaskId, InvalidTaskIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidTaskIdError(value));
    }
    return Result.ok(new TaskId({ value }));
  }

  static generate(): TaskId {
    return new TaskId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
