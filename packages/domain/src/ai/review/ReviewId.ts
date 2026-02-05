import { v4 as uuidv4, validate as isValidUuid } from 'uuid';
import { ValueObject } from '../../shared/ValueObject';
import { DomainError } from '../../shared/Result';

/**
 * Error thrown when an invalid review ID is provided
 */
export class InvalidReviewIdError extends DomainError {
  readonly code = 'INVALID_REVIEW_ID';

  constructor(value: string) {
    super(`Invalid review ID format: ${value}`);
  }
}

interface ReviewIdProps {
  value: string;
}

/**
 * Value Object representing a unique review identifier
 */
export class ReviewId extends ValueObject<ReviewIdProps> {
  private constructor(props: ReviewIdProps) {
    super(props);
  }

  /**
   * Creates a new ReviewId
   * @param value - Optional UUID string. If not provided, a new UUID is generated
   * @throws InvalidReviewIdError if provided value is not a valid UUID
   */
  static create(value?: string): ReviewId {
    if (value !== undefined) {
      if (!value || !isValidUuid(value)) {
        throw new InvalidReviewIdError(value || '');
      }
      return new ReviewId({ value });
    }
    return new ReviewId({ value: uuidv4() });
  }

  /**
   * Get the raw UUID string
   */
  toValue(): string {
    return this.props.value;
  }

  /**
   * Get the UUID string representation
   */
  toString(): string {
    return this.props.value;
  }

  /**
   * Compare with another ReviewId for equality
   */
  equals(other: ReviewId): boolean {
    if (!other) return false;
    return this.props.value === other.props.value;
  }
}
