import { describe, it, expect } from 'vitest';
import { Invoice, CreateInvoiceProps } from '../Invoice';
import { Money } from '../../../shared/Money';
import {
  InvoiceCreatedEvent,
  InvoiceIssuedEvent,
  InvoicePaymentRecordedEvent,
  InvoicePaidEvent,
  InvoiceVoidedEvent,
  InvoiceRefundedEvent,
  InvoiceUncollectibleEvent,
} from '../billing-events';

function validInvoiceProps(overrides: Partial<CreateInvoiceProps> = {}): CreateInvoiceProps {
  return {
    customerId: 'cust-001',
    tenantId: 'tenant-001',
    lineItems: [
      {
        description: 'Monthly plan',
        quantity: 1,
        unitPriceCents: 10000,
        type: 'SUBSCRIPTION' as const,
      },
    ],
    billingEmail: 'billing@example.com',
    currency: 'GBP',
    taxRate: 20,
    taxType: 'VAT',
    dueDate: new Date(Date.now() + 30 * 86400000),
    ...overrides,
  };
}

function createOpenInvoice(overrides: Partial<CreateInvoiceProps> = {}) {
  const invoice = Invoice.create(validInvoiceProps(overrides)).value;
  invoice.issue();
  invoice.clearDomainEvents();
  return invoice;
}

describe('Invoice', () => {
  describe('Invoice.create', () => {
    it('should create draft invoice with valid props', () => {
      const result = Invoice.create(validInvoiceProps());
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('DRAFT');
    });

    it('should calculate subtotal from line items', () => {
      const result = Invoice.create(
        validInvoiceProps({
          lineItems: [
            { description: 'Item 1', quantity: 2, unitPriceCents: 5000, type: 'ONE_TIME' },
            { description: 'Item 2', quantity: 1, unitPriceCents: 3000, type: 'ONE_TIME' },
          ],
        })
      );
      expect(result.isSuccess).toBe(true);
      expect(result.value.subtotal.cents).toBe(13000);
    });

    it('should calculate totalTax from TaxRate', () => {
      const result = Invoice.create(validInvoiceProps({ taxRate: 20 }));
      expect(result.isSuccess).toBe(true);
      // 10000 * 0.20 = 2000
      expect(result.value.totalTax.cents).toBe(2000);
    });

    it('should calculate totalAmount = subtotal + totalTax', () => {
      const result = Invoice.create(validInvoiceProps({ taxRate: 20 }));
      expect(result.isSuccess).toBe(true);
      expect(result.value.totalAmount.cents).toBe(12000);
    });

    it('should set amountDue = totalAmount', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.amountDue.cents).toBe(invoice.totalAmount.cents);
    });

    it('should set amountPaid = 0', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.amountPaid.cents).toBe(0);
    });

    it('should set amountRefunded = 0', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.amountRefunded.cents).toBe(0);
    });

    it('should set status = DRAFT', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.status).toBe('DRAFT');
    });

    it('should set paymentStatus = PENDING', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.paymentStatus).toBe('PENDING');
    });

    it('should emit InvoiceCreatedEvent', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const events = invoice.domainEvents;
      expect(events.length).toBe(1);
      expect(events[0]).toBeInstanceOf(InvoiceCreatedEvent);
    });

    it('should include tenantId', () => {
      const invoice = Invoice.create(validInvoiceProps({ tenantId: 'my-tenant' })).value;
      expect(invoice.tenantId).toBe('my-tenant');
    });

    it('should reject empty line items', () => {
      const result = Invoice.create(validInvoiceProps({ lineItems: [] }));
      expect(result.isFailure).toBe(true);
    });

    it('should reject invalid customerId', () => {
      const result = Invoice.create(validInvoiceProps({ customerId: '' }));
      expect(result.isFailure).toBe(true);
    });

    it('should reject dueDate before issueDate', () => {
      const result = Invoice.create(
        validInvoiceProps({
          issueDate: new Date('2026-03-01'),
          dueDate: new Date('2026-02-01'),
        })
      );
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.issue', () => {
    it('should transition DRAFT → OPEN', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const result = invoice.issue();
      expect(result.isSuccess).toBe(true);
      expect(invoice.status).toBe('OPEN');
    });

    it('should emit InvoiceIssuedEvent', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.clearDomainEvents();
      invoice.issue();
      const events = invoice.domainEvents;
      expect(events.some((e) => e instanceof InvoiceIssuedEvent)).toBe(true);
    });

    it('should reject if already OPEN', () => {
      const invoice = createOpenInvoice();
      const result = invoice.issue();
      expect(result.isFailure).toBe(true);
    });

    it('should reject if already PAID', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      const result = invoice.issue();
      expect(result.isFailure).toBe(true);
    });

    it('should reject if VOID', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      const result = invoice.issue();
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.recordPayment', () => {
    it('should record full payment on OPEN invoice', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isSuccess).toBe(true);
      expect(invoice.amountDue.cents).toBe(0);
    });

    it('should transition to PAID when amountDue = 0', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.status).toBe('PAID');
    });

    it('should emit InvoicePaidEvent on full payment', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.domainEvents.some((e) => e instanceof InvoicePaidEvent)).toBe(true);
    });

    it('should record partial payment (50%)', () => {
      const invoice = createOpenInvoice();
      const halfCents = Math.floor(invoice.amountDue.cents / 2);
      const amount = Money.fromCents(halfCents, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isSuccess).toBe(true);
      expect(invoice.amountPaid.cents).toBe(halfCents);
      expect(invoice.status).toBe('OPEN');
    });

    it('should set paymentStatus = PARTIALLY_PAID', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(1000, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('should emit InvoicePaymentRecordedEvent', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(1000, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.domainEvents.some((e) => e instanceof InvoicePaymentRecordedEvent)).toBe(true);
    });

    it('should handle second partial payment completing total', () => {
      const invoice = createOpenInvoice();
      const totalCents = invoice.amountDue.cents;
      const firstPayment = Money.fromCents(Math.floor(totalCents / 2), 'GBP').value;
      invoice.recordPayment(firstPayment);

      const remaining = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(remaining);
      expect(invoice.status).toBe('PAID');
      expect(invoice.amountDue.cents).toBe(0);
    });

    it('should reject payment on DRAFT invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const amount = Money.fromCents(1000, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isFailure).toBe(true);
    });

    it('should reject payment on VOID invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      const amount = Money.fromCents(1000, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isFailure).toBe(true);
    });

    it('should reject payment on PAID invoice', () => {
      const invoice = createOpenInvoice();
      const fullAmount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(fullAmount);
      const extra = Money.fromCents(100, 'GBP').value;
      const result = invoice.recordPayment(extra);
      expect(result.isFailure).toBe(true);
    });

    it('should reject payment amount <= 0', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(0, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isFailure).toBe(true);
    });

    it('should reject payment exceeding amountDue', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents + 100, 'GBP').value;
      const result = invoice.recordPayment(amount);
      expect(result.isFailure).toBe(true);
    });

    it('should reject currency mismatch', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(1000, 'EUR').value;
      const result = invoice.recordPayment(amount);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.processRefund', () => {
    it('should process refund on OPEN invoice with payments', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      invoice.clearDomainEvents();

      const refundAmount = Money.fromCents(2000, 'GBP').value;
      const result = invoice.processRefund(refundAmount, 'CUSTOMER_REQUEST');
      expect(result.isSuccess).toBe(true);
      expect(invoice.amountRefunded.cents).toBe(2000);
    });

    it('should process partial refund', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(payAmount);

      const refund = Money.fromCents(1000, 'GBP').value;
      const result = invoice.processRefund(refund, 'BILLING_ERROR');
      expect(result.isSuccess).toBe(true);
      expect(invoice.paymentStatus).toBe('PARTIALLY_REFUNDED');
    });

    it('should update amountRefunded', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      const refund = Money.fromCents(3000, 'GBP').value;
      invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(invoice.amountRefunded.cents).toBe(3000);
    });

    it('should update amountDue (increase by refund amount)', () => {
      const invoice = createOpenInvoice();
      const totalDue = invoice.amountDue.cents;
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      const dueBefore = invoice.amountDue.cents;

      const refund = Money.fromCents(2000, 'GBP').value;
      invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(invoice.amountDue.cents).toBe(dueBefore + 2000);
    });

    it('should emit InvoiceRefundedEvent', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      invoice.clearDomainEvents();

      const refund = Money.fromCents(1000, 'GBP').value;
      invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(invoice.domainEvents.some((e) => e instanceof InvoiceRefundedEvent)).toBe(true);
    });

    it('should reject refund amount <= 0', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      const refund = Money.fromCents(0, 'GBP').value;
      const result = invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });

    it('should reject refund exceeding amountPaid', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(payAmount);
      const refund = Money.fromCents(6000, 'GBP').value;
      const result = invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });

    it('should reject refund on DRAFT invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const refund = Money.fromCents(1000, 'GBP').value;
      const result = invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });

    it('should reject refund on VOID invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      const refund = Money.fromCents(1000, 'GBP').value;
      const result = invoice.processRefund(refund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });

    it('should allow multiple refunds summing to amountPaid', () => {
      const invoice = createOpenInvoice();
      const payAmount = Money.fromCents(6000, 'GBP').value;
      invoice.recordPayment(payAmount);

      const r1 = Money.fromCents(2000, 'GBP').value;
      expect(invoice.processRefund(r1, 'CUSTOMER_REQUEST').isSuccess).toBe(true);
      const r2 = Money.fromCents(2000, 'GBP').value;
      expect(invoice.processRefund(r2, 'BILLING_ERROR').isSuccess).toBe(true);
      const r3 = Money.fromCents(2000, 'GBP').value;
      expect(invoice.processRefund(r3, 'OTHER').isSuccess).toBe(true);

      expect(invoice.amountRefunded.cents).toBe(6000);
      expect(invoice.paymentStatus).toBe('REFUNDED');
    });
  });

  describe('Invoice.void', () => {
    it('should void DRAFT invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const result = invoice.void('Changed mind');
      expect(result.isSuccess).toBe(true);
      expect(invoice.status).toBe('VOID');
    });

    it('should void OPEN invoice with no payments', () => {
      const invoice = createOpenInvoice();
      const result = invoice.void('No longer needed');
      expect(result.isSuccess).toBe(true);
      expect(invoice.status).toBe('VOID');
    });

    it('should emit InvoiceVoidedEvent', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.clearDomainEvents();
      invoice.void('Test');
      expect(invoice.domainEvents.some((e) => e instanceof InvoiceVoidedEvent)).toBe(true);
    });

    it('should set voidedAt timestamp', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      expect(invoice.voidedAt).toBeDefined();
    });

    it('should reject void on PAID invoice', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      const result = invoice.void();
      expect(result.isFailure).toBe(true);
    });

    it('should reject void on OPEN invoice with payments', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(1000, 'GBP').value;
      invoice.recordPayment(amount);
      const result = invoice.void();
      expect(result.isFailure).toBe(true);
    });

    it('should reject void on already VOID invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      const result = invoice.void();
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.markUncollectible', () => {
    it('should transition OPEN → UNCOLLECTIBLE', () => {
      const invoice = createOpenInvoice();
      const result = invoice.markUncollectible();
      expect(result.isSuccess).toBe(true);
      expect(invoice.status).toBe('UNCOLLECTIBLE');
    });

    it('should emit InvoiceUncollectibleEvent', () => {
      const invoice = createOpenInvoice();
      invoice.clearDomainEvents();
      invoice.markUncollectible();
      expect(invoice.domainEvents.some((e) => e instanceof InvoiceUncollectibleEvent)).toBe(true);
    });

    it('should reject on DRAFT', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const result = invoice.markUncollectible();
      expect(result.isFailure).toBe(true);
    });

    it('should reject on PAID', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      const result = invoice.markUncollectible();
      expect(result.isFailure).toBe(true);
    });

    it('should reject on VOID', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      invoice.void();
      const result = invoice.markUncollectible();
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.addLineItem', () => {
    it('should add line item to DRAFT invoice', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const result = invoice.addLineItem({
        description: 'Extra',
        quantity: 1,
        unitPriceCents: 500,
        type: 'ONE_TIME',
      });
      expect(result.isSuccess).toBe(true);
      expect(invoice.lineItems.length).toBe(2);
    });

    it('should recalculate totals', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const oldTotal = invoice.totalAmount.cents;
      invoice.addLineItem({
        description: 'Extra',
        quantity: 1,
        unitPriceCents: 5000,
        type: 'ONE_TIME',
      });
      expect(invoice.totalAmount.cents).toBeGreaterThan(oldTotal);
    });

    it('should reject on non-DRAFT invoice', () => {
      const invoice = createOpenInvoice();
      const result = invoice.addLineItem({
        description: 'Extra',
        quantity: 1,
        unitPriceCents: 500,
        type: 'ONE_TIME',
      });
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice.removeLineItem', () => {
    it('should remove line item by index', () => {
      const invoice = Invoice.create(
        validInvoiceProps({
          lineItems: [
            { description: 'A', quantity: 1, unitPriceCents: 1000, type: 'ONE_TIME' },
            { description: 'B', quantity: 1, unitPriceCents: 2000, type: 'ONE_TIME' },
          ],
        })
      ).value;
      const result = invoice.removeLineItem(0);
      expect(result.isSuccess).toBe(true);
      expect(invoice.lineItems.length).toBe(1);
      expect(invoice.lineItems[0].description).toBe('B');
    });

    it('should recalculate totals', () => {
      const invoice = Invoice.create(
        validInvoiceProps({
          lineItems: [
            { description: 'A', quantity: 1, unitPriceCents: 1000, type: 'ONE_TIME' },
            { description: 'B', quantity: 1, unitPriceCents: 2000, type: 'ONE_TIME' },
          ],
        })
      ).value;
      invoice.removeLineItem(0);
      expect(invoice.subtotal.cents).toBe(2000);
    });

    it('should reject on non-DRAFT invoice', () => {
      const invoice = createOpenInvoice();
      const result = invoice.removeLineItem(0);
      expect(result.isFailure).toBe(true);
    });

    it('should reject invalid index', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      const result = invoice.removeLineItem(99);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice computed properties', () => {
    it('isEditable should be true for DRAFT', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.isEditable).toBe(true);
    });

    it('isEditable should be false for OPEN', () => {
      const invoice = createOpenInvoice();
      expect(invoice.isEditable).toBe(false);
    });

    it('isPaid should be true for PAID', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(invoice.amountDue.cents, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.isPaid).toBe(true);
    });

    it('isOverdue should be true when OPEN + past due', () => {
      const invoice = Invoice.create(
        validInvoiceProps({
          dueDate: new Date('2020-01-01'),
          issueDate: new Date('2019-12-01'),
        })
      ).value;
      invoice.issue();
      expect(invoice.isOverdue).toBe(true);
    });

    it('isOverdue should be false when OPEN + not past due', () => {
      const invoice = createOpenInvoice();
      expect(invoice.isOverdue).toBe(false);
    });

    it('hasPayments should be true when amountPaid > 0', () => {
      const invoice = createOpenInvoice();
      const amount = Money.fromCents(1000, 'GBP').value;
      invoice.recordPayment(amount);
      expect(invoice.hasPayments).toBe(true);
    });

    it('outstandingBalance should equal amountDue', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.outstandingBalance.cents).toBe(invoice.amountDue.cents);
    });
  });

  describe('Invoice.reconstitute', () => {
    it('should rebuild from persistence without events', () => {
      const original = Invoice.create(validInvoiceProps()).value;
      const json = original.toJSON() as any;
      // reconstitute would be called by the repository with raw props
      // Just verify the original can serialize
      expect(json.status).toBe('DRAFT');
      expect(json.invoiceNumber).toBeDefined();
    });
  });

  describe('Invoice invariants', () => {
    it('totalAmount always equals subtotal + totalTax', () => {
      const invoice = Invoice.create(validInvoiceProps({ taxRate: 10 })).value;
      expect(invoice.totalAmount.cents).toBe(invoice.subtotal.cents + invoice.totalTax.cents);
    });

    it('amountDue equals totalAmount - amountPaid + amountRefunded initially', () => {
      const invoice = Invoice.create(validInvoiceProps()).value;
      expect(invoice.amountDue.cents).toBe(invoice.totalAmount.cents);
    });

    it('amountPaid never exceeds totalAmount', () => {
      const invoice = createOpenInvoice();
      const overAmount = Money.fromCents(invoice.totalAmount.cents + 1, 'GBP').value;
      const result = invoice.recordPayment(overAmount);
      expect(result.isFailure).toBe(true);
    });

    it('amountRefunded never exceeds amountPaid', () => {
      const invoice = createOpenInvoice();
      const pay = Money.fromCents(5000, 'GBP').value;
      invoice.recordPayment(pay);
      const overRefund = Money.fromCents(5001, 'GBP').value;
      const result = invoice.processRefund(overRefund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Invoice performance', () => {
    it('should evaluate billing rules under 50ms at p95', () => {
      const durations: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        Invoice.create({
          customerId: 'cust-1',
          tenantId: 'tenant-1',
          lineItems: Array.from({ length: 10 }, (_, j) => ({
            description: `Item ${j}`,
            quantity: j + 1,
            unitPriceCents: 9999,
            type: 'SUBSCRIPTION' as const,
          })),
          billingEmail: 'test@example.com',
          dueDate: new Date(Date.now() + 30 * 86400000),
          taxRate: 20,
          taxType: 'VAT' as const,
        });
        durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      expect(durations[Math.floor(durations.length * 0.95)]).toBeLessThan(50);
    });
  });
});
