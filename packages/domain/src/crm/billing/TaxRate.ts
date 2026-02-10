import { ValueObject } from '../../shared/ValueObject';
import { Result } from '../../shared/Result';
import { Money } from '../../shared/Money';
import { TaxType } from './billing-constants';
import { InvalidTaxRateError } from './billing-errors';

interface TaxRateProps {
  rate: number;
  type: TaxType;
  jurisdiction?: string;
}

export class TaxRate extends ValueObject<TaxRateProps> {
  private constructor(props: TaxRateProps) {
    super(props);
  }

  get rate(): number {
    return this.props.rate;
  }

  get type(): TaxType {
    return this.props.type;
  }

  get jurisdiction(): string | undefined {
    return this.props.jurisdiction;
  }

  static create(rate: number, type: TaxType, jurisdiction?: string): Result<TaxRate, InvalidTaxRateError> {
    if (rate < 0 || rate > 100) {
      return Result.fail(new InvalidTaxRateError(rate));
    }

    return Result.ok(new TaxRate({ rate, type, jurisdiction }));
  }

  static zero(): TaxRate {
    return new TaxRate({ rate: 0, type: 'NONE' });
  }

  calculate(subtotal: Money): Money {
    if (this.props.rate === 0) {
      return Money.zero(subtotal.currency);
    }
    const result = subtotal.multiply(this.props.rate / 100);
    if (result.isFailure) {
      return Money.zero(subtotal.currency);
    }
    return result.value;
  }

  toValue(): { rate: number; type: TaxType; jurisdiction?: string } {
    return {
      rate: this.props.rate,
      type: this.props.type,
      jurisdiction: this.props.jurisdiction,
    };
  }
}
