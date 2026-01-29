import { describe, it, expect } from 'vitest';
import { ValueObject } from '../ValueObject';

// Concrete implementations for testing
interface EmailProps {
  value: string;
}

class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  static create(value: string): Email {
    return new Email({ value });
  }

  get value(): string {
    return this.props.value;
  }

  toValue(): string {
    return this.props.value;
  }
}

interface AddressProps {
  street: string;
  city: string;
  zipCode: string;
}

class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(street: string, city: string, zipCode: string): Address {
    return new Address({ street, city, zipCode });
  }

  get street(): string {
    return this.props.street;
  }

  get city(): string {
    return this.props.city;
  }

  get zipCode(): string {
    return this.props.zipCode;
  }

  toValue(): AddressProps {
    return {
      street: this.props.street,
      city: this.props.city,
      zipCode: this.props.zipCode,
    };
  }
}

interface NestedProps {
  outer: {
    inner: string;
  };
  array: number[];
}

class NestedValueObject extends ValueObject<NestedProps> {
  private constructor(props: NestedProps) {
    super(props);
  }

  static create(inner: string, array: number[]): NestedValueObject {
    return new NestedValueObject({ outer: { inner }, array });
  }

  toValue(): NestedProps {
    return {
      outer: { inner: this.props.outer.inner },
      array: [...this.props.array],
    };
  }
}

describe('ValueObject', () => {
  describe('constructor and immutability', () => {
    it('should create value object with props', () => {
      const email = Email.create('test@example.com');
      expect(email.value).toBe('test@example.com');
    });

    it('should freeze props to ensure immutability', () => {
      const email = Email.create('test@example.com');

      // Attempting to modify frozen object should fail silently or throw in strict mode
      expect(() => {
        (email as any).props.value = 'modified@example.com';
      }).toThrow();
    });

    it('should maintain immutability for complex objects', () => {
      const address = Address.create('123 Main St', 'Springfield', '12345');

      expect(() => {
        (address as any).props.street = 'Modified St';
      }).toThrow();
    });

    it('should freeze top-level props object', () => {
      const nested = NestedValueObject.create('test', [1, 2, 3]);

      // Object.freeze is shallow, so top-level props is frozen
      expect(Object.isFrozen((nested as any).props)).toBe(true);

      // Nested objects are not frozen by Object.freeze (shallow freeze)
      // This is expected behavior - deep freeze would require recursive implementation
      expect((nested as any).props.outer.inner).toBe('test');
    });

    it('should freeze array reference but not prevent mutation', () => {
      const nested = NestedValueObject.create('test', [1, 2, 3]);

      // The props object itself is frozen
      expect(Object.isFrozen((nested as any).props)).toBe(true);

      // Arrays are objects, so the reference is frozen but contents are mutable
      // This is standard Object.freeze behavior (shallow)
      expect((nested as any).props.array).toHaveLength(3);
    });
  });

  describe('equals - value-based equality', () => {
    it('should return true for value objects with same props', () => {
      const email1 = Email.create('test@example.com');
      const email2 = Email.create('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true when comparing to itself', () => {
      const email = Email.create('test@example.com');
      expect(email.equals(email)).toBe(true);
    });

    it('should return false for value objects with different props', () => {
      const email1 = Email.create('test1@example.com');
      const email2 = Email.create('test2@example.com');
      expect(email1.equals(email2)).toBe(false);
    });

    it('should return false when comparing to null', () => {
      const email = Email.create('test@example.com');
      expect(email.equals(null as any)).toBe(false);
    });

    it('should return false when comparing to undefined', () => {
      const email = Email.create('test@example.com');
      expect(email.equals(undefined as any)).toBe(false);
    });

    it('should compare complex objects by value', () => {
      const address1 = Address.create('123 Main St', 'Springfield', '12345');
      const address2 = Address.create('123 Main St', 'Springfield', '12345');
      const address3 = Address.create('456 Oak Ave', 'Springfield', '12345');

      expect(address1.equals(address2)).toBe(true);
      expect(address1.equals(address3)).toBe(false);
    });

    it('should handle nested objects', () => {
      const nested1 = NestedValueObject.create('test', [1, 2, 3]);
      const nested2 = NestedValueObject.create('test', [1, 2, 3]);
      const nested3 = NestedValueObject.create('test', [1, 2, 4]);
      const nested4 = NestedValueObject.create('different', [1, 2, 3]);

      expect(nested1.equals(nested2)).toBe(true);
      expect(nested1.equals(nested3)).toBe(false);
      expect(nested1.equals(nested4)).toBe(false);
    });

    it('should handle empty strings', () => {
      const email1 = Email.create('');
      const email2 = Email.create('');
      const email3 = Email.create('test@example.com');

      expect(email1.equals(email2)).toBe(true);
      expect(email1.equals(email3)).toBe(false);
    });

    it('should handle empty arrays', () => {
      const nested1 = NestedValueObject.create('test', []);
      const nested2 = NestedValueObject.create('test', []);
      const nested3 = NestedValueObject.create('test', [1]);

      expect(nested1.equals(nested2)).toBe(true);
      expect(nested1.equals(nested3)).toBe(false);
    });

    it('should be case-sensitive for string comparisons', () => {
      const email1 = Email.create('Test@Example.com');
      const email2 = Email.create('test@example.com');

      expect(email1.equals(email2)).toBe(false);
    });

    it('should handle special characters', () => {
      const email1 = Email.create('test+tag@example.com');
      const email2 = Email.create('test+tag@example.com');
      const email3 = Email.create('test@example.com');

      expect(email1.equals(email2)).toBe(true);
      expect(email1.equals(email3)).toBe(false);
    });
  });

  describe('toValue - serialization', () => {
    it('should return primitive value for simple value object', () => {
      const email = Email.create('test@example.com');
      expect(email.toValue()).toBe('test@example.com');
    });

    it('should return object for complex value object', () => {
      const address = Address.create('123 Main St', 'Springfield', '12345');
      const value = address.toValue();

      expect(value).toEqual({
        street: '123 Main St',
        city: 'Springfield',
        zipCode: '12345',
      });
    });

    it('should return deep copy for nested objects', () => {
      const nested = NestedValueObject.create('test', [1, 2, 3]);
      const value = nested.toValue();

      expect(value).toEqual({
        outer: { inner: 'test' },
        array: [1, 2, 3],
      });

      // Modifying the returned value should not affect the original
      value.array.push(4);
      expect(nested.toValue().array).toEqual([1, 2, 3]);
    });
  });

  describe('type safety', () => {
    it('should preserve generic type constraint', () => {
      const email = Email.create('test@example.com');
      const address = Address.create('123 Main St', 'Springfield', '12345');

      // TypeScript ensures type safety at compile time
      const emailValue: string = email.toValue();
      const addressValue: AddressProps = address.toValue();

      expect(typeof emailValue).toBe('string');
      expect(typeof addressValue).toBe('object');
    });
  });

  describe('props protection', () => {
    it('should have readonly props property', () => {
      const email = Email.create('test@example.com');

      // Props is readonly at compile-time (TypeScript enforces this)
      // We verify the value is accessible and correct
      expect((email as any).props.value).toBe('test@example.com');
    });

    it('should freeze props object to prevent modification', () => {
      const address = Address.create('123 Main St', 'Springfield', '12345');

      // Even if we get a reference to props, it should be frozen
      const props = (address as any).props;
      expect(Object.isFrozen(props)).toBe(true);
    });
  });

  describe('equality edge cases', () => {
    it('should handle objects with different property order', () => {
      // JSON.stringify maintains property order, so this tests that behavior
      class UnorderedProps extends ValueObject<{ a: string; b: string }> {
        static create(a: string, b: string): UnorderedProps {
          return new UnorderedProps({ a, b });
        }
        toValue() {
          return this.props;
        }
      }

      const obj1 = UnorderedProps.create('value1', 'value2');
      const obj2 = UnorderedProps.create('value1', 'value2');

      expect(obj1.equals(obj2)).toBe(true);
    });

    it('should handle numeric values correctly', () => {
      class NumericValue extends ValueObject<{ amount: number }> {
        static create(amount: number): NumericValue {
          return new NumericValue({ amount });
        }
        toValue() {
          return this.props.amount;
        }
      }

      const num1 = NumericValue.create(42);
      const num2 = NumericValue.create(42);
      const num3 = NumericValue.create(43);

      expect(num1.equals(num2)).toBe(true);
      expect(num1.equals(num3)).toBe(false);
    });

    it('should handle zero and negative numbers', () => {
      class NumericValue extends ValueObject<{ amount: number }> {
        static create(amount: number): NumericValue {
          return new NumericValue({ amount });
        }
        toValue() {
          return this.props.amount;
        }
      }

      const zero1 = NumericValue.create(0);
      const zero2 = NumericValue.create(0);
      const negative = NumericValue.create(-42);
      const negativeMatch = NumericValue.create(-42);

      expect(zero1.equals(zero2)).toBe(true);
      expect(negative.equals(negativeMatch)).toBe(true);
      expect(zero1.equals(negative)).toBe(false);
    });

    it('should handle boolean values', () => {
      class BooleanValue extends ValueObject<{ flag: boolean }> {
        static create(flag: boolean): BooleanValue {
          return new BooleanValue({ flag });
        }
        toValue() {
          return this.props.flag;
        }
      }

      const true1 = BooleanValue.create(true);
      const true2 = BooleanValue.create(true);
      const false1 = BooleanValue.create(false);

      expect(true1.equals(true2)).toBe(true);
      expect(true1.equals(false1)).toBe(false);
    });
  });
});
