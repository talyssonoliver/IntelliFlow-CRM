import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidOpportunityIdError extends DomainError {
  readonly code = 'INVALID_OPPORTUNITY_ID';

  constructor(value: string) {
    super(`Invalid opportunity ID: ${value}`);
  }
}

interface OpportunityIdProps {
  value: string;
}

/**
 * Opportunity ID Value Object
 * Encapsulates opportunity identifier validation
 */
export class OpportunityId extends ValueObject<OpportunityIdProps> {
  private constructor(props: OpportunityIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): Result<OpportunityId, InvalidOpportunityIdError> {
    if (!value || !uuidValidate(value)) {
      return Result.fail(new InvalidOpportunityIdError(value));
    }
    return Result.ok(new OpportunityId({ value }));
  }

  static generate(): OpportunityId {
    return new OpportunityId({ value: uuidv4() });
  }

  toValue(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
