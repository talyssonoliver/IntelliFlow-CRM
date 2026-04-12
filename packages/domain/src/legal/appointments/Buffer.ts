import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidBufferError extends DomainError {
  readonly code = 'INVALID_BUFFER';

  constructor(message: string) {
    super(`Invalid buffer: ${message}`);
  }
}

interface BufferProps {
  beforeMinutes: number;
  afterMinutes: number;
}

/**
 * Buffer Value Object
 * Represents buffer time before and after an appointment
 * Useful for travel time, preparation, or debrief
 */
export class Buffer extends ValueObject<BufferProps> {
  private constructor(props: BufferProps) {
    super(props);
  }

  get beforeMinutes(): number {
    return this.props.beforeMinutes;
  }

  get afterMinutes(): number {
    return this.props.afterMinutes;
  }

  get totalMinutes(): number {
    return this.props.beforeMinutes + this.props.afterMinutes;
  }

  /**
   * Create a buffer
   */
  static create(beforeMinutes: number, afterMinutes: number): Result<Buffer, InvalidBufferError> {
    if (beforeMinutes < 0) {
      return Result.fail(new InvalidBufferError('Before buffer cannot be negative'));
    }

    if (afterMinutes < 0) {
      return Result.fail(new InvalidBufferError('After buffer cannot be negative'));
    }

    // Maximum buffer of 4 hours
    const maxBuffer = 240; // 4 hours in minutes
    if (beforeMinutes > maxBuffer) {
      return Result.fail(
        new InvalidBufferError(`Before buffer cannot exceed ${maxBuffer} minutes`)
      );
    }

    if (afterMinutes > maxBuffer) {
      return Result.fail(new InvalidBufferError(`After buffer cannot exceed ${maxBuffer} minutes`));
    }

    return Result.ok(new Buffer({ beforeMinutes, afterMinutes }));
  }

  /**
   * Create a symmetric buffer (same before and after)
   */
  static createSymmetric(minutes: number): Result<Buffer, InvalidBufferError> {
    return Buffer.create(minutes, minutes);
  }

  /**
   * Create no buffer
   */
  static none(): Buffer {
    return new Buffer({ beforeMinutes: 0, afterMinutes: 0 });
  }

  /**
   * Create common buffer presets
   */
  static travel(minutes: number = 30): Result<Buffer, InvalidBufferError> {
    return Buffer.create(minutes, minutes);
  }

  static preparation(minutes: number = 15): Result<Buffer, InvalidBufferError> {
    return Buffer.create(minutes, 0);
  }

  static debrief(minutes: number = 15): Result<Buffer, InvalidBufferError> {
    return Buffer.create(0, minutes);
  }

  /**
   * Adjust appointment times with buffer
   */
  adjustStartTime(startTime: Date): Date {
    return new Date(startTime.getTime() - this.props.beforeMinutes * 60 * 1000);
  }

  adjustEndTime(endTime: Date): Date {
    return new Date(endTime.getTime() + this.props.afterMinutes * 60 * 1000);
  }

  /**
   * Check if this buffer has any value
   */
  hasValue(): boolean {
    return this.props.beforeMinutes > 0 || this.props.afterMinutes > 0;
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(beforeMinutes: number, afterMinutes: number): Buffer {
    return new Buffer({ beforeMinutes, afterMinutes });
  }

  toValue(): BufferProps {
    return {
      beforeMinutes: this.props.beforeMinutes,
      afterMinutes: this.props.afterMinutes,
    };
  }

  toJSON(): BufferProps {
    return this.toValue();
  }

  /**
   * Get human-readable description
   */
  describe(): string {
    if (!this.hasValue()) {
      return 'No buffer';
    }

    const parts: string[] = [];
    if (this.props.beforeMinutes > 0) {
      parts.push(`${this.props.beforeMinutes}min before`);
    }
    if (this.props.afterMinutes > 0) {
      parts.push(`${this.props.afterMinutes}min after`);
    }

    return parts.join(', ');
  }
}
