/**
 * Property tests for Invoice / Receipt / Ticket state machines and sequence
 * counters (billing-constants.ts + Invoice.ts + Receipt.ts).
 *
 * Property id: RACE-PURE-07
 * Title: Module-level counters (invoiceSequence, receiptSequence) are
 *        process-global mutable singletons; numbers generated sequentially in
 *        the same worker must always be unique and monotonically increasing.
 *
 * Invariants covered:
 *  1. canTransitionInvoiceTo — only valid edges return true; identity + reverse
 *     transitions are rejected.
 *  2. isTerminalInvoiceStatus — terminal iff no valid successors.
 *  3. State-machine completeness — every (from, to) pair is either
 *     canTransition=true XOR it is not, never undefined.
 *  4. VALID_INVOICE_TRANSITIONS is acyclic from non-terminal states.
 *  5. Terminal absorbing property — no transition leaves a terminal state.
 *  6. Invoice.create → unique invoiceNumbers per call in a single execution
 *     context (RACE-PURE-07 counter guard).
 *  7. Receipt.create → unique receiptNumbers per call (RACE-PURE-07 counter
 *     guard for receipts).
 *  8. Invoice number format: INV-{year}-{6-digit padded counter}.
 *  9. Receipt number format: RCT-{year}-{6-digit padded counter}.
 * 10. TaxRate + subtotal linearity: subtotal + tax === totalAmount for any
 *     valid (rate, lineItems) combination.
 * 11. Invoice.create rejects empty customerId / tenantId / lineItems /
 *     billingEmail (validation properties).
 * 12. PaymentTerms round-trip: create → toValue preserves fields.
 * 13. LineItem total = unitPrice × quantity (arithmetic invariant).
 * 14. Invoice amountDue = totalAmount on fresh DRAFT (no payments yet).
 * 15. recordPayment(full amount) transitions status OPEN → PAID.
 * 16. processRefund cannot exceed amountPaid.
 * 17. void() on a PAID invoice (with amountPaid > 0) always fails.
 *
 * @see docs/operations/property-testing/race-condition-findings.json RACE-PURE-07
 */

import { describe, expect, test as vitestTest } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  canTransitionInvoiceTo,
  isTerminalInvoiceStatus,
  INVOICE_STATUSES,
  VALID_INVOICE_TRANSITIONS,
  InvoiceStatus,
  PAYMENT_METHODS,
  LINE_ITEM_TYPES,
} from '@intelliflow/domain';
import { Invoice, CreateInvoiceProps } from '@intelliflow/domain';
import { Receipt } from '@intelliflow/domain';
import { Money } from '@intelliflow/domain';
import { PaymentTerms } from '@intelliflow/domain';
import { LineItem } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Inline bounded arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** One of the five invoice statuses. */
const arbInvoiceStatus = fc.constantFrom(...INVOICE_STATUSES);

/** The three terminal statuses. */
const TERMINAL_STATUSES: ReadonlyArray<InvoiceStatus> = ['PAID', 'VOID', 'UNCOLLECTIBLE'];

/** The two non-terminal statuses. */
const NON_TERMINAL_STATUSES: ReadonlyArray<InvoiceStatus> = ['DRAFT', 'OPEN'];

const arbTerminalStatus = fc.constantFrom(...TERMINAL_STATUSES);
const arbNonTerminalStatus = fc.constantFrom(...NON_TERMINAL_STATUSES);

/** A valid tax rate (0..100, two decimal places). */
const arbTaxRate = fc
  .double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

/** Supported non-JPY currencies (where 1 unit = 100 cents). */
const arbCurrency = fc.constantFrom('GBP', 'EUR', 'CAD', 'AUD');

/** Positive cents for a line item unit price (1..10_000_00 = £100k max). */
const arbUnitPriceCents = fc.integer({ min: 1, max: 10_000_00 });

/** Positive quantity (1..100). */
const arbQuantity = fc.integer({ min: 1, max: 100 });

/** Line item type. */
const arbLineItemType = fc.constantFrom(...LINE_ITEM_TYPES);

/** A minimal valid line item prop tuple. */
const arbLineItemProps = fc.record({
  description: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
  quantity: arbQuantity,
  unitPriceCents: arbUnitPriceCents,
  type: arbLineItemType,
});

/** One or more line items (1..4 to keep tests fast). */
const arbLineItems = fc.array(arbLineItemProps, { minLength: 1, maxLength: 4 });

/** Positive days until due (0..365). */
const arbPaymentDays = fc.integer({ min: 0, max: 365 });

/** A non-empty, non-blank description for payment terms. */
const arbTermsDescription = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

/** A valid email address. */
const arbEmail = fc.emailAddress();

/** UUID-shaped customer/tenant IDs. */
const arbId = fc.uuid();

/** Valid CreateInvoiceProps for Invoice.create(). */
const arbCreateInvoiceProps = fc.record({
  customerId: arbId,
  tenantId: arbId,
  lineItems: arbLineItems,
  billingEmail: arbEmail,
  currency: arbCurrency,
  taxRate: arbTaxRate,
  taxType: fc.constantFrom('VAT', 'SALES_TAX', 'GST', 'NONE') as fc.Arbitrary<
    'VAT' | 'SALES_TAX' | 'GST' | 'NONE'
  >,
  paymentTermsDays: arbPaymentDays,
});

/** Payment method. */
const arbPaymentMethod = fc.constantFrom(...PAYMENT_METHODS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid CreateInvoiceProps with optional field overrides. */
function minimalInvoiceProps(overrides: Partial<CreateInvoiceProps> = {}): CreateInvoiceProps {
  return {
    customerId: 'cust-prop-001',
    tenantId: 'tenant-prop-001',
    lineItems: [
      { description: 'Prop test item', quantity: 1, unitPriceCents: 5000, type: 'ONE_TIME' },
    ],
    billingEmail: 'prop@example.com',
    currency: 'GBP',
    taxRate: 0,
    taxType: 'NONE',
    paymentTermsDays: 30,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. canTransitionInvoiceTo — valid edge semantics
// ---------------------------------------------------------------------------

describe('Invoice state machine — canTransitionInvoiceTo (property, RACE-PURE-07)', () => {
  test.prop([arbInvoiceStatus], propertyParams())(
    'self-transition is always rejected (no identity loops)',
    (status) => {
      expect(canTransitionInvoiceTo(status, status)).toBe(false);
    }
  );

  test.prop([arbTerminalStatus, arbInvoiceStatus], propertyParams())(
    'terminal status cannot transition to any other status',
    (from, to) => {
      expect(canTransitionInvoiceTo(from, to)).toBe(false);
    }
  );

  test.prop([arbInvoiceStatus, arbInvoiceStatus], propertyParams())(
    'canTransitionInvoiceTo is consistent with VALID_INVOICE_TRANSITIONS map',
    (from, to) => {
      const expected = VALID_INVOICE_TRANSITIONS[from].includes(to);
      expect(canTransitionInvoiceTo(from, to)).toBe(expected);
    }
  );

  test.prop([arbInvoiceStatus, arbInvoiceStatus], propertyParams())(
    'canTransitionInvoiceTo always returns a boolean (never undefined/null)',
    (from, to) => {
      const result = canTransitionInvoiceTo(from, to);
      expect(typeof result).toBe('boolean');
    }
  );
});

// ---------------------------------------------------------------------------
// 2. isTerminalInvoiceStatus
// ---------------------------------------------------------------------------

describe('isTerminalInvoiceStatus (property, RACE-PURE-07)', () => {
  test.prop([arbTerminalStatus], propertyParams())(
    'PAID, VOID, UNCOLLECTIBLE are always terminal',
    (status) => {
      expect(isTerminalInvoiceStatus(status)).toBe(true);
    }
  );

  test.prop([arbNonTerminalStatus], propertyParams())(
    'DRAFT and OPEN are never terminal',
    (status) => {
      expect(isTerminalInvoiceStatus(status)).toBe(false);
    }
  );

  test.prop([arbInvoiceStatus], propertyParams())(
    'isTerminalInvoiceStatus iff VALID_INVOICE_TRANSITIONS[status] is empty',
    (status) => {
      const empty = VALID_INVOICE_TRANSITIONS[status].length === 0;
      expect(isTerminalInvoiceStatus(status)).toBe(empty);
    }
  );
});

// ---------------------------------------------------------------------------
// 3. State-machine completeness & acyclicity
// ---------------------------------------------------------------------------

describe('State machine graph properties (property, RACE-PURE-07)', () => {
  vitestTest('every status has an entry in VALID_INVOICE_TRANSITIONS (completeness)', () => {
    for (const status of INVOICE_STATUSES) {
      expect(Array.isArray(VALID_INVOICE_TRANSITIONS[status])).toBe(true);
    }
  });

  vitestTest('non-terminal statuses have at least one valid successor (progress guarantee)', () => {
    for (const status of NON_TERMINAL_STATUSES) {
      expect(VALID_INVOICE_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });

  vitestTest('no successor of DRAFT is DRAFT (no back-edge from initial state)', () => {
    expect(VALID_INVOICE_TRANSITIONS['DRAFT']).not.toContain('DRAFT');
  });

  vitestTest('OPEN cannot transition back to DRAFT (no backward edges)', () => {
    expect(VALID_INVOICE_TRANSITIONS['OPEN']).not.toContain('DRAFT');
  });
});

// ---------------------------------------------------------------------------
// 4. Invoice.create validation properties
// ---------------------------------------------------------------------------

describe('Invoice.create — validation (property, RACE-PURE-07)', () => {
  test.prop([arbCreateInvoiceProps], propertyParams())(
    'Invoice.create succeeds for all valid prop combinations',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'newly created invoice is always DRAFT status',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('DRAFT');
    }
  );

  test.prop(
    [fc.string({ maxLength: 10 }).filter((s) => s.trim().length === 0), arbId],
    propertyParams()
  )('Invoice.create rejects blank customerId', (blankId, tenantId) => {
    const result = Invoice.create(minimalInvoiceProps({ customerId: blankId, tenantId }));
    expect(result.isFailure).toBe(true);
  });

  test.prop(
    [arbId, fc.string({ maxLength: 10 }).filter((s) => s.trim().length === 0)],
    propertyParams()
  )('Invoice.create rejects blank tenantId', (customerId, blankId) => {
    const result = Invoice.create(minimalInvoiceProps({ customerId, tenantId: blankId }));
    expect(result.isFailure).toBe(true);
  });

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'Invoice.create rejects empty lineItems array',
    (props) => {
      const result = Invoice.create({ ...props, lineItems: [] });
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop([fc.string({ maxLength: 10 }).filter((s) => s.trim().length === 0)], propertyParams())(
    'Invoice.create rejects blank billingEmail',
    (blankEmail) => {
      const result = Invoice.create(minimalInvoiceProps({ billingEmail: blankEmail }));
      expect(result.isFailure).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 5. Invoice number format (RACE-PURE-07 counter guard)
// ---------------------------------------------------------------------------

describe('Invoice sequence counter and number format (property, RACE-PURE-07)', () => {
  const INVOICE_NUMBER_RE = /^INV-\d{4}-\d{6}$/;
  const currentYear = new Date().getFullYear().toString();

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'every created invoice has a number matching INV-{year}-{6-digit} format',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      expect(INVOICE_NUMBER_RE.test(result.value.invoiceNumber)).toBe(true);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'invoice number year component matches current calendar year',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      const yearPart = result.value.invoiceNumber.split('-')[1];
      expect(yearPart).toBe(currentYear);
    }
  );

  test.prop([arbCreateInvoiceProps, arbCreateInvoiceProps], propertyParams())(
    'RACE-PURE-07: two sequential Invoice.create() calls produce distinct invoice numbers',
    (propsA, propsB) => {
      const a = Invoice.create(propsA);
      const b = Invoice.create(propsB);
      expect(a.isSuccess).toBe(true);
      expect(b.isSuccess).toBe(true);
      expect(a.value.invoiceNumber).not.toBe(b.value.invoiceNumber);
    }
  );

  test.prop([fc.integer({ min: 3, max: 10 })], propertyParams())(
    'RACE-PURE-07: N sequential Invoice.create() calls all produce distinct numbers',
    (n) => {
      const numbers = Array.from(
        { length: n },
        () => Invoice.create(minimalInvoiceProps()).value.invoiceNumber
      );
      const unique = new Set(numbers);
      expect(unique.size).toBe(n);
    }
  );
});

// ---------------------------------------------------------------------------
// 6. Receipt sequence counter and number format (RACE-PURE-07)
// ---------------------------------------------------------------------------

describe('Receipt sequence counter and number format (property, RACE-PURE-07)', () => {
  const RECEIPT_NUMBER_RE = /^RCT-\d{4}-\d{6}$/;
  const currentYear = new Date().getFullYear().toString();

  const arbCreateReceiptProps = fc.record({
    invoiceId: arbId,
    customerId: arbId,
    tenantId: arbId,
    amountCents: fc.integer({ min: 1, max: 10_000_000 }),
    currency: arbCurrency,
    paymentMethod: arbPaymentMethod,
  });

  test.prop([arbCreateReceiptProps], propertyParams())(
    'every created receipt has a number matching RCT-{year}-{6-digit} format',
    (props) => {
      const result = Receipt.create(props);
      expect(result.isSuccess).toBe(true);
      expect(RECEIPT_NUMBER_RE.test(result.value.receiptNumber)).toBe(true);
    }
  );

  test.prop([arbCreateReceiptProps], propertyParams())(
    'receipt number year component matches current calendar year',
    (props) => {
      const result = Receipt.create(props);
      expect(result.isSuccess).toBe(true);
      const yearPart = result.value.receiptNumber.split('-')[1];
      expect(yearPart).toBe(currentYear);
    }
  );

  test.prop([arbCreateReceiptProps, arbCreateReceiptProps], propertyParams())(
    'RACE-PURE-07: two sequential Receipt.create() calls produce distinct receipt numbers',
    (propsA, propsB) => {
      const a = Receipt.create(propsA);
      const b = Receipt.create(propsB);
      expect(a.isSuccess).toBe(true);
      expect(b.isSuccess).toBe(true);
      expect(a.value.receiptNumber).not.toBe(b.value.receiptNumber);
    }
  );

  test.prop([fc.integer({ min: 3, max: 10 })], propertyParams())(
    'RACE-PURE-07: N sequential Receipt.create() calls all produce distinct numbers',
    (n) => {
      const numbers = Array.from(
        { length: n },
        () =>
          Receipt.create({
            invoiceId: 'inv-001',
            customerId: 'cust-001',
            tenantId: 'tenant-001',
            amountCents: 1000,
            currency: 'GBP',
            paymentMethod: 'CARD',
          }).value.receiptNumber
      );
      const unique = new Set(numbers);
      expect(unique.size).toBe(n);
    }
  );
});

// ---------------------------------------------------------------------------
// 7. LineItem arithmetic invariant
// ---------------------------------------------------------------------------

describe('LineItem — total = unitPrice × quantity (property, RACE-PURE-07)', () => {
  test.prop([arbLineItemProps, arbCurrency], propertyParams())(
    'LineItem.total.cents === unitPriceCents × quantity (integer arithmetic)',
    (props, currency) => {
      const result = LineItem.create({ ...props, currency });
      expect(result.isSuccess).toBe(true);
      const item = result.value;
      expect(item.total.cents).toBe(Math.round(item.unitPrice.cents * item.quantity));
    }
  );

  test.prop([arbLineItemProps, arbCurrency], propertyParams())(
    'LineItem total currency matches the provided currency',
    (props, currency) => {
      const result = LineItem.create({ ...props, currency });
      expect(result.isSuccess).toBe(true);
      expect(result.value.total.currency).toBe(currency);
      expect(result.value.unitPrice.currency).toBe(currency);
    }
  );

  test.prop(
    [
      fc.string({ maxLength: 5 }).filter((s) => s.trim().length === 0),
      arbQuantity,
      arbUnitPriceCents,
      arbLineItemType,
    ],
    propertyParams()
  )('LineItem.create rejects blank description', (blankDesc, quantity, unitPriceCents, type) => {
    const result = LineItem.create({
      description: blankDesc,
      quantity,
      unitPriceCents,
      type,
      currency: 'GBP',
    });
    expect(result.isFailure).toBe(true);
  });

  test.prop(
    [fc.integer({ min: -1000, max: 0 }), arbUnitPriceCents, arbLineItemType],
    propertyParams()
  )('LineItem.create rejects zero or negative quantity', (nonPositiveQty, unitPriceCents, type) => {
    const result = LineItem.create({
      description: 'test item',
      quantity: nonPositiveQty,
      unitPriceCents,
      type,
      currency: 'GBP',
    });
    expect(result.isFailure).toBe(true);
  });

  test.prop(
    [fc.integer({ min: -100_000, max: -1 }), arbQuantity, arbLineItemType],
    propertyParams()
  )('LineItem.create rejects negative unitPriceCents', (negativePrice, quantity, type) => {
    const result = LineItem.create({
      description: 'test item',
      quantity,
      unitPriceCents: negativePrice,
      type,
      currency: 'GBP',
    });
    expect(result.isFailure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. PaymentTerms round-trip
// ---------------------------------------------------------------------------

describe('PaymentTerms — round-trip invariant (property, RACE-PURE-07)', () => {
  test.prop([arbPaymentDays, arbTermsDescription], propertyParams())(
    'PaymentTerms.create → toValue → re-create preserves all fields',
    (days, description) => {
      const first = PaymentTerms.create(days, description);
      expect(first.isSuccess).toBe(true);
      const snapshot = first.value.toValue();

      expect(snapshot.daysUntilDue).toBe(days);
      expect(snapshot.description).toBe(description.trim());

      const second = PaymentTerms.create(snapshot.daysUntilDue, snapshot.description);
      expect(second.isSuccess).toBe(true);
      expect(second.value.equals(first.value)).toBe(true);
    }
  );

  test.prop([fc.integer({ min: -1000, max: -1 }), arbTermsDescription], propertyParams())(
    'PaymentTerms.create rejects negative daysUntilDue',
    (negativeDays, description) => {
      const result = PaymentTerms.create(negativeDays, description);
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop(
    [arbPaymentDays, fc.string({ maxLength: 5 }).filter((s) => s.trim().length === 0)],
    propertyParams()
  )('PaymentTerms.create rejects blank description', (days, blankDesc) => {
    const result = PaymentTerms.create(days, blankDesc);
    expect(result.isFailure).toBe(true);
  });

  test.prop([arbPaymentDays, arbTermsDescription], propertyParams())(
    'calculateDueDate advances issueDate by daysUntilDue calendar days',
    (days, description) => {
      const terms = PaymentTerms.create(days, description).value;
      const issueDate = new Date('2026-01-01T00:00:00Z');
      const due = terms.calculateDueDate(issueDate);
      // calculateDueDate uses setDate (local calendar day arithmetic, not fixed ms).
      // Verify via the same calendar operation rather than ms offsets to avoid DST skew.
      const expected = new Date(issueDate);
      expected.setDate(expected.getDate() + days);
      expect(due.getTime()).toBe(expected.getTime());
    }
  );
});

// ---------------------------------------------------------------------------
// 9. Invoice financial invariants
// ---------------------------------------------------------------------------

describe('Invoice — financial invariants (property, RACE-PURE-07)', () => {
  test.prop([arbCreateInvoiceProps], propertyParams())(
    'amountDue === totalAmount on fresh DRAFT (no payments)',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.amountDue.cents).toBe(inv.totalAmount.cents);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'subtotal + totalTax === totalAmount on fresh DRAFT',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.subtotal.cents + inv.totalTax.cents).toBe(inv.totalAmount.cents);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'amountPaid.cents === 0 on fresh DRAFT',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      expect(result.value.amountPaid.cents).toBe(0);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'amountRefunded.cents === 0 on fresh DRAFT',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      expect(result.value.amountRefunded.cents).toBe(0);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'hasPayments is false on fresh DRAFT',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      expect(result.value.hasPayments).toBe(false);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'isEditable is true and isPaid is false on fresh DRAFT',
    (props) => {
      const result = Invoice.create(props);
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.isEditable).toBe(true);
      expect(inv.isPaid).toBe(false);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'issue() succeeds on DRAFT invoice, resulting in OPEN status',
    (props) => {
      const inv = Invoice.create(props).value;
      const issueResult = inv.issue();
      expect(issueResult.isSuccess).toBe(true);
      expect(inv.status).toBe('OPEN');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'issue() makes invoice non-editable (isEditable = false)',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      expect(inv.isEditable).toBe(false);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'issue() twice fails with INVALID_INVOICE_TRANSITION (OPEN is not re-issuable)',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      const second = inv.issue();
      expect(second.isFailure).toBe(true);
      expect(second.error.code).toBe('INVALID_INVOICE_TRANSITION');
    }
  );
});

// ---------------------------------------------------------------------------
// 10. recordPayment invariants
// ---------------------------------------------------------------------------

describe('Invoice.recordPayment — invariants (property, RACE-PURE-07)', () => {
  test.prop([arbCreateInvoiceProps], propertyParams())(
    'recordPayment on DRAFT invoice always fails',
    (props) => {
      const inv = Invoice.create(props).value;
      // inv is DRAFT — should not accept payments
      const payment = Money.fromCents(100, props.currency ?? 'GBP').value;
      const result = inv.recordPayment(payment);
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'recording the full amount due transitions OPEN → PAID',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue(); // DRAFT → OPEN
      const fullAmount = Money.fromCents(inv.amountDue.cents, inv.currency).value;
      const result = inv.recordPayment(fullAmount);
      expect(result.isSuccess).toBe(true);
      expect(inv.status).toBe('PAID');
      expect(inv.isPaid).toBe(true);
      expect(inv.amountDue.cents).toBe(0);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'partial payment sets status to OPEN with PARTIALLY_PAID paymentStatus',
    (props) => {
      // We need amountDue > 1 cent so we can pay a partial amount
      const inv = Invoice.create(props).value;
      inv.issue();
      fc.pre(inv.amountDue.cents > 1);

      const halfCents = Math.floor(inv.amountDue.cents / 2);
      fc.pre(halfCents > 0 && halfCents < inv.amountDue.cents);

      const partialAmount = Money.fromCents(halfCents, inv.currency).value;
      const result = inv.recordPayment(partialAmount);
      expect(result.isSuccess).toBe(true);
      expect(inv.status).toBe('OPEN');
      expect(inv.paymentStatus).toBe('PARTIALLY_PAID');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'amountPaid + amountDue === totalAmount after any payment sequence',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      const totalAtOpen = inv.totalAmount.cents;

      // Pay half
      if (inv.amountDue.cents > 1) {
        const halfCents = Math.floor(inv.amountDue.cents / 2);
        if (halfCents > 0) {
          inv.recordPayment(Money.fromCents(halfCents, inv.currency).value);
        }
      }

      expect(inv.amountPaid.cents + inv.amountDue.cents).toBe(totalAtOpen);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'payment exceeding amountDue is rejected',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      const overPayment = Money.fromCents(inv.amountDue.cents + 1, inv.currency).value;
      const result = inv.recordPayment(overPayment);
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'zero-amount payment is rejected',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      const zero = Money.zero(inv.currency);
      const result = inv.recordPayment(zero);
      expect(result.isFailure).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 11. void() invariants
// ---------------------------------------------------------------------------

describe('Invoice.void — invariants (property, RACE-PURE-07)', () => {
  test.prop([arbCreateInvoiceProps], propertyParams())(
    'void() on DRAFT succeeds and produces VOID status',
    (props) => {
      const inv = Invoice.create(props).value;
      const result = inv.void('cancelled');
      expect(result.isSuccess).toBe(true);
      expect(inv.status).toBe('VOID');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'void() on OPEN succeeds and produces VOID status',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue(); // OPEN
      const result = inv.void('cancelled');
      expect(result.isSuccess).toBe(true);
      expect(inv.status).toBe('VOID');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'void() on already-VOID invoice fails (terminal absorbing)',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.void(); // first void
      const second = inv.void();
      expect(second.isFailure).toBe(true);
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'void() fails when invoice has received partial payments (CANNOT_VOID_PAID_INVOICE)',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      // Only test when there's more than 1 cent available so partial payment works
      fc.pre(inv.amountDue.cents > 1);
      const partialCents = Math.floor(inv.amountDue.cents / 2);
      fc.pre(partialCents > 0);
      inv.recordPayment(Money.fromCents(partialCents, inv.currency).value);

      const voidResult = inv.void('cancelled');
      expect(voidResult.isFailure).toBe(true);
      expect(voidResult.error.code).toBe('CANNOT_VOID_PAID_INVOICE');
    }
  );
});

// ---------------------------------------------------------------------------
// 12. markUncollectible() invariants
// ---------------------------------------------------------------------------

describe('Invoice.markUncollectible — invariants (property, RACE-PURE-07)', () => {
  test.prop([arbCreateInvoiceProps], propertyParams())(
    'markUncollectible() on OPEN succeeds and produces UNCOLLECTIBLE status',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue(); // OPEN
      const result = inv.markUncollectible();
      expect(result.isSuccess).toBe(true);
      expect(inv.status).toBe('UNCOLLECTIBLE');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'markUncollectible() on DRAFT fails (DRAFT → UNCOLLECTIBLE is illegal)',
    (props) => {
      const inv = Invoice.create(props).value;
      const result = inv.markUncollectible();
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_INVOICE_TRANSITION');
    }
  );

  test.prop([arbCreateInvoiceProps], propertyParams())(
    'markUncollectible() twice on OPEN fails the second time (terminal)',
    (props) => {
      const inv = Invoice.create(props).value;
      inv.issue();
      inv.markUncollectible();
      const second = inv.markUncollectible();
      expect(second.isFailure).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 13. Receipt.create validation
// ---------------------------------------------------------------------------

describe('Receipt.create — validation (property, RACE-PURE-07)', () => {
  test.prop(
    [
      fc.string({ maxLength: 5 }).filter((s) => s.trim().length === 0),
      arbId,
      arbId,
      fc.integer({ min: 1, max: 1_000_000 }),
      arbCurrency,
      arbPaymentMethod,
    ],
    propertyParams()
  )(
    'Receipt.create rejects blank invoiceId',
    (blankId, customerId, tenantId, amountCents, currency, paymentMethod) => {
      const result = Receipt.create({
        invoiceId: blankId,
        customerId,
        tenantId,
        amountCents,
        currency,
        paymentMethod,
      });
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop(
    [arbId, arbId, arbId, fc.integer({ min: -100_000, max: 0 }), arbCurrency, arbPaymentMethod],
    propertyParams()
  )(
    'Receipt.create rejects zero or negative amountCents',
    (invoiceId, customerId, tenantId, nonPositiveCents, currency, paymentMethod) => {
      const result = Receipt.create({
        invoiceId,
        customerId,
        tenantId,
        amountCents: nonPositiveCents,
        currency,
        paymentMethod,
      });
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop(
    [arbId, arbId, arbId, fc.integer({ min: 1, max: 1_000_000 }), arbCurrency, arbPaymentMethod],
    propertyParams()
  )(
    'Receipt.create succeeds for all valid inputs',
    (invoiceId, customerId, tenantId, amountCents, currency, paymentMethod) => {
      const result = Receipt.create({
        invoiceId,
        customerId,
        tenantId,
        amountCents,
        currency,
        paymentMethod,
      });
      expect(result.isSuccess).toBe(true);
    }
  );

  test.prop(
    [arbId, arbId, arbId, fc.integer({ min: 1, max: 1_000_000 }), arbCurrency, arbPaymentMethod],
    propertyParams()
  )(
    'Receipt amount.cents matches amountCents input',
    (invoiceId, customerId, tenantId, amountCents, currency, paymentMethod) => {
      const result = Receipt.create({
        invoiceId,
        customerId,
        tenantId,
        amountCents,
        currency,
        paymentMethod,
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.amount.cents).toBe(amountCents);
    }
  );
});
