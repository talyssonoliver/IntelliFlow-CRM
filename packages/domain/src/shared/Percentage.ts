import { ValueObject } from './ValueObject';
import { Result, DomainError } from './Result';

/**
 * Percentage Value Object
 *
 * Encapsulates percentage validation (0-100) and conversions.
 * Provides type-safe percentage operations.
 *
 * @example
 * const result = Percentage.create(75.5);
 * if (result.isSuccess) {
 *   console.log(result.value.asDecimal);  // 0.755
 *   console.log(result.value.formatted);   // "75.5%"
 * }
 */

interface PercentageProps {
  value: number; // Stored as 0-100
}

export class InvalidPercentageError extends DomainError {
  readonly code = 'INVALID_PERCENTAGE';

  constructor(value: number, reason?: string) {
    const message = reason ? `Invalid percentage: ${value} (${reason})` : `Invalid percentage: ${value}`;
    super(message);
  }
}

export class Percentage extends ValueObject<PercentageProps> {
  /**
   * Minimum allowed percentage value
   */
  private static readonly MIN_VALUE = 0;

  /**
   * Maximum allowed percentage value
   */
  private static readonly MAX_VALUE = 100;

  /**
   * Precision for rounding (2 decimal places)
   */
  private static readonly PRECISION = 2;

  /**
   * Create a Percentage from a number (0-100)
   *
   * @param value - Percentage value (0-100)
   * @returns Result containing Percentage or InvalidPercentageError
   */
  static create(value: number | null | undefined): Result<Percentage, InvalidPercentageError> {
    if (value === null || value === undefined) {
      return Result.fail(new InvalidPercentageError(0, 'value cannot be null or undefined'));
    }

    if (isNaN(value)) {
      return Result.fail(new InvalidPercentageError(value, 'value is not a number'));
    }

    if (!isFinite(value)) {
      return Result.fail(new InvalidPercentageError(value, 'value must be finite'));
    }

    if (value < this.MIN_VALUE) {
      return Result.fail(
        new InvalidPercentageError(value, `value must be >= ${this.MIN_VALUE}`)
      );
    }

    if (value > this.MAX_VALUE) {
      return Result.fail(
        new InvalidPercentageError(value, `value must be <= ${this.MAX_VALUE}`)
      );
    }

    // Round to precision
    const rounded = Number(value.toFixed(this.PRECISION));

    return Result.ok(new Percentage({ value: rounded }));
  }

  /**
   * Create a Percentage from a decimal (0-1)
   *
   * @param decimal - Decimal value (0-1)
   * @returns Result containing Percentage or InvalidPercentageError
   */
  static fromDecimal(decimal: number): Result<Percentage, InvalidPercentageError> {
    if (decimal < 0 || decimal > 1) {
      return Result.fail(
        new InvalidPercentageError(decimal * 100, 'decimal must be between 0 and 1')
      );
    }

    return Percentage.create(decimal * 100);
  }

  /**
   * Create a Percentage from a fraction
   *
   * @param numerator - Numerator
   * @param denominator - Denominator (must be > 0)
   * @returns Result containing Percentage or InvalidPercentageError
   */
  static fromFraction(
    numerator: number,
    denominator: number
  ): Result<Percentage, InvalidPercentageError> {
    if (denominator === 0) {
      return Result.fail(
        new InvalidPercentageError(0, 'denominator cannot be zero')
      );
    }

    if (denominator < 0) {
      return Result.fail(
        new InvalidPercentageError(0, 'denominator must be positive')
      );
    }

    const percentage = (numerator / denominator) * 100;
    return Percentage.create(percentage);
  }

  /**
   * Get the percentage value (0-100)
   */
  get value(): number {
    return this.props.value;
  }

  /**
   * Get the percentage as a decimal (0-1)
   */
  get asDecimal(): number {
    return this.props.value / 100;
  }

  /**
   * Get the formatted percentage string (e.g., "75.5%")
   */
  get formatted(): string {
    return `${this.props.value}%`;
  }

  /**
   * Get the formatted percentage string with custom precision
   */
  formatWithPrecision(precision: number): string {
    return `${this.props.value.toFixed(precision)}%`;
  }

  /**
   * Add another percentage
   *
   * Result is clamped to 0-100 range
   */
  add(other: Percentage): Result<Percentage, InvalidPercentageError> {
    const sum = this.props.value + other.props.value;
    const clamped = Math.min(Percentage.MAX_VALUE, Math.max(Percentage.MIN_VALUE, sum));
    return Percentage.create(clamped);
  }

  /**
   * Subtract another percentage
   *
   * Result is clamped to 0-100 range
   */
  subtract(other: Percentage): Result<Percentage, InvalidPercentageError> {
    const difference = this.props.value - other.props.value;
    const clamped = Math.min(Percentage.MAX_VALUE, Math.max(Percentage.MIN_VALUE, difference));
    return Percentage.create(clamped);
  }

  /**
   * Multiply by a scalar
   *
   * Result is clamped to 0-100 range
   */
  multiply(scalar: number): Result<Percentage, InvalidPercentageError> {
    if (isNaN(scalar) || !isFinite(scalar)) {
      return Result.fail(new InvalidPercentageError(0, 'scalar must be a finite number'));
    }

    const product = this.props.value * scalar;
    const clamped = Math.min(Percentage.MAX_VALUE, Math.max(Percentage.MIN_VALUE, product));
    return Percentage.create(clamped);
  }

  /**
   * Calculate percentage of a number
   *
   * @param value - The value to calculate percentage of
   * @returns The percentage value (e.g., 75% of 100 = 75)
   */
  of(value: number): number {
    return (this.props.value / 100) * value;
  }

  /**
   * Check if percentage is zero
   */
  isZero(): boolean {
    return this.props.value === 0;
  }

  /**
   * Check if percentage is 100%
   */
  isFull(): boolean {
    return this.props.value === 100;
  }

  /**
   * Check if percentage is greater than another
   */
  isGreaterThan(other: Percentage): boolean {
    return this.props.value > other.props.value;
  }

  /**
   * Check if percentage is less than another
   */
  isLessThan(other: Percentage): boolean {
    return this.props.value < other.props.value;
  }

  /**
   * Get raw value for serialization
   */
  toValue(): number {
    return this.props.value;
  }

  /**
   * Convert to string (formatted)
   */
  toString(): string {
    return this.formatted;
  }
}
