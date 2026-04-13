import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result } from '../../shared/Result';
import { Money } from '../../shared/Money';
import { ReceiptId } from './ReceiptId';
import { PaymentMethod } from './billing-constants';
import { InvalidReceiptError } from './billing-errors';
import { ReceiptIssuedEvent } from './billing-events';

interface ReceiptProps {
  receiptNumber: string;
  invoiceId: string;
  customerId: string;
  tenantId: string;
  amount: Money;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
}

export interface CreateReceiptProps {
  invoiceId: string;
  customerId: string;
  tenantId: string;
  amountCents: number;
  currency?: string;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  paymentDate?: Date;
  notes?: string;
}

let receiptSequence = 0;

function generateReceiptNumber(): string {
  receiptSequence++;
  const year = new Date().getFullYear();
  return `RCT-${year}-${String(receiptSequence).padStart(6, '0')}`;
}

export class Receipt extends AggregateRoot<ReceiptId> {
  private readonly props: ReceiptProps;

  private constructor(id: ReceiptId, props: ReceiptProps) {
    super(id);
    this.props = props;
  }

  // ── Getters ──

  get receiptNumber(): string {
    return this.props.receiptNumber;
  }
  get invoiceId(): string {
    return this.props.invoiceId;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get paymentMethod(): PaymentMethod {
    return this.props.paymentMethod;
  }
  get transactionId(): string | undefined {
    return this.props.transactionId;
  }
  get paymentDate(): Date {
    return this.props.paymentDate;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  // ── Factory methods ──

  static create(props: CreateReceiptProps): Result<Receipt, InvalidReceiptError> {
    if (!props.invoiceId || props.invoiceId.trim().length === 0) {
      return Result.fail(new InvalidReceiptError('Invoice ID is required'));
    }

    if (!props.customerId || props.customerId.trim().length === 0) {
      return Result.fail(new InvalidReceiptError('Customer ID is required'));
    }

    if (!props.tenantId || props.tenantId.trim().length === 0) {
      return Result.fail(new InvalidReceiptError('Tenant ID is required'));
    }

    if (props.amountCents <= 0) {
      return Result.fail(new InvalidReceiptError('Receipt amount must be greater than zero'));
    }

    const currency = props.currency ?? 'GBP';
    const amountResult = Money.fromCents(props.amountCents, currency);
    if (amountResult.isFailure) {
      return Result.fail(new InvalidReceiptError(`Invalid amount: ${amountResult.error.message}`));
    }

    const id = ReceiptId.generate();
    const now = new Date();
    const receiptNumber = generateReceiptNumber();

    const receipt = new Receipt(id, {
      receiptNumber,
      invoiceId: props.invoiceId.trim(),
      customerId: props.customerId.trim(),
      tenantId: props.tenantId.trim(),
      amount: amountResult.value,
      paymentMethod: props.paymentMethod,
      transactionId: props.transactionId,
      paymentDate: props.paymentDate ?? now,
      notes: props.notes,
      createdAt: now,
    });

    receipt.addDomainEvent(
      new ReceiptIssuedEvent(
        id.value,
        props.invoiceId,
        props.amountCents,
        props.paymentMethod,
        props.tenantId
      )
    );

    return Result.ok(receipt);
  }

  static reconstitute(id: ReceiptId, props: ReceiptProps): Receipt {
    return new Receipt(id, props);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      receiptNumber: this.props.receiptNumber,
      invoiceId: this.props.invoiceId,
      customerId: this.props.customerId,
      tenantId: this.props.tenantId,
      amount: this.props.amount.toValue(),
      paymentMethod: this.props.paymentMethod,
      transactionId: this.props.transactionId ?? null,
      paymentDate: this.props.paymentDate.toISOString(),
      notes: this.props.notes ?? null,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
