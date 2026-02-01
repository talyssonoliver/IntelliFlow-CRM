import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * AutoResponseDraftId - Value object for auto-response draft identification
 */
export class AutoResponseDraftId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value?: string): AutoResponseDraftId {
    if (value) {
      if (!uuidValidate(value)) {
        throw new Error(`Invalid AutoResponseDraftId: ${value}`);
      }
      return new AutoResponseDraftId(value);
    }
    return new AutoResponseDraftId(uuidv4());
  }

  static fromString(value: string): AutoResponseDraftId {
    return AutoResponseDraftId.create(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: AutoResponseDraftId): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  toValue(): string {
    return this.value;
  }
}
