import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result } from '../../shared/Result';
import { Money } from '../../shared/Money';
import { InvoiceId } from './InvoiceId';
import { LineItem, CreateLineItemProps } from './LineItem';
import { TaxRate } from './TaxRate';
import { PaymentTerms } from './PaymentTerms';
import {
  InvoiceStatus,
  PaymentStatus,
  RefundReason,
  canTransitionInvoiceTo,
  isTerminalInvoiceStatus,
} from './billing-constants';
import {
  InvalidInvoiceTransitionError,
  InvoiceNotEditableError,
  InvalidPaymentAmountError,
  InvalidRefundAmountError,
  CannotVoidPaidInvoiceError,
  BillingCurrencyMismatchError,
  InvalidInvoiceError,
} from './billing-errors';
import {
  InvoiceCreatedEvent,
  InvoiceIssuedEvent,
  InvoicePaymentRecordedEvent,
  InvoicePaidEvent,
  InvoiceVoidedEvent,
  InvoiceRefundedEvent,
  InvoiceUncollectibleEvent,
} from './billing-events';

export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

interface InvoiceProps {
  invoiceNumber: string;
  customerId: string;
  tenantId: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  lineItems: LineItem[];
  subtotal: Money;
  totalTax: Money;
  totalAmount: Money;
  amountPaid: Money;
  amountDue: Money;
  amountRefunded: Money;
  currency: string;
  taxRate: TaxRate;
  paymentTerms: PaymentTerms;
  issueDate: Date;
  dueDate: Date;
  paidAt?: Date;
  voidedAt?: Date;
  billingEmail: string;
  billingAddress?: BillingAddress;
  subscriptionId?: string;
  stripeInvoiceId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvoiceProps {
  customerId: string;
  tenantId: string;
  lineItems: CreateLineItemProps[];
  billingEmail: string;
  currency?: string;
  taxRate?: number;
  taxType?: 'VAT' | 'SALES_TAX' | 'GST' | 'NONE';
  taxJurisdiction?: string;
  paymentTermsDays?: number;
  paymentTermsDescription?: string;
  issueDate?: Date;
  dueDate?: Date;
  billingAddress?: BillingAddress;
  subscriptionId?: string;
  stripeInvoiceId?: string;
  notes?: string;
}

let invoiceSequence = 0;

function generateInvoiceNumber(): string {
  invoiceSequence++;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(invoiceSequence).padStart(6, '0')}`;
}

export class Invoice extends AggregateRoot<InvoiceId> {
  private props: InvoiceProps;

  private constructor(id: InvoiceId, props: InvoiceProps) {
    super(id);
    this.props = props;
  }

  // ── Getters ──

  get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get status(): InvoiceStatus {
    return this.props.status;
  }
  get paymentStatus(): PaymentStatus {
    return this.props.paymentStatus;
  }
  get lineItems(): ReadonlyArray<LineItem> {
    return [...this.props.lineItems];
  }
  get subtotal(): Money {
    return this.props.subtotal;
  }
  get totalTax(): Money {
    return this.props.totalTax;
  }
  get totalAmount(): Money {
    return this.props.totalAmount;
  }
  get amountPaid(): Money {
    return this.props.amountPaid;
  }
  get amountDue(): Money {
    return this.props.amountDue;
  }
  get amountRefunded(): Money {
    return this.props.amountRefunded;
  }
  get currency(): string {
    return this.props.currency;
  }
  get taxRate(): TaxRate {
    return this.props.taxRate;
  }
  get paymentTerms(): PaymentTerms {
    return this.props.paymentTerms;
  }
  get issueDate(): Date {
    return this.props.issueDate;
  }
  get dueDate(): Date {
    return this.props.dueDate;
  }
  get paidAt(): Date | undefined {
    return this.props.paidAt;
  }
  get voidedAt(): Date | undefined {
    return this.props.voidedAt;
  }
  get billingEmail(): string {
    return this.props.billingEmail;
  }
  get billingAddress(): BillingAddress | undefined {
    return this.props.billingAddress;
  }
  get subscriptionId(): string | undefined {
    return this.props.subscriptionId;
  }
  get stripeInvoiceId(): string | undefined {
    return this.props.stripeInvoiceId;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // ── Computed properties ──

  get isEditable(): boolean {
    return this.props.status === 'DRAFT';
  }

  get isPaid(): boolean {
    return this.props.status === 'PAID';
  }

  get isOverdue(): boolean {
    return (
      this.props.status === 'OPEN' &&
      this.props.dueDate < new Date() &&
      this.props.amountDue.cents > 0
    );
  }

  get outstandingBalance(): Money {
    return this.props.amountDue;
  }

  get hasPayments(): boolean {
    return this.props.amountPaid.cents > 0;
  }

  // ── Factory methods ──

  static create(props: CreateInvoiceProps): Result<Invoice, InvalidInvoiceError> {
    const currency = props.currency ?? 'USD';

    const validationError = Invoice.validateRequiredFields(props);
    if (validationError) return Result.fail(validationError);

    const lineItemsResult = Invoice.buildLineItems(props.lineItems, currency);
    if (lineItemsResult.isFailure) return Result.fail(lineItemsResult.error);
    const lineItems = lineItemsResult.value;

    const totalsResult = Invoice.calculateTotals(lineItems, props, currency);
    if (totalsResult.isFailure) return Result.fail(totalsResult.error);
    const { subtotal, totalTax, totalAmount, taxRate } = totalsResult.value;

    const issueDate = props.issueDate ?? new Date();
    const termsResult = Invoice.resolvePaymentTerms(props, issueDate);
    if (termsResult.isFailure) return Result.fail(termsResult.error);
    const { paymentTerms, dueDate } = termsResult.value;

    const id = InvoiceId.generate();
    const now = new Date();
    const invoice = new Invoice(id, {
      invoiceNumber: generateInvoiceNumber(),
      customerId: props.customerId.trim(),
      tenantId: props.tenantId.trim(),
      status: 'DRAFT',
      paymentStatus: 'PENDING',
      lineItems,
      subtotal,
      totalTax,
      totalAmount,
      amountPaid: Money.zero(currency),
      amountDue: totalAmount,
      amountRefunded: Money.zero(currency),
      currency,
      taxRate,
      paymentTerms,
      issueDate,
      dueDate,
      billingEmail: props.billingEmail.trim(),
      billingAddress: props.billingAddress,
      subscriptionId: props.subscriptionId,
      stripeInvoiceId: props.stripeInvoiceId,
      notes: props.notes,
      createdAt: now,
      updatedAt: now,
    });

    invoice.addDomainEvent(
      new InvoiceCreatedEvent(
        id.value,
        props.customerId,
        totalAmount.cents,
        currency,
        props.tenantId
      )
    );

    return Result.ok(invoice);
  }

  private static validateRequiredFields(props: CreateInvoiceProps): InvalidInvoiceError | null {
    if (!props.customerId || props.customerId.trim().length === 0) {
      return new InvalidInvoiceError('Customer ID is required');
    }
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      return new InvalidInvoiceError('Tenant ID is required');
    }
    if (!props.lineItems || props.lineItems.length === 0) {
      return new InvalidInvoiceError('Invoice must have at least one line item');
    }
    if (!props.billingEmail || props.billingEmail.trim().length === 0) {
      return new InvalidInvoiceError('Billing email is required');
    }
    return null;
  }

  private static buildLineItems(
    itemProps: CreateLineItemProps[],
    currency: string
  ): Result<LineItem[], InvalidInvoiceError> {
    const lineItems: LineItem[] = [];
    for (const item of itemProps) {
      const itemResult = LineItem.create({ ...item, currency });
      if (itemResult.isFailure) {
        return Result.fail(
          new InvalidInvoiceError(`Invalid line item: ${itemResult.error.message}`)
        );
      }
      lineItems.push(itemResult.value);
    }
    return Result.ok(lineItems);
  }

  private static calculateTotals(
    lineItems: LineItem[],
    props: CreateInvoiceProps,
    currency: string
  ): Result<
    { subtotal: Money; totalTax: Money; totalAmount: Money; taxRate: TaxRate },
    InvalidInvoiceError
  > {
    let subtotal = Money.zero(currency);
    for (const item of lineItems) {
      const addResult = subtotal.add(item.total);
      if (addResult.isFailure) {
        return Result.fail(new InvalidInvoiceError('Currency mismatch in line items'));
      }
      subtotal = addResult.value;
    }

    const taxRateResult = TaxRate.create(
      props.taxRate ?? 0,
      props.taxType ?? 'NONE',
      props.taxJurisdiction
    );
    if (taxRateResult.isFailure) {
      return Result.fail(
        new InvalidInvoiceError(`Invalid tax rate: ${taxRateResult.error.message}`)
      );
    }
    const taxRate = taxRateResult.value;
    const totalTax = taxRate.calculate(subtotal);

    const totalResult = subtotal.add(totalTax);
    if (totalResult.isFailure) {
      return Result.fail(new InvalidInvoiceError('Failed to calculate total'));
    }

    return Result.ok({ subtotal, totalTax, totalAmount: totalResult.value, taxRate });
  }

  private static resolveTermsFromExplicitDueDate(
    props: CreateInvoiceProps,
    issueDate: Date
  ): Result<{ paymentTerms: PaymentTerms; dueDate: Date }, InvalidInvoiceError> {
    const dueDate = props.dueDate!;
    if (dueDate < issueDate) {
      return Result.fail(new InvalidInvoiceError('Due date cannot be before issue date'));
    }
    const daysDiff = Math.ceil((dueDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
    const desc =
      props.paymentTermsDescription ?? (daysDiff === 0 ? 'Due on Receipt' : `Net ${daysDiff}`);
    const termsResult = PaymentTerms.create(daysDiff, desc);
    if (termsResult.isFailure) {
      return Result.fail(
        new InvalidInvoiceError(`Invalid payment terms: ${termsResult.error.message}`)
      );
    }
    return Result.ok({ paymentTerms: termsResult.value, dueDate });
  }

  private static resolveTermsFromDays(
    props: CreateInvoiceProps,
    issueDate: Date
  ): Result<{ paymentTerms: PaymentTerms; dueDate: Date }, InvalidInvoiceError> {
    const days = props.paymentTermsDays ?? 30;
    const desc = props.paymentTermsDescription ?? (days === 0 ? 'Due on Receipt' : `Net ${days}`);
    const termsResult = PaymentTerms.create(days, desc);
    if (termsResult.isFailure) {
      return Result.fail(
        new InvalidInvoiceError(`Invalid payment terms: ${termsResult.error.message}`)
      );
    }
    return Result.ok({
      paymentTerms: termsResult.value,
      dueDate: termsResult.value.calculateDueDate(issueDate),
    });
  }

  private static resolvePaymentTerms(
    props: CreateInvoiceProps,
    issueDate: Date
  ): Result<{ paymentTerms: PaymentTerms; dueDate: Date }, InvalidInvoiceError> {
    if (props.dueDate) {
      return Invoice.resolveTermsFromExplicitDueDate(props, issueDate);
    }
    return Invoice.resolveTermsFromDays(props, issueDate);
  }

  static reconstitute(id: InvoiceId, props: InvoiceProps): Invoice {
    return new Invoice(id, props);
  }

  // ── Commands ──

  issue(): Result<void, InvalidInvoiceTransitionError> {
    if (!canTransitionInvoiceTo(this.props.status, 'OPEN')) {
      return Result.fail(new InvalidInvoiceTransitionError(this.props.status, 'OPEN'));
    }

    this.props.status = 'OPEN';
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new InvoiceIssuedEvent(
        this.id.value,
        this.props.invoiceNumber,
        this.props.dueDate,
        this.props.totalAmount.cents,
        this.props.tenantId
      )
    );

    return Result.ok(undefined);
  }

  recordPayment(
    amount: Money,
    transactionId?: string
  ): Result<
    void,
    InvalidPaymentAmountError | InvalidInvoiceTransitionError | BillingCurrencyMismatchError
  > {
    if (this.props.status !== 'OPEN') {
      return Result.fail(
        new InvalidPaymentAmountError(
          `Cannot record payment on invoice with status ${this.props.status}. Invoice must be OPEN.`
        )
      );
    }

    if (amount.cents <= 0) {
      return Result.fail(new InvalidPaymentAmountError('Payment amount must be greater than zero'));
    }

    if (amount.currency !== this.props.currency) {
      return Result.fail(new BillingCurrencyMismatchError(this.props.currency, amount.currency));
    }

    if (amount.cents > this.props.amountDue.cents) {
      return Result.fail(
        new InvalidPaymentAmountError(
          `Payment amount (${amount.cents}) exceeds amount due (${this.props.amountDue.cents})`
        )
      );
    }

    // Update amounts
    const newPaidResult = this.props.amountPaid.add(amount);
    if (newPaidResult.isFailure) {
      return Result.fail(new InvalidPaymentAmountError('Failed to update amount paid'));
    }
    this.props.amountPaid = newPaidResult.value;

    const newDueResult = this.props.amountDue.subtract(amount);
    if (newDueResult.isFailure) {
      return Result.fail(new InvalidPaymentAmountError('Failed to update amount due'));
    }
    this.props.amountDue = newDueResult.value;

    this.props.updatedAt = new Date();

    if (this.props.amountDue.cents === 0) {
      this.props.status = 'PAID';
      this.props.paymentStatus = 'PAID';
      this.props.paidAt = new Date();

      this.addDomainEvent(
        new InvoicePaymentRecordedEvent(
          this.id.value,
          amount.cents,
          this.props.amountPaid.cents,
          this.props.amountDue.cents,
          this.props.tenantId
        )
      );

      this.addDomainEvent(
        new InvoicePaidEvent(
          this.id.value,
          this.props.amountPaid.cents,
          this.props.paidAt!,
          this.props.tenantId
        )
      );
    } else {
      this.props.paymentStatus = 'PARTIALLY_PAID';

      this.addDomainEvent(
        new InvoicePaymentRecordedEvent(
          this.id.value,
          amount.cents,
          this.props.amountPaid.cents,
          this.props.amountDue.cents,
          this.props.tenantId
        )
      );
    }

    return Result.ok(undefined);
  }

  processRefund(
    amount: Money,
    reason: RefundReason
  ): Result<void, InvalidRefundAmountError | BillingCurrencyMismatchError> {
    if (isTerminalInvoiceStatus(this.props.status) && this.props.status !== 'PAID') {
      return Result.fail(
        new InvalidRefundAmountError(
          `Cannot process refund on invoice with status ${this.props.status}`
        )
      );
    }

    if (this.props.status === 'DRAFT') {
      return Result.fail(new InvalidRefundAmountError('Cannot process refund on DRAFT invoice'));
    }

    if (this.props.amountPaid.cents === 0) {
      return Result.fail(new InvalidRefundAmountError('No payments to refund'));
    }

    if (amount.cents <= 0) {
      return Result.fail(new InvalidRefundAmountError('Refund amount must be greater than zero'));
    }

    if (amount.currency !== this.props.currency) {
      return Result.fail(new BillingCurrencyMismatchError(this.props.currency, amount.currency));
    }

    const maxRefundable = this.props.amountPaid.cents - this.props.amountRefunded.cents;
    if (amount.cents > maxRefundable) {
      return Result.fail(
        new InvalidRefundAmountError(
          `Refund amount (${amount.cents}) exceeds refundable amount (${maxRefundable})`
        )
      );
    }

    // Update amounts
    const newRefundedResult = this.props.amountRefunded.add(amount);
    if (newRefundedResult.isFailure) {
      return Result.fail(new InvalidRefundAmountError('Failed to update refunded amount'));
    }
    this.props.amountRefunded = newRefundedResult.value;

    const newDueResult = this.props.amountDue.add(amount);
    if (newDueResult.isFailure) {
      return Result.fail(new InvalidRefundAmountError('Failed to update amount due'));
    }
    this.props.amountDue = newDueResult.value;

    // Update payment status
    if (this.props.amountRefunded.cents === this.props.amountPaid.cents) {
      this.props.paymentStatus = 'REFUNDED';
    } else {
      this.props.paymentStatus = 'PARTIALLY_REFUNDED';
    }

    // If was PAID and now has a balance, revert to OPEN
    if (this.props.status === 'PAID' && this.props.amountDue.cents > 0) {
      this.props.status = 'OPEN';
      this.props.paidAt = undefined;
    }

    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new InvoiceRefundedEvent(this.id.value, amount.cents, reason, this.props.tenantId)
    );

    return Result.ok(undefined);
  }

  void(reason?: string): Result<void, InvalidInvoiceTransitionError | CannotVoidPaidInvoiceError> {
    if (this.props.status === 'VOID') {
      return Result.fail(new InvalidInvoiceTransitionError('VOID', 'VOID'));
    }

    if (!canTransitionInvoiceTo(this.props.status, 'VOID')) {
      return Result.fail(new InvalidInvoiceTransitionError(this.props.status, 'VOID'));
    }

    if (this.props.amountPaid.cents > 0) {
      return Result.fail(new CannotVoidPaidInvoiceError());
    }

    const now = new Date();
    this.props.status = 'VOID';
    this.props.voidedAt = now;
    this.props.updatedAt = now;

    this.addDomainEvent(new InvoiceVoidedEvent(this.id.value, reason, now, this.props.tenantId));

    return Result.ok(undefined);
  }

  markUncollectible(): Result<void, InvalidInvoiceTransitionError> {
    if (!canTransitionInvoiceTo(this.props.status, 'UNCOLLECTIBLE')) {
      return Result.fail(new InvalidInvoiceTransitionError(this.props.status, 'UNCOLLECTIBLE'));
    }

    this.props.status = 'UNCOLLECTIBLE';
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new InvoiceUncollectibleEvent(this.id.value, this.props.amountDue.cents, this.props.tenantId)
    );

    return Result.ok(undefined);
  }

  addLineItem(
    itemProps: CreateLineItemProps
  ): Result<void, InvoiceNotEditableError | InvalidInvoiceError> {
    if (!this.isEditable) {
      return Result.fail(new InvoiceNotEditableError(this.props.status));
    }

    const itemResult = LineItem.create({ ...itemProps, currency: this.props.currency });
    if (itemResult.isFailure) {
      return Result.fail(new InvalidInvoiceError(`Invalid line item: ${itemResult.error.message}`));
    }

    this.props.lineItems.push(itemResult.value);
    this.recalculateTotals();
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  removeLineItem(index: number): Result<void, InvoiceNotEditableError | InvalidInvoiceError> {
    if (!this.isEditable) {
      return Result.fail(new InvoiceNotEditableError(this.props.status));
    }

    if (index < 0 || index >= this.props.lineItems.length) {
      return Result.fail(new InvalidInvoiceError(`Invalid line item index: ${index}`));
    }

    this.props.lineItems.splice(index, 1);
    this.recalculateTotals();
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  // ── Private helpers ──

  private recalculateTotals(): void {
    let subtotal = Money.zero(this.props.currency);
    for (const item of this.props.lineItems) {
      const addResult = subtotal.add(item.total);
      if (addResult.isSuccess) {
        subtotal = addResult.value;
      }
    }
    this.props.subtotal = subtotal;
    this.props.totalTax = this.props.taxRate.calculate(subtotal);

    const totalResult = this.props.subtotal.add(this.props.totalTax);
    if (totalResult.isSuccess) {
      this.props.totalAmount = totalResult.value;
    }

    // Recalculate amountDue = totalAmount - amountPaid + amountRefunded
    const afterPaidResult = this.props.totalAmount.subtract(this.props.amountPaid);
    if (afterPaidResult.isSuccess) {
      const afterRefundResult = afterPaidResult.value.add(this.props.amountRefunded);
      if (afterRefundResult.isSuccess) {
        this.props.amountDue = afterRefundResult.value;
      }
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      invoiceNumber: this.props.invoiceNumber,
      customerId: this.props.customerId,
      tenantId: this.props.tenantId,
      status: this.props.status,
      paymentStatus: this.props.paymentStatus,
      lineItems: this.props.lineItems.map((item) => item.toValue()),
      subtotal: this.props.subtotal.toValue(),
      totalTax: this.props.totalTax.toValue(),
      totalAmount: this.props.totalAmount.toValue(),
      amountPaid: this.props.amountPaid.toValue(),
      amountDue: this.props.amountDue.toValue(),
      amountRefunded: this.props.amountRefunded.toValue(),
      currency: this.props.currency,
      taxRate: this.props.taxRate.toValue(),
      paymentTerms: this.props.paymentTerms.toValue(),
      issueDate: this.props.issueDate.toISOString(),
      dueDate: this.props.dueDate.toISOString(),
      paidAt: this.props.paidAt?.toISOString() ?? null,
      voidedAt: this.props.voidedAt?.toISOString() ?? null,
      billingEmail: this.props.billingEmail,
      billingAddress: this.props.billingAddress ?? null,
      subscriptionId: this.props.subscriptionId ?? null,
      stripeInvoiceId: this.props.stripeInvoiceId ?? null,
      notes: this.props.notes ?? null,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
