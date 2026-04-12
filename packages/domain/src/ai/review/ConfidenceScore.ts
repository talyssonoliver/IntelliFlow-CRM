import { ValueObject } from '../../shared/ValueObject';
import { DomainError } from '../../shared/Result';

/**
 * Error thrown when an invalid confidence score is provided
 */
export class InvalidConfidenceScoreError extends DomainError {
  readonly code = 'INVALID_CONFIDENCE_SCORE';

  constructor(value: number) {
    super(`Confidence score must be between 0 and 1, got: ${value}`);
  }
}

interface ConfidenceScoreProps {
  value: number;
}

/**
 * Value Object representing an AI confidence score
 * Score must be between 0 and 1 (inclusive)
 */
export class ConfidenceScore extends ValueObject<ConfidenceScoreProps> {
  private constructor(props: ConfidenceScoreProps) {
    super(props);
  }

  /**
   * Creates a new ConfidenceScore
   * @param value - Score between 0 and 1
   * @throws InvalidConfidenceScoreError if value is outside valid range
   */
  static create(value: number): ConfidenceScore {
    if (Number.isNaN(value) || value < 0 || value > 1) {
      throw new InvalidConfidenceScoreError(value);
    }
    return new ConfidenceScore({ value });
  }

  /**
   * Get the raw numeric value
   */
  toValue(): number {
    return this.props.value;
  }

  /**
   * Check if score meets or exceeds a threshold
   * @param threshold - The confidence threshold to compare against
   */
  isAboveThreshold(threshold: number): boolean {
    return this.props.value >= threshold;
  }

  /**
   * Check if this score requires human review
   * @param threshold - The confidence threshold below which review is required
   */
  requiresReview(threshold: number): boolean {
    return this.props.value < threshold;
  }

  /**
   * Compare with another ConfidenceScore for equality
   */
  equals(other: ConfidenceScore): boolean {
    if (!other) return false;
    return this.props.value === other.props.value;
  }
}
