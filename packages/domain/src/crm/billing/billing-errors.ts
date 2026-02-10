import { DomainError } from '../../shared/Result';
import { InvoiceStatus } from './billing-constants';

export class InvalidInvoiceTransitionError extends DomainError {
  readonly code = 'INVALID_INVOICE_TRANSITION';

  constructor(from: InvoiceStatus, to: InvoiceStatus) {
    super(`Invalid invoice transition from ${from} to ${to}`);
  }
}

export class InvoiceNotEditableError extends DomainError {
  readonly code = 'INVOICE_NOT_EDITABLE';

  constructor(status: InvoiceStatus) {
    super(`Invoice is not editable in status ${status}. Only DRAFT invoices can be modified.`);
  }
}

export class InvoiceAlreadyVoidedError extends DomainError {
  readonly code = 'INVOICE_ALREADY_VOIDED';

  constructor() {
    super('Invoice is already voided');
  }
}

export class InvalidPaymentAmountError extends DomainError {
  readonly code = 'INVALID_PAYMENT_AMOUNT';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidRefundAmountError extends DomainError {
  readonly code = 'INVALID_REFUND_AMOUNT';

  constructor(message: string) {
    super(message);
  }
}

export class CannotVoidPaidInvoiceError extends DomainError {
  readonly code = 'CANNOT_VOID_PAID_INVOICE';

  constructor() {
    super('Cannot void an invoice that has received payments. Process a refund first.');
  }
}

export class InvalidLineItemError extends DomainError {
  readonly code = 'INVALID_LINE_ITEM';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidTaxRateError extends DomainError {
  readonly code = 'INVALID_TAX_RATE';

  constructor(rate: number) {
    super(`Invalid tax rate: ${rate}. Rate must be between 0 and 100.`);
  }
}

export class BillingCurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(expected: string, received: string) {
    super(`Currency mismatch: invoice uses ${expected} but received ${received}`);
  }
}

export class InvalidInvoiceError extends DomainError {
  readonly code = 'INVALID_INVOICE';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidReceiptError extends DomainError {
  readonly code = 'INVALID_RECEIPT';

  constructor(message: string) {
    super(message);
  }
}
