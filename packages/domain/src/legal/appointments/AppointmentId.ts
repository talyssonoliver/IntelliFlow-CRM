import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidAppointmentIdError extends DomainError {
  readonly code = 'INVALID_APPOINTMENT_ID';

  constructor(value: string) {
    super(`Invalid appointment ID: ${value}`);
  }
}

interface AppointmentIdProps {
  value: string;
}

/**
 * Appointment ID Value Object
 * Encapsulates appointment identifier validation
 */
export class AppointmentId extends ValueObject<AppointmentIdProps> {
  private constructor(props: AppointmentIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<AppointmentId, InvalidAppointmentIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidAppointmentIdError(value));
    }
    return Result.ok(new AppointmentId({ value }));
  }

  static generate(): AppointmentId {
    return new AppointmentId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
