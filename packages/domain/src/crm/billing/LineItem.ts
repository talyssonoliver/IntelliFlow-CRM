import { ValueObject } from '../../shared/ValueObject';
import { Result } from '../../shared/Result';
import { Money } from '../../shared/Money';
import { LineItemType } from './billing-constants';
import { InvalidLineItemError } from './billing-errors';

interface LineItemProps {
  description: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
  type: LineItemType;
}

export interface CreateLineItemProps {
  description: string;
  quantity: number;
  unitPriceCents: number;
  currency?: string;
  type: LineItemType;
}

export class LineItem extends ValueObject<LineItemProps> {
  private constructor(props: LineItemProps) {
    super(props);
  }

  get description(): string {
    return this.props.description;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get total(): Money {
    return this.props.total;
  }

  get type(): LineItemType {
    return this.props.type;
  }

  static create(props: CreateLineItemProps): Result<LineItem, InvalidLineItemError> {
    if (!props.description || props.description.trim().length === 0) {
      return Result.fail(new InvalidLineItemError('Line item description cannot be empty'));
    }

    if (props.quantity <= 0) {
      return Result.fail(new InvalidLineItemError(`Line item quantity must be > 0, got ${props.quantity}`));
    }

    if (props.unitPriceCents < 0) {
      return Result.fail(new InvalidLineItemError(`Line item unit price cannot be negative, got ${props.unitPriceCents}`));
    }

    const currency = props.currency ?? 'USD';
    const unitPriceResult = Money.fromCents(props.unitPriceCents, currency);
    if (unitPriceResult.isFailure) {
      return Result.fail(new InvalidLineItemError(`Invalid unit price: ${unitPriceResult.error.message}`));
    }

    const unitPrice = unitPriceResult.value;
    const totalResult = unitPrice.multiply(props.quantity);
    if (totalResult.isFailure) {
      return Result.fail(new InvalidLineItemError(`Failed to calculate total: ${totalResult.error.message}`));
    }

    return Result.ok(
      new LineItem({
        description: props.description.trim(),
        quantity: props.quantity,
        unitPrice,
        total: totalResult.value,
        type: props.type,
      })
    );
  }

  toValue(): {
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    currency: string;
    type: LineItemType;
  } {
    return {
      description: this.props.description,
      quantity: this.props.quantity,
      unitPriceCents: this.props.unitPrice.cents,
      totalCents: this.props.total.cents,
      currency: this.props.unitPrice.currency,
      type: this.props.type,
    };
  }
}
