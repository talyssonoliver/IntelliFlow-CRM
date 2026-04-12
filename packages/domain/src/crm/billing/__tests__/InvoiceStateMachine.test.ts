import { describe, it, expect } from 'vitest';
import {
  canTransitionInvoiceTo,
  isTerminalInvoiceStatus,
  INVOICE_STATUSES,
  InvoiceStatus,
} from '../billing-constants';

describe('Invoice State Machine', () => {
  describe('canTransitionInvoiceTo', () => {
    // Valid transitions
    it('should allow DRAFT → OPEN', () => {
      expect(canTransitionInvoiceTo('DRAFT', 'OPEN')).toBe(true);
    });

    it('should allow DRAFT → VOID', () => {
      expect(canTransitionInvoiceTo('DRAFT', 'VOID')).toBe(true);
    });

    it('should allow OPEN → PAID', () => {
      expect(canTransitionInvoiceTo('OPEN', 'PAID')).toBe(true);
    });

    it('should allow OPEN → VOID', () => {
      expect(canTransitionInvoiceTo('OPEN', 'VOID')).toBe(true);
    });

    it('should allow OPEN → UNCOLLECTIBLE', () => {
      expect(canTransitionInvoiceTo('OPEN', 'UNCOLLECTIBLE')).toBe(true);
    });

    // Invalid transitions
    it('should not allow DRAFT → PAID', () => {
      expect(canTransitionInvoiceTo('DRAFT', 'PAID')).toBe(false);
    });

    it('should not allow DRAFT → UNCOLLECTIBLE', () => {
      expect(canTransitionInvoiceTo('DRAFT', 'UNCOLLECTIBLE')).toBe(false);
    });

    it('should not allow DRAFT → DRAFT', () => {
      expect(canTransitionInvoiceTo('DRAFT', 'DRAFT')).toBe(false);
    });

    it('should not allow OPEN → OPEN', () => {
      expect(canTransitionInvoiceTo('OPEN', 'OPEN')).toBe(false);
    });

    it('should not allow OPEN → DRAFT', () => {
      expect(canTransitionInvoiceTo('OPEN', 'DRAFT')).toBe(false);
    });

    // Terminal states cannot transition
    const terminalStates: InvoiceStatus[] = ['PAID', 'VOID', 'UNCOLLECTIBLE'];
    for (const terminal of terminalStates) {
      for (const target of INVOICE_STATUSES) {
        it(`should not allow ${terminal} → ${target}`, () => {
          expect(canTransitionInvoiceTo(terminal, target)).toBe(false);
        });
      }
    }
  });

  describe('isTerminalInvoiceStatus', () => {
    it('should identify PAID as terminal', () => {
      expect(isTerminalInvoiceStatus('PAID')).toBe(true);
    });

    it('should identify VOID as terminal', () => {
      expect(isTerminalInvoiceStatus('VOID')).toBe(true);
    });

    it('should identify UNCOLLECTIBLE as terminal', () => {
      expect(isTerminalInvoiceStatus('UNCOLLECTIBLE')).toBe(true);
    });

    it('should identify DRAFT as non-terminal', () => {
      expect(isTerminalInvoiceStatus('DRAFT')).toBe(false);
    });

    it('should identify OPEN as non-terminal', () => {
      expect(isTerminalInvoiceStatus('OPEN')).toBe(false);
    });
  });
});
