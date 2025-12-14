import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidLeadScoreError extends DomainError {
  readonly code = 'INVALID_LEAD_SCORE';

  constructor(value: number) {
    super(`Invalid lead score: ${value}. Score must be between 0 and 100.`);
  }
}

interface LeadScoreProps {
  value: number;
  confidence: number;
}

/**
 * Lead Score Value Object
 * Encapsulates AI-generated lead scoring with confidence
 */
export class LeadScore extends ValueObject<LeadScoreProps> {
  private static readonly MIN_SCORE = 0;
  private static readonly MAX_SCORE = 100;
  private static readonly MIN_CONFIDENCE = 0;
  private static readonly MAX_CONFIDENCE = 1;

  private constructor(props: LeadScoreProps) {
    super(props);
  }

  get value(): number {
    return this.props.value;
  }

  get confidence(): number {
    return this.props.confidence;
  }

  get tier(): 'HOT' | 'WARM' | 'COLD' {
    if (this.props.value >= 80) return 'HOT';
    if (this.props.value >= 50) return 'WARM';
    return 'COLD';
  }

  get isHighConfidence(): boolean {
    return this.props.confidence >= 0.8;
  }

  static create(
    value: number,
    confidence: number = 1
  ): Result<LeadScore, InvalidLeadScoreError> {
    if (value < LeadScore.MIN_SCORE || value > LeadScore.MAX_SCORE) {
      return Result.fail(new InvalidLeadScoreError(value));
    }

    const normalizedConfidence = Math.max(
      LeadScore.MIN_CONFIDENCE,
      Math.min(LeadScore.MAX_CONFIDENCE, confidence)
    );

    return Result.ok(
      new LeadScore({
        value: Math.round(value),
        confidence: normalizedConfidence,
      })
    );
  }

  static zero(): LeadScore {
    return new LeadScore({ value: 0, confidence: 1 });
  }

  toValue(): { score: number; confidence: number; tier: string } {
    return {
      score: this.props.value,
      confidence: this.props.confidence,
      tier: this.tier,
    };
  }
}
