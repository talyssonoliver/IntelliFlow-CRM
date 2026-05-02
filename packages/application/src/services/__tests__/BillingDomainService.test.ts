import { describe, it, expect, beforeEach } from 'vitest';
import {
  Invoice,
  InvoiceId,
  Receipt,
  ReceiptId,
  Money,
  DomainEvent,
  InvoiceRepository,
  ReceiptRepository,
  CreateInvoiceProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../../ports/external';
import { BillingDomainService } from '../BillingDomainService';

// ── In-memory test stubs ──

class InMemoryInvoiceRepository implements InvoiceRepository {
  private store = new Map<string, Invoice>();

  async save(invoice: Invoice) {
    this.store.set(invoice.id.value, invoice);
  }
  async findById(id: InvoiceId) {
    return this.store.get(id.value) ?? null;
  }
  async findByInvoiceNumber(invoiceNumber: string, tenantId: string) {
    return (
      [...this.store.values()].find(
        (i) => i.invoiceNumber === invoiceNumber && i.tenantId === tenantId
      ) ?? null
    );
  }
  async findByCustomerId(customerId: string, tenantId: string) {
    return [...this.store.values()].filter(
      (i) => i.customerId === customerId && i.tenantId === tenantId
    );
  }
  async findOverdueInvoices(tenantId: string) {
    return [...this.store.values()].filter((i) => i.isOverdue && i.tenantId === tenantId);
  }
  async delete(id: InvoiceId) {
    this.store.delete(id.value);
  }

  // Test helper
  getAll(): Invoice[] {
    return [...this.store.values()];
  }
}

class InMemoryReceiptRepository implements ReceiptRepository {
  private store = new Map<string, Receipt>();

  async save(receipt: Receipt) {
    this.store.set(receipt.id.value, receipt);
  }
  async findById(id: ReceiptId) {
    return this.store.get(id.value) ?? null;
  }
  async findByInvoiceId(invoiceId: string, tenantId: string) {
    return [...this.store.values()].filter(
      (r) => r.invoiceId === invoiceId && r.tenantId === tenantId
    );
  }
  async findByCustomerId(customerId: string, tenantId: string) {
    return [...this.store.values()].filter(
      (r) => r.customerId === customerId && r.tenantId === tenantId
    );
  }

  // Test helper
  getAll(): Receipt[] {
    return [...this.store.values()];
  }
}

class MockEventBus implements EventBusPort {
  public published: DomainEvent[] = [];

  async publish(event: DomainEvent) {
    this.published.push(event);
  }
  async publishAll(events: readonly DomainEvent[]) {
    this.published.push(...events);
  }
  async subscribe() {
    // no-op for tests
  }
}

// ── Helpers ──

function validCreateProps(overrides: Partial<CreateInvoiceProps> = {}): CreateInvoiceProps {
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
    taxType: 'VAT' as const,
    dueDate: new Date(Date.now() + 30 * 86400000),
    ...overrides,
  };
}

describe('BillingDomainService', () => {
  let invoiceRepo: InMemoryInvoiceRepository;
  let receiptRepo: InMemoryReceiptRepository;
  let eventBus: MockEventBus;
  let service: BillingDomainService;

  beforeEach(() => {
    invoiceRepo = new InMemoryInvoiceRepository();
    receiptRepo = new InMemoryReceiptRepository();
    eventBus = new MockEventBus();
    service = new BillingDomainService(invoiceRepo, receiptRepo, eventBus);
  });

  describe('createInvoice', () => {
    it('should create and persist invoice', async () => {
      const result = await service.createInvoice(validCreateProps());
      expect(result.isSuccess).toBe(true);
      expect(invoiceRepo.getAll().length).toBe(1);
    });

    it('should publish InvoiceCreatedEvent via eventBus', async () => {
      await service.createInvoice(validCreateProps());
      expect(eventBus.published.length).toBeGreaterThan(0);
      expect(eventBus.published[0].eventType).toBe('invoice.created');
    });

    it('should return Result.ok with invoice', async () => {
      const result = await service.createInvoice(validCreateProps());
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('DRAFT');
    });

    it('should return Result.fail for invalid input', async () => {
      const result = await service.createInvoice(validCreateProps({ customerId: '' }));
      expect(result.isFailure).toBe(true);
    });

    it('should assign tenantId', async () => {
      const result = await service.createInvoice(validCreateProps({ tenantId: 'my-tenant' }));
      expect(result.value.tenantId).toBe('my-tenant');
    });
  });

  describe('issueInvoice', () => {
    it('should issue invoice and persist', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      const result = await service.issueInvoice(created.id.value);
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('OPEN');
    });

    it('should publish InvoiceIssuedEvent', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      eventBus.published = [];
      await service.issueInvoice(created.id.value);
      expect(eventBus.published.some((e) => e.eventType === 'invoice.issued')).toBe(true);
    });

    it('should return Result.fail if not found', async () => {
      const result = await service.issueInvoice('00000000-0000-4000-8000-000000000000');
      expect(result.isFailure).toBe(true);
    });

    it('should return Result.fail if not DRAFT', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const result = await service.issueInvoice(created.id.value);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('recordPayment', () => {
    it('should record payment and create receipt', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(created.amountDue.cents, 'GBP').value;
      const result = await service.recordPayment(created.id.value, amount, 'CARD', 'txn_123');

      expect(result.isSuccess).toBe(true);
      expect(result.value.receipt).toBeDefined();
      expect(result.value.invoice.status).toBe('PAID');
    });

    it('should persist both invoice and receipt', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(5000, 'GBP').value;
      await service.recordPayment(created.id.value, amount, 'CARD');

      expect(receiptRepo.getAll().length).toBe(1);
    });

    it('should publish invoice and receipt events', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      eventBus.published = [];

      const amount = Money.fromCents(created.amountDue.cents, 'GBP').value;
      await service.recordPayment(created.id.value, amount, 'CARD');

      expect(eventBus.published.some((e) => e.eventType === 'invoice.payment_recorded')).toBe(true);
      expect(eventBus.published.some((e) => e.eventType === 'receipt.issued')).toBe(true);
    });

    it('should return Result.fail if invoice not found', async () => {
      const amount = Money.fromCents(1000, 'GBP').value;
      const result = await service.recordPayment(
        '00000000-0000-4000-8000-000000000000',
        amount,
        'CARD'
      );
      expect(result.isFailure).toBe(true);
    });

    it('should return Result.fail for invalid amount', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(0, 'GBP').value;
      const result = await service.recordPayment(created.id.value, amount, 'CARD');
      expect(result.isFailure).toBe(true);
    });

    it('should return Result.fail for currency mismatch', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(1000, 'EUR').value;
      const result = await service.recordPayment(created.id.value, amount, 'CARD');
      expect(result.isFailure).toBe(true);
    });

    it('should handle partial payment', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(5000, 'GBP').value;
      const result = await service.recordPayment(created.id.value, amount, 'CARD');
      expect(result.isSuccess).toBe(true);
      expect(result.value.invoice.status).toBe('OPEN');
      expect(result.value.invoice.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('should handle full payment (auto-PAID)', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);

      const amount = Money.fromCents(created.amountDue.cents, 'GBP').value;
      const result = await service.recordPayment(created.id.value, amount, 'CARD');
      expect(result.isSuccess).toBe(true);
      expect(result.value.invoice.status).toBe('PAID');
    });
  });

  describe('processRefund', () => {
    it('should process refund and persist', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(5000, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');

      const refund = Money.fromCents(2000, 'GBP').value;
      const result = await service.processRefund(created.id.value, refund, 'CUSTOMER_REQUEST');
      expect(result.isSuccess).toBe(true);
      expect(result.value.amountRefunded.cents).toBe(2000);
    });

    it('should publish InvoiceRefundedEvent', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(5000, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');
      eventBus.published = [];

      const refund = Money.fromCents(1000, 'GBP').value;
      await service.processRefund(created.id.value, refund, 'BILLING_ERROR');
      expect(eventBus.published.some((e) => e.eventType === 'invoice.refunded')).toBe(true);
    });

    it('should return Result.fail if not found', async () => {
      const refund = Money.fromCents(1000, 'GBP').value;
      const result = await service.processRefund(
        '00000000-0000-4000-8000-000000000000',
        refund,
        'CUSTOMER_REQUEST'
      );
      expect(result.isFailure).toBe(true);
    });

    it('should return Result.fail if refund > amountPaid', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(5000, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');

      const refund = Money.fromCents(6000, 'GBP').value;
      const result = await service.processRefund(created.id.value, refund, 'CUSTOMER_REQUEST');
      expect(result.isFailure).toBe(true);
    });

    it('should handle partial refund', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(created.amountDue.cents, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');

      const refund = Money.fromCents(1000, 'GBP').value;
      const result = await service.processRefund(created.id.value, refund, 'BILLING_ERROR');
      expect(result.isSuccess).toBe(true);
      expect(result.value.paymentStatus).toBe('PARTIALLY_REFUNDED');
    });
  });

  describe('voidInvoice', () => {
    it('should void invoice and persist', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      const result = await service.voidInvoice(created.id.value, 'No longer needed');
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('VOID');
    });

    it('should publish InvoiceVoidedEvent', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      eventBus.published = [];
      await service.voidInvoice(created.id.value, 'Test');
      expect(eventBus.published.some((e) => e.eventType === 'invoice.voided')).toBe(true);
    });

    it('should return Result.fail if not found', async () => {
      const result = await service.voidInvoice('00000000-0000-4000-8000-000000000000');
      expect(result.isFailure).toBe(true);
    });

    it('should return Result.fail if has payments', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(1000, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');

      const result = await service.voidInvoice(created.id.value);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('markUncollectible', () => {
    it('should mark and persist', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const result = await service.markUncollectible(created.id.value);
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('UNCOLLECTIBLE');
    });

    it('should return Result.fail if not OPEN', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      const result = await service.markUncollectible(created.id.value);
      expect(result.isFailure).toBe(true);
    });
  });

  describe('getInvoice', () => {
    it('should return invoice by id', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      const result = await service.getInvoice(created.id.value, 'tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.id.value).toBe(created.id.value);
    });

    it('should return Result.fail if not found', async () => {
      const result = await service.getInvoice('00000000-0000-4000-8000-000000000000', 'tenant-001');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('getInvoicesByCustomer', () => {
    it('should return invoices for customer', async () => {
      await service.createInvoice(validCreateProps({ customerId: 'cust-A' }));
      await service.createInvoice(validCreateProps({ customerId: 'cust-A' }));
      await service.createInvoice(validCreateProps({ customerId: 'cust-B' }));

      const result = await service.getInvoicesByCustomer('cust-A', 'tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.length).toBe(2);
    });

    it('should return empty array for unknown customer', async () => {
      const result = await service.getInvoicesByCustomer('unknown', 'tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.length).toBe(0);
    });
  });

  describe('getOverdueInvoices', () => {
    it('should return overdue invoices', async () => {
      const created = (
        await service.createInvoice(
          validCreateProps({
            dueDate: new Date('2020-01-01'),
            issueDate: new Date('2019-12-01'),
          })
        )
      ).value;
      await service.issueInvoice(created.id.value);

      const result = await service.getOverdueInvoices('tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.length).toBe(1);
    });
  });

  describe('getReceiptsForInvoice', () => {
    it('should return receipts for invoice', async () => {
      const created = (await service.createInvoice(validCreateProps())).value;
      await service.issueInvoice(created.id.value);
      const pay = Money.fromCents(5000, 'GBP').value;
      await service.recordPayment(created.id.value, pay, 'CARD');

      const result = await service.getReceiptsForInvoice(created.id.value, 'tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.length).toBe(1);
    });

    it('should return empty array for no receipts', async () => {
      const result = await service.getReceiptsForInvoice('no-invoice', 'tenant-001');
      expect(result.isSuccess).toBe(true);
      expect(result.value.length).toBe(0);
    });
  });
});
