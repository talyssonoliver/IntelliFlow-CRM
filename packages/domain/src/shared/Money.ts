import { ValueObject } from './ValueObject';
import { Result, DomainError } from './Result';

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';

  constructor(message: string) {
    super(message);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(currency1: string, currency2: string) {
    super(`Cannot perform operation on different currencies: ${currency1} and ${currency2}`);
  }
}

interface MoneyProps {
  cents: number; // Store as integer cents to avoid floating-point errors
  currency: string; // ISO 4217 currency code (USD, EUR, GBP, etc.)
}

/**
 * Money Value Object
 * Encapsulates monetary values with currency tracking
 *
 * Stores value as integer cents to avoid floating-point precision errors
 * Example: $12.50 is stored as { cents: 1250, currency: 'USD' }
 */
export class Money extends ValueObject<MoneyProps> {
  private static readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
  private static readonly ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW']; // No decimal places

  private constructor(props: MoneyProps) {
    super(props);
  }

  get cents(): number {
    return this.props.cents;
  }

  get currency(): string {
    return this.props.currency;
  }

  /**
   * Get amount as decimal (dollars, euros, etc.)
   */
  get amount(): number {
    if (Money.ZERO_DECIMAL_CURRENCIES.includes(this.props.currency)) {
      return this.props.cents;
    }
    return this.props.cents / 100;
  }

  /**
   * Create Money from decimal amount
   * Example: Money.create(12.50, 'USD') → { cents: 1250, currency: 'USD' }
   */
  static create(amount: number, currency: string = 'USD'): Result<Money, InvalidMoneyError> {
    // Validate amount
    if (!Number.isFinite(amount)) {
      return Result.fail(new InvalidMoneyError('Amount must be a finite number'));
    }

    if (amount < 0) {
      return Result.fail(new InvalidMoneyError('Amount cannot be negative'));
    }

    // Validate currency
    const currencyUpper = currency.toUpperCase();
    if (!Money.SUPPORTED_CURRENCIES.includes(currencyUpper)) {
      return Result.fail(
        new InvalidMoneyError(
          `Unsupported currency: ${currency}. Supported: ${Money.SUPPORTED_CURRENCIES.join(', ')}`
        )
      );
    }

    // Convert to cents (integer)
    let cents: number;
    if (Money.ZERO_DECIMAL_CURRENCIES.includes(currencyUpper)) {
      cents = Math.round(amount);
    } else {
      cents = Math.round(amount * 100);
    }

    return Result.ok(new Money({ cents, currency: currencyUpper }));
  }

  /**
   * Create Money from cents (for database storage)
   */
  static fromCents(cents: number, currency: string = 'USD'): Result<Money, InvalidMoneyError> {
    if (!Number.isInteger(cents)) {
      return Result.fail(new InvalidMoneyError('Cents must be an integer'));
    }

    if (cents < 0) {
      return Result.fail(new InvalidMoneyError('Cents cannot be negative'));
    }

    const currencyUpper = currency.toUpperCase();
    if (!Money.SUPPORTED_CURRENCIES.includes(currencyUpper)) {
      return Result.fail(new InvalidMoneyError(`Unsupported currency: ${currency}`));
    }

    return Result.ok(new Money({ cents, currency: currencyUpper }));
  }

  /**
   * Create zero money
   */
  static zero(currency: string = 'USD'): Money {
    return new Money({ cents: 0, currency: currency.toUpperCase() });
  }

  /**
   * Add two money values
   */
  add(other: Money): Result<Money, CurrencyMismatchError> {
    if (this.props.currency !== other.props.currency) {
      return Result.fail(new CurrencyMismatchError(this.props.currency, other.props.currency));
    }

    return Result.ok(
      new Money({
        cents: this.props.cents + other.props.cents,
        currency: this.props.currency,
      })
    );
  }

  /**
   * Subtract two money values
   */
  subtract(other: Money): Result<Money, CurrencyMismatchError | InvalidMoneyError> {
    if (this.props.currency !== other.props.currency) {
      return Result.fail(new CurrencyMismatchError(this.props.currency, other.props.currency));
    }

    const newCents = this.props.cents - other.props.cents;
    if (newCents < 0) {
      return Result.fail(new InvalidMoneyError('Subtraction would result in negative amount'));
    }

    return Result.ok(
      new Money({
        cents: newCents,
        currency: this.props.currency,
      })
    );
  }

  /**
   * Multiply by a scalar
   */
  multiply(factor: number): Result<Money, InvalidMoneyError> {
    if (!Number.isFinite(factor)) {
      return Result.fail(new InvalidMoneyError('Factor must be a finite number'));
    }

    if (factor < 0) {
      return Result.fail(new InvalidMoneyError('Factor cannot be negative'));
    }

    return Result.ok(
      new Money({
        cents: Math.round(this.props.cents * factor),
        currency: this.props.currency,
      })
    );
  }

  /**
   * Compare two money values
   */
  greaterThan(other: Money): boolean {
    if (this.props.currency !== other.props.currency) {
      throw new Error('Cannot compare different currencies');
    }
    return this.props.cents > other.props.cents;
  }

  lessThan(other: Money): boolean {
    if (this.props.currency !== other.props.currency) {
      throw new Error('Cannot compare different currencies');
    }
    return this.props.cents < other.props.cents;
  }

  /**
   * Format as currency string
   * Example: Money.create(1234.56, 'USD').formatted → "$1,234.56"
   */
  get formatted(): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.props.currency,
    }).format(this.amount);
  }

  /**
   * Get value for database storage
   */
  toValue(): { cents: number; currency: string; amount: number } {
    return {
      cents: this.props.cents,
      currency: this.props.currency,
      amount: this.amount,
    };
  }

  toString(): string {
    return this.formatted;
  }
}
