import { generateUuid as uuidv4, isValidUuid as uuidValidate } from '../../shared/uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidTicketIdError extends DomainError {
  readonly code = 'INVALID_TICKET_ID';

  constructor(value: string) {
    super(`Invalid ticket ID: ${value}`);
  }
}

interface TicketIdProps {
  value: string;
}

/**
 * Ticket ID Value Object
 *
 * Encapsulates ticket identifier validation using UUID format.
 * Follows the same pattern as other domain entities (LeadId, TaskId, etc.)
 */
export class TicketId extends ValueObject<TicketIdProps> {
  private constructor(props: TicketIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  /**
   * Creates a TicketId from an existing UUID string.
   * @param value - The UUID string to validate and wrap
   * @returns Result with TicketId or InvalidTicketIdError
   */
  static create(value: string): Result<TicketId, InvalidTicketIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidTicketIdError(value));
    }
    return Result.ok(new TicketId({ value }));
  }

  /**
   * Generates a new unique TicketId using UUID v4.
   * @returns A new TicketId with a generated UUID
   */
  static generate(): TicketId {
    return new TicketId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
