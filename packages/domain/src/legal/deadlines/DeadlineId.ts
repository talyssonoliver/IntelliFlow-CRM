import { v4 as uuidv4 } from 'uuid';

/**
 * DeadlineId Value Object
 * Unique identifier for a deadline
 */
export class DeadlineId {
  private constructor(private readonly _value: string) {}

  get value(): string {
    return this._value;
  }

  static generate(): DeadlineId {
    return new DeadlineId(uuidv4());
  }

  static fromString(value: string): DeadlineId {
    if (!value || value.trim().length === 0) {
      throw new Error('DeadlineId cannot be empty');
    }
    return new DeadlineId(value.trim());
  }

  equals(other: DeadlineId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
