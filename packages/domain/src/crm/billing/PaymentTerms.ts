import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

export class InvalidPaymentTermsError extends DomainError {
  readonly code = 'INVALID_PAYMENT_TERMS';

  constructor(message: string) {
    super(message);
  }
}

interface PaymentTermsProps {
  daysUntilDue: number;
  description: string;
}

export class PaymentTerms extends ValueObject<PaymentTermsProps> {
  private constructor(props: PaymentTermsProps) {
    super(props);
  }

  get daysUntilDue(): number {
    return this.props.daysUntilDue;
  }

  get description(): string {
    return this.props.description;
  }

  static create(daysUntilDue: number, description: string): Result<PaymentTerms, InvalidPaymentTermsError> {
    if (daysUntilDue < 0) {
      return Result.fail(new InvalidPaymentTermsError(`Days until due cannot be negative: ${daysUntilDue}`));
    }

    if (!description || description.trim().length === 0) {
      return Result.fail(new InvalidPaymentTermsError('Payment terms description cannot be empty'));
    }

    return Result.ok(new PaymentTerms({ daysUntilDue, description: description.trim() }));
  }

  static net30(): PaymentTerms {
    return new PaymentTerms({ daysUntilDue: 30, description: 'Net 30' });
  }

  static dueOnReceipt(): PaymentTerms {
    return new PaymentTerms({ daysUntilDue: 0, description: 'Due on Receipt' });
  }

  calculateDueDate(issueDate: Date): Date {
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + this.props.daysUntilDue);
    return dueDate;
  }

  toValue(): { daysUntilDue: number; description: string } {
    return {
      daysUntilDue: this.props.daysUntilDue,
      description: this.props.description,
    };
  }
}
