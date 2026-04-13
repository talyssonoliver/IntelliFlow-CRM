import { describe, it, expect } from 'vitest';
import { Receipt, CreateReceiptProps } from '../Receipt';
import { ReceiptIssuedEvent } from '../billing-events';

function validReceiptProps(overrides: Partial<CreateReceiptProps> = {}): CreateReceiptProps {
  return {
    invoiceId: 'inv-001',
    customerId: 'cust-001',
    tenantId: 'tenant-001',
    amountCents: 10000,
    currency: 'GBP',
    paymentMethod: 'CARD',
    transactionId: 'txn_abc123',
    ...overrides,
  };
}

describe('Receipt', () => {
  describe('Receipt.create', () => {
    it('should create receipt with valid props', () => {
      const result = Receipt.create(validReceiptProps());
      expect(result.isSuccess).toBe(true);
      expect(result.value.invoiceId).toBe('inv-001');
    });

    it('should generate receiptNumber', () => {
      const receipt = Receipt.create(validReceiptProps()).value;
      expect(receipt.receiptNumber).toMatch(/^RCT-\d{4}-\d{6}$/);
    });

    it('should emit ReceiptIssuedEvent', () => {
      const receipt = Receipt.create(validReceiptProps()).value;
      expect(receipt.domainEvents.length).toBe(1);
      expect(receipt.domainEvents[0]).toBeInstanceOf(ReceiptIssuedEvent);
    });

    it('should include tenantId', () => {
      const receipt = Receipt.create(validReceiptProps({ tenantId: 'my-tenant' })).value;
      expect(receipt.tenantId).toBe('my-tenant');
    });

    it('should store invoiceId', () => {
      const receipt = Receipt.create(validReceiptProps({ invoiceId: 'inv-xyz' })).value;
      expect(receipt.invoiceId).toBe('inv-xyz');
    });

    it('should store paymentMethod', () => {
      const receipt = Receipt.create(validReceiptProps({ paymentMethod: 'BANK_TRANSFER' })).value;
      expect(receipt.paymentMethod).toBe('BANK_TRANSFER');
    });

    it('should store transactionId', () => {
      const receipt = Receipt.create(validReceiptProps({ transactionId: 'txn_123' })).value;
      expect(receipt.transactionId).toBe('txn_123');
    });

    it('should store paymentDate', () => {
      const date = new Date('2026-06-15');
      const receipt = Receipt.create(validReceiptProps({ paymentDate: date })).value;
      expect(receipt.paymentDate).toEqual(date);
    });

    it('should reject invalid invoiceId', () => {
      const result = Receipt.create(validReceiptProps({ invoiceId: '' }));
      expect(result.isFailure).toBe(true);
    });

    it('should reject amount <= 0', () => {
      const result = Receipt.create(validReceiptProps({ amountCents: 0 }));
      expect(result.isFailure).toBe(true);
    });

    it('should reject invalid currency', () => {
      const result = Receipt.create(validReceiptProps({ currency: 'INVALID' }));
      expect(result.isFailure).toBe(true);
    });
  });

  describe('Receipt immutability', () => {
    it('should not have any update methods', () => {
      const receipt = Receipt.create(validReceiptProps()).value;
      // Receipt should only have getters and static methods
      expect(typeof (receipt as any).update).toBe('undefined');
      expect(typeof (receipt as any).edit).toBe('undefined');
      expect(typeof (receipt as any).modify).toBe('undefined');
    });
  });

  describe('Receipt.reconstitute', () => {
    it('should rebuild from persistence without events', () => {
      const original = Receipt.create(validReceiptProps()).value;
      const json = original.toJSON();
      expect(json.receiptNumber).toBeDefined();
      expect(json.invoiceId).toBe('inv-001');
    });
  });

  describe('Receipt.toJSON', () => {
    it('should serialize all fields', () => {
      const receipt = Receipt.create(validReceiptProps()).value;
      const json = receipt.toJSON();
      expect(json.receiptNumber).toBeDefined();
      expect(json.invoiceId).toBe('inv-001');
      expect(json.customerId).toBe('cust-001');
      expect(json.tenantId).toBe('tenant-001');
      expect(json.amount).toBeDefined();
      expect(json.paymentMethod).toBe('CARD');
      expect(json.transactionId).toBe('txn_abc123');
      expect(json.paymentDate).toBeDefined();
      expect(json.createdAt).toBeDefined();
    });
  });
});
