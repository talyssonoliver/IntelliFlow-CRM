/**
 * ChurnRiskScore Value Object (IFC-095)
 *
 * Encapsulates churn risk score with validation, level determination,
 * and SLA hours calculation. Immutable and self-validating.
 *
 * @module @intelliflow/domain/intelligence
 */

import { ValueObject } from '../shared/ValueObject';
import { CHURN_RISK_SLA_HOURS, type ChurnRiskLevel } from '../ai/AIConstants';

export class InvalidChurnRiskScoreError extends Error {
  constructor(value: number) {
    super(`Invalid churn risk score: ${value}. Must be between 0 and 100.`);
    this.name = 'InvalidChurnRiskScoreError';
  }
}

export class InvalidConfidenceError extends Error {
  constructor(value: number) {
    super(`Invalid confidence: ${value}. Must be between 0 and 1.`);
    this.name = 'InvalidConfidenceError';
  }
}

interface ChurnRiskScoreProps {
  value: number;
  confidence: number;
}

/**
 * ChurnRiskScore value object representing customer churn risk
 *
 * Score ranges:
 * - CRITICAL: 80-100 (SLA: 24h)
 * - HIGH: 60-79 (SLA: 48h)
 * - MEDIUM: 40-59 (SLA: 168h/7 days)
 * - LOW: 20-39 (SLA: 336h/14 days)
 * - MINIMAL: 0-19 (SLA: 720h/30 days)
 */
export class ChurnRiskScore extends ValueObject<ChurnRiskScoreProps> {
  private constructor(props: ChurnRiskScoreProps) {
    super(props);
  }

  /**
   * Create a new ChurnRiskScore
   * @param value - Risk score from 0 to 100
   * @param confidence - Confidence level from 0 to 1
   * @throws InvalidChurnRiskScoreError if score is outside 0-100 range
   * @throws InvalidConfidenceError if confidence is outside 0-1 range
   */
  static create(value: number, confidence: number): ChurnRiskScore {
    if (value < 0 || value > 100) {
      throw new InvalidChurnRiskScoreError(value);
    }
    if (confidence < 0 || confidence > 1) {
      throw new InvalidConfidenceError(confidence);
    }
    return new ChurnRiskScore({ value, confidence });
  }

  /**
   * Get the raw score value (0-100)
   */
  getValue(): number {
    return this.props.value;
  }

  /**
   * Get the confidence score (0-1)
   */
  getConfidence(): number {
    return this.props.confidence;
  }

  /**
   * Get the risk level based on the score
   */
  get level(): ChurnRiskLevel {
    const { value } = this.props;
    if (value >= 80) return 'CRITICAL';
    if (value >= 60) return 'HIGH';
    if (value >= 40) return 'MEDIUM';
    if (value >= 20) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * Get SLA hours based on risk level
   */
  get slaHours(): number {
    return CHURN_RISK_SLA_HOURS[this.level];
  }

  /**
   * Check if prediction has high confidence (>= 0.7)
   */
  isHighConfidence(): boolean {
    return this.props.confidence >= 0.7;
  }

  /**
   * Check if this is a high-risk score (>= 60)
   */
  isHighRisk(): boolean {
    return this.props.value >= 60;
  }

  /**
   * Check if this is a critical risk score (>= 80)
   */
  isCritical(): boolean {
    return this.props.value >= 80;
  }

  /**
   * Serialize to plain object for storage/API response
   */
  toValue(): { value: number; confidence: number; level: ChurnRiskLevel; slaHours: number } {
    return {
      value: this.props.value,
      confidence: this.props.confidence,
      level: this.level,
      slaHours: this.slaHours,
    };
  }
}
