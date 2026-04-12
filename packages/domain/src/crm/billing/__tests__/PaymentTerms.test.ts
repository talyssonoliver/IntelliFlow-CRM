import { describe, it, expect } from 'vitest';
import { PaymentTerms } from '../PaymentTerms';

describe('PaymentTerms', () => {
  describe('PaymentTerms.create', () => {
    it('should create with valid daysUntilDue', () => {
      const result = PaymentTerms.create(30, 'Net 30');
      expect(result.isSuccess).toBe(true);
      expect(result.value.daysUntilDue).toBe(30);
      expect(result.value.description).toBe('Net 30');
    });

    it('should reject negative daysUntilDue', () => {
      const result = PaymentTerms.create(-1, 'Invalid');
      expect(result.isFailure).toBe(true);
    });

    it('should calculate due date for Net 30', () => {
      const terms = PaymentTerms.create(30, 'Net 30').value;
      const issueDate = new Date('2026-01-01');
      const dueDate = terms.calculateDueDate(issueDate);
      expect(dueDate.toISOString().substring(0, 10)).toBe('2026-01-31');
    });

    it('should calculate due date for Due on Receipt (0 days)', () => {
      const terms = PaymentTerms.create(0, 'Due on Receipt').value;
      const issueDate = new Date('2026-01-15');
      const dueDate = terms.calculateDueDate(issueDate);
      expect(dueDate.toISOString().substring(0, 10)).toBe('2026-01-15');
    });
  });

  describe('PaymentTerms presets', () => {
    it('should create via net30()', () => {
      const terms = PaymentTerms.net30();
      expect(terms.daysUntilDue).toBe(30);
      expect(terms.description).toBe('Net 30');
    });

    it('should create via dueOnReceipt()', () => {
      const terms = PaymentTerms.dueOnReceipt();
      expect(terms.daysUntilDue).toBe(0);
      expect(terms.description).toBe('Due on Receipt');
    });
  });

  describe('PaymentTerms.toValue', () => {
    it('should serialize via toValue()', () => {
      const terms = PaymentTerms.create(45, 'Net 45').value;
      const val = terms.toValue();
      expect(val).toEqual({ daysUntilDue: 45, description: 'Net 45' });
    });
  });

  describe('PaymentTerms equality', () => {
    it('should compare equality', () => {
      const a = PaymentTerms.create(30, 'Net 30').value;
      const b = PaymentTerms.create(30, 'Net 30').value;
      expect(a.equals(b)).toBe(true);
    });

    it('should detect inequality', () => {
      const a = PaymentTerms.create(30, 'Net 30').value;
      const b = PaymentTerms.create(15, 'Net 15').value;
      expect(a.equals(b)).toBe(false);
    });
  });
});
