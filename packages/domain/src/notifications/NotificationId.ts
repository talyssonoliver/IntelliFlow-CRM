/**
 * NotificationId Value Object
 * Unique identifier for notifications
 * @see IFC-157: Notification service MVP
 */
import { v4 as uuidv4 } from 'uuid';
import { ValueObject } from '../shared/ValueObject';

interface NotificationIdProps {
  value: string;
}

export class NotificationId extends ValueObject<NotificationIdProps> {
  private constructor(props: NotificationIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  /**
   * Create a NotificationId from an existing string value
   */
  static create(value: string): NotificationId {
    if (!value || value.trim().length === 0) {
      throw new Error('NotificationId cannot be empty');
    }
    return new NotificationId({ value: value.trim() });
  }

  /**
   * Generate a new unique NotificationId
   */
  static generate(): NotificationId {
    return new NotificationId({ value: uuidv4() });
  }

  toString(): string {
    return this.props.value;
  }

  /**
   * Get raw value for serialization
   */
  toValue(): string {
    return this.props.value;
  }
}
