import { DomainEvent } from '../../shared/DomainEvent';

export class InvoiceCreatedEvent extends DomainEvent {
  readonly eventType = 'invoice.created';

  constructor(
    public readonly invoiceId: string,
    public readonly customerId: string,
    public readonly totalAmountCents: number,
    public readonly currency: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      customerId: this.customerId,
      totalAmountCents: this.totalAmountCents,
      currency: this.currency,
      tenantId: this.tenantId,
    };
  }
}

export class InvoiceIssuedEvent extends DomainEvent {
  readonly eventType = 'invoice.issued';

  constructor(
    public readonly invoiceId: string,
    public readonly invoiceNumber: string,
    public readonly dueDate: Date,
    public readonly totalAmountCents: number,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      invoiceNumber: this.invoiceNumber,
      dueDate: this.dueDate.toISOString(),
      totalAmountCents: this.totalAmountCents,
      tenantId: this.tenantId,
    };
  }
}

export class InvoicePaymentRecordedEvent extends DomainEvent {
  readonly eventType = 'invoice.payment_recorded';

  constructor(
    public readonly invoiceId: string,
    public readonly paymentAmountCents: number,
    public readonly amountPaidCents: number,
    public readonly amountDueCents: number,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      paymentAmountCents: this.paymentAmountCents,
      amountPaidCents: this.amountPaidCents,
      amountDueCents: this.amountDueCents,
      tenantId: this.tenantId,
    };
  }
}

export class InvoicePaidEvent extends DomainEvent {
  readonly eventType = 'invoice.paid';

  constructor(
    public readonly invoiceId: string,
    public readonly amountPaidCents: number,
    public readonly paidAt: Date,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      amountPaidCents: this.amountPaidCents,
      paidAt: this.paidAt.toISOString(),
      tenantId: this.tenantId,
    };
  }
}

export class InvoiceVoidedEvent extends DomainEvent {
  readonly eventType = 'invoice.voided';

  constructor(
    public readonly invoiceId: string,
    public readonly reason: string | undefined,
    public readonly voidedAt: Date,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      reason: this.reason,
      voidedAt: this.voidedAt.toISOString(),
      tenantId: this.tenantId,
    };
  }
}

export class InvoiceRefundedEvent extends DomainEvent {
  readonly eventType = 'invoice.refunded';

  constructor(
    public readonly invoiceId: string,
    public readonly refundAmountCents: number,
    public readonly reason: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      refundAmountCents: this.refundAmountCents,
      reason: this.reason,
      tenantId: this.tenantId,
    };
  }
}

export class InvoiceUncollectibleEvent extends DomainEvent {
  readonly eventType = 'invoice.uncollectible';

  constructor(
    public readonly invoiceId: string,
    public readonly amountDueCents: number,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      invoiceId: this.invoiceId,
      amountDueCents: this.amountDueCents,
      tenantId: this.tenantId,
    };
  }
}

export class SubscriptionCanceledEvent extends DomainEvent {
  readonly eventType = 'subscription.canceled';

  constructor(
    public readonly subscriptionId: string,
    public readonly customerId: string,
    public readonly reason: string | undefined,
    public readonly cancelAtPeriodEnd: boolean,
    public readonly effectiveDate: Date,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      subscriptionId: this.subscriptionId,
      customerId: this.customerId,
      reason: this.reason,
      cancelAtPeriodEnd: this.cancelAtPeriodEnd,
      effectiveDate: this.effectiveDate.toISOString(),
      tenantId: this.tenantId,
    };
  }
}

export class SubscriptionPausedEvent extends DomainEvent {
  readonly eventType = 'subscription.paused';

  constructor(
    public readonly subscriptionId: string,
    public readonly customerId: string,
    public readonly pauseDurationMonths: number,
    public readonly resumesAt: Date,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      subscriptionId: this.subscriptionId,
      customerId: this.customerId,
      pauseDurationMonths: this.pauseDurationMonths,
      resumesAt: this.resumesAt.toISOString(),
      tenantId: this.tenantId,
    };
  }
}

export class ReceiptIssuedEvent extends DomainEvent {
  readonly eventType = 'receipt.issued';

  constructor(
    public readonly receiptId: string,
    public readonly invoiceId: string,
    public readonly amountCents: number,
    public readonly paymentMethod: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      receiptId: this.receiptId,
      invoiceId: this.invoiceId,
      amountCents: this.amountCents,
      paymentMethod: this.paymentMethod,
      tenantId: this.tenantId,
    };
  }
}
