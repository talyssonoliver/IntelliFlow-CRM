/**
 * Property tests for the `Invoice` aggregate — line-item arithmetic, pay/refund
 * accounting invariant, and recalculateTotals correctness.
 *
 * Property ids sourced from:
 *   docs/operations/property-testing/race-condition-findings.json
 *
 *   RACE-PURE-04  Invoice.recalculateTotals silently skips failures, leaving
 *                 totals stale after a failed add/subtract.
 *
 *   RACE-PURE-06  No property test for the accounting invariant
 *                 amountDue + amountPaid - amountRefunded === totalAmount across
 *                 arbitrary pay/refund sequences.
 *
 *   RACE-PURE-M3  recordPayment does not update paymentStatus correctly after
 *                 partial payment on a previously-refunded OPEN invoice.
 *
 * @see packages/domain/src/crm/billing/Invoice.ts
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Invoice,
  Money,
  type CreateInvoiceProps,
  type CreateLineItemProps,
  LINE_ITEM_TYPES,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Helpers / inline arbitraries
// ---------------------------------------------------------------------------

/**
 * The only currency used throughout so that all Money operations share the same
 * currency and don't fail on currency-mismatch guards.
 */
const CURRENCY = 'GBP';

/** A single valid line-item prop record. */
const arbLineItemProps: fc.Arbitrary<CreateLineItemProps> = fc.record({
  description: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  quantity: fc.integer({ min: 1, max: 100 }),
  unitPriceCents: fc.integer({ min: 0, max: 100_000 }),
  currency: fc.constant(CURRENCY),
  type: fc.constantFrom(...LINE_ITEM_TYPES),
});

/** A non-empty array of line-item props (1–6 items). */
const arbLineItemsArray: fc.Arbitrary<CreateLineItemProps[]> = fc.array(arbLineItemProps, {
  minLength: 1,
  maxLength: 6,
});

/** Minimal valid CreateInvoiceProps with a fixed 0 % tax rate. */
function makeCreateProps(lineItems: CreateLineItemProps[], taxRate = 0): CreateInvoiceProps {
  const now = new Date(2026, 0, 1);
  return {
    customerId: 'cust-001',
    tenantId: 'tenant-001',
    lineItems,
    billingEmail: 'billing@example.com',
    currency: CURRENCY,
    taxRate,
    taxType: 'VAT',
    issueDate: now,
    dueDate: new Date(2026, 1, 1),
  };
}

/**
 * Build and unconditionally return a freshly created + issued Invoice.
 * Tests that rely on an OPEN invoice use this helper.
 */
function buildOpenInvoice(lineItems: CreateLineItemProps[], taxRate = 0): Invoice {
  const result = Invoice.create(makeCreateProps(lineItems, taxRate));
  if (result.isFailure) {
    throw new Error(`Invoice.create failed: ${result.error.message}`);
  }
  const inv = result.value;
  const issueResult = inv.issue();
  if (issueResult.isFailure) {
    throw new Error(`Invoice.issue failed: ${issueResult.error.message}`);
  }
  return inv;
}

/** Build a Money value of given cents in the shared currency. */
function money(cents: number): Money {
  const result = Money.fromCents(cents, CURRENCY);
  if (result.isFailure) {
    throw new Error(`Money.fromCents(${cents}) failed: ${result.error.message}`);
  }
  return result.value;
}

/** Compute expected subtotal cents from raw props (zero-tax path only). */
function expectedSubtotalCents(items: CreateLineItemProps[]): number {
  return items.reduce((sum, item) => sum + Math.round(item.unitPriceCents * item.quantity), 0);
}

/**
 * Assert the core accounting invariant on `inv`.
 * Business rule (RACE-PURE-06):
 *   amountDue.cents + amountPaid.cents - amountRefunded.cents === totalAmount.cents
 */
function assertAccountingInvariant(inv: Invoice): void {
  const lhs = inv.amountDue.cents + inv.amountPaid.cents - inv.amountRefunded.cents;
  expect(lhs).toBe(inv.totalAmount.cents);
}

// ---------------------------------------------------------------------------
// Suite 1 — Invoice creation: validation + totals (RACE-PURE-04 preconditions)
// ---------------------------------------------------------------------------

describe('Invoice.create — validation and initial totals (RACE-PURE-04)', () => {
  test.prop([arbLineItemsArray], propertyParams())(
    'create succeeds for any valid line-item array and starts as DRAFT/PENDING',
    (items) => {
      const result = Invoice.create(makeCreateProps(items));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.status).toBe('DRAFT');
      expect(inv.paymentStatus).toBe('PENDING');
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'initial subtotal equals sum(quantity * unitPriceCents) for 0 % tax',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      const expected = expectedSubtotalCents(items);
      expect(inv.subtotal.cents).toBe(expected);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'totalAmount === subtotal when taxRate === 0',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.totalAmount.cents).toBe(inv.subtotal.cents);
      expect(inv.totalTax.cents).toBe(0);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'initial amountDue equals totalAmount, amountPaid and amountRefunded are zero',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.amountPaid.cents).toBe(0);
      expect(inv.amountRefunded.cents).toBe(0);
      expect(inv.amountDue.cents).toBe(inv.totalAmount.cents);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'accounting invariant holds on freshly created invoice',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      assertAccountingInvariant(result.value);
    }
  );

  it('create fails when customerId is blank', () => {
    const result = Invoice.create({
      ...makeCreateProps([
        {
          description: 'item',
          quantity: 1,
          unitPriceCents: 100,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]),
      customerId: '   ',
    });
    expect(result.isFailure).toBe(true);
  });

  it('create fails when line items array is empty', () => {
    const result = Invoice.create({ ...makeCreateProps([]), lineItems: [] });
    expect(result.isFailure).toBe(true);
  });

  it('create fails when billingEmail is blank', () => {
    const result = Invoice.create({
      ...makeCreateProps([
        {
          description: 'item',
          quantity: 1,
          unitPriceCents: 100,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]),
      billingEmail: '',
    });
    expect(result.isFailure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — recalculateTotals after addLineItem / removeLineItem (RACE-PURE-04)
// ---------------------------------------------------------------------------

describe('Invoice — recalculateTotals invariant after mutations (RACE-PURE-04)', () => {
  test.prop([arbLineItemsArray, arbLineItemProps], propertyParams())(
    'addLineItem: totalAmount reflects all line items (subtotal + 0 % tax)',
    (initialItems, newItem) => {
      const result = Invoice.create(makeCreateProps(initialItems, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;

      const addResult = inv.addLineItem({ ...newItem, currency: CURRENCY });
      expect(addResult.isSuccess).toBe(true);

      const allItems = [...initialItems, newItem];
      const expected = expectedSubtotalCents(allItems);
      expect(inv.subtotal.cents).toBe(expected);
      expect(inv.totalAmount.cents).toBe(expected);
      expect(inv.amountDue.cents).toBe(expected);
    }
  );

  test.prop([arbLineItemsArray, arbLineItemProps], propertyParams())(
    'addLineItem: accounting invariant holds after add',
    (initialItems, newItem) => {
      const result = Invoice.create(makeCreateProps(initialItems, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;

      const addResult = inv.addLineItem({ ...newItem, currency: CURRENCY });
      expect(addResult.isSuccess).toBe(true);
      assertAccountingInvariant(inv);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'removeLineItem(0): totalAmount reflects remaining items',
    (items) => {
      // Need at least 2 items so removing one still leaves a non-empty invoice.
      fc.pre(items.length >= 2);

      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;

      const removeResult = inv.removeLineItem(0);
      expect(removeResult.isSuccess).toBe(true);

      const remaining = items.slice(1);
      const expected = expectedSubtotalCents(remaining);
      expect(inv.subtotal.cents).toBe(expected);
      expect(inv.totalAmount.cents).toBe(expected);
      expect(inv.amountDue.cents).toBe(expected);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'removeLineItem: accounting invariant holds after remove',
    (items) => {
      fc.pre(items.length >= 2);

      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      inv.removeLineItem(0);
      assertAccountingInvariant(inv);
    }
  );

  test.prop([arbLineItemsArray, arbLineItemProps], propertyParams())(
    'add-then-remove-last is idempotent: totals return to original (RACE-PURE-04 roundtrip)',
    (initialItems, newItem) => {
      const result = Invoice.create(makeCreateProps(initialItems, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;

      const originalSubtotal = inv.subtotal.cents;
      const originalTotal = inv.totalAmount.cents;

      const addResult = inv.addLineItem({ ...newItem, currency: CURRENCY });
      expect(addResult.isSuccess).toBe(true);

      // Remove the item we just added (it's at the last index).
      const lastIndex = inv.lineItems.length - 1;
      const removeResult = inv.removeLineItem(lastIndex);
      expect(removeResult.isSuccess).toBe(true);

      expect(inv.subtotal.cents).toBe(originalSubtotal);
      expect(inv.totalAmount.cents).toBe(originalTotal);
    }
  );

  it('addLineItem fails on a non-DRAFT (OPEN) invoice', () => {
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: 500,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    const addResult = inv.addLineItem({
      description: 'extra',
      quantity: 1,
      unitPriceCents: 100,
      currency: CURRENCY,
      type: 'ONE_TIME',
    });
    expect(addResult.isFailure).toBe(true);
  });

  it('removeLineItem fails with an out-of-bounds index', () => {
    const result = Invoice.create(
      makeCreateProps(
        [
          {
            description: 'item',
            quantity: 1,
            unitPriceCents: 100,
            currency: CURRENCY,
            type: 'ONE_TIME',
          },
        ],
        0
      )
    );
    expect(result.isSuccess).toBe(true);
    const inv = result.value;
    const removeResult = inv.removeLineItem(99);
    expect(removeResult.isFailure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Accounting invariant: amountDue + amountPaid - amountRefunded
//           === totalAmount at every step (RACE-PURE-06)
//
// Business rule from the findings:
//   amountDue.cents + amountPaid.cents - amountRefunded.cents === totalAmount.cents
// ---------------------------------------------------------------------------

describe('Invoice — accounting invariant across pay/refund sequences (RACE-PURE-06)', () => {
  test.prop([fc.integer({ min: 100, max: 100_000 })], propertyParams())(
    'invariant holds after a single full payment',
    (totalCents) => {
      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      assertAccountingInvariant(inv);

      const payResult = inv.recordPayment(inv.totalAmount);
      expect(payResult.isSuccess).toBe(true);
      assertAccountingInvariant(inv);
      expect(inv.status).toBe('PAID');
      expect(inv.amountDue.cents).toBe(0);
    }
  );

  test.prop(
    [fc.integer({ min: 200, max: 100_000 }), fc.integer({ min: 1, max: 99 })],
    propertyParams()
  )('invariant holds after a partial payment', (totalCents, partialPct) => {
    const partialCents = Math.floor((totalCents * partialPct) / 100);
    fc.pre(partialCents > 0 && partialCents < totalCents);

    const inv = buildOpenInvoice([
      {
        description: 'service',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);

    assertAccountingInvariant(inv);

    const payResult = inv.recordPayment(money(partialCents));
    expect(payResult.isSuccess).toBe(true);
    assertAccountingInvariant(inv);
    expect(inv.paymentStatus).toBe('PARTIALLY_PAID');
  });

  test.prop(
    [fc.integer({ min: 200, max: 50_000 }), fc.integer({ min: 1, max: 99 })],
    propertyParams()
  )('invariant holds after full payment then partial refund', (totalCents, refundPct) => {
    const refundCents = Math.floor((totalCents * refundPct) / 100);
    fc.pre(refundCents > 0 && refundCents < totalCents);

    const inv = buildOpenInvoice([
      {
        description: 'service',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);

    assertAccountingInvariant(inv);

    const payResult = inv.recordPayment(inv.totalAmount);
    expect(payResult.isSuccess).toBe(true);
    assertAccountingInvariant(inv);

    const refundResult = inv.processRefund(money(refundCents), 'CUSTOMER_REQUEST');
    expect(refundResult.isSuccess).toBe(true);
    assertAccountingInvariant(inv);

    expect(inv.amountRefunded.cents).toBe(refundCents);
    expect(inv.status).toBe('OPEN'); // reverted because amountDue > 0
  });

  test.prop([fc.integer({ min: 200, max: 50_000 })], propertyParams())(
    'invariant holds after full payment then full refund',
    (totalCents) => {
      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      assertAccountingInvariant(inv);

      const payResult = inv.recordPayment(inv.totalAmount);
      expect(payResult.isSuccess).toBe(true);
      assertAccountingInvariant(inv);

      const refundResult = inv.processRefund(money(totalCents), 'DUPLICATE_PAYMENT');
      expect(refundResult.isSuccess).toBe(true);
      assertAccountingInvariant(inv);

      expect(inv.amountRefunded.cents).toBe(totalCents);
      expect(inv.amountDue.cents).toBe(totalCents);
      expect(inv.paymentStatus).toBe('REFUNDED');
    }
  );

  test.prop(
    [fc.integer({ min: 500, max: 50_000 }), fc.integer({ min: 1, max: 49 })],
    propertyParams()
  )(
    'invariant holds across multi-step: partial pay → partial refund → pay remainder',
    (totalCents, firstPct) => {
      const firstPayCents = Math.floor((totalCents * firstPct) / 100);
      fc.pre(firstPayCents > 0 && firstPayCents < totalCents);

      const refundCents = Math.floor(firstPayCents / 2);
      fc.pre(refundCents > 0);

      // After refund, amountDue = (totalCents - firstPayCents) + refundCents
      const secondPayCents = totalCents - firstPayCents + refundCents;
      fc.pre(secondPayCents > 0 && secondPayCents <= totalCents);

      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      assertAccountingInvariant(inv);

      const pay1 = inv.recordPayment(money(firstPayCents));
      expect(pay1.isSuccess).toBe(true);
      assertAccountingInvariant(inv);

      const refund = inv.processRefund(money(refundCents), 'BILLING_ERROR');
      expect(refund.isSuccess).toBe(true);
      assertAccountingInvariant(inv);

      // amountDue after refund = (totalCents - firstPayCents) + refundCents
      expect(inv.amountDue.cents).toBe(secondPayCents);

      const pay2 = inv.recordPayment(money(secondPayCents));
      expect(pay2.isSuccess).toBe(true);
      assertAccountingInvariant(inv);
    }
  );

  test.prop(
    [
      fc.integer({ min: 100, max: 50_000 }),
      fc.array(
        fc.record({
          type: fc.constantFrom('pay' as const, 'refund' as const),
          pct: fc.integer({ min: 1, max: 50 }),
        }),
        { minLength: 1, maxLength: 8 }
      ),
    ],
    propertyParams()
  )(
    'RACE-PURE-06: accounting invariant holds after any sequence of pay/refund ops',
    (totalCents, ops) => {
      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      const applyOp = (op: { type: 'pay' | 'refund'; pct: number }): void => {
        if (op.type === 'pay') {
          const amtCents = Math.floor((inv.amountDue.cents * op.pct) / 100);
          if (amtCents <= 0 || amtCents > inv.amountDue.cents) return;
          if (inv.recordPayment(money(amtCents)).isSuccess) assertAccountingInvariant(inv);
          return;
        }
        const maxRefundable = inv.amountPaid.cents - inv.amountRefunded.cents;
        if (maxRefundable <= 0) return;
        const amtCents = Math.floor((maxRefundable * op.pct) / 100);
        if (amtCents <= 0 || amtCents > maxRefundable) return;
        if (inv.processRefund(money(amtCents), 'CUSTOMER_REQUEST').isSuccess) {
          assertAccountingInvariant(inv);
        }
      };

      for (const op of ops) {
        if (inv.status !== 'OPEN') break; // skip ops that can't run
        applyOp(op);
      }

      // Final invariant check after all ops.
      assertAccountingInvariant(inv);
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 4 — paymentStatus consistency after pay/refund cycles (RACE-PURE-M3)
// ---------------------------------------------------------------------------

describe('Invoice — paymentStatus consistency after pay/refund cycles (RACE-PURE-M3)', () => {
  it('paymentStatus is REFUNDED after full pay then full refund', () => {
    const totalCents = 5000;
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);

    expect(inv.recordPayment(money(totalCents)).isSuccess).toBe(true);
    expect(inv.paymentStatus).toBe('PAID');

    expect(inv.processRefund(money(totalCents), 'CUSTOMER_REQUEST').isSuccess).toBe(true);
    expect(inv.paymentStatus).toBe('REFUNDED');
    expect(inv.status).toBe('OPEN');
    expect(inv.amountDue.cents).toBe(totalCents);
  });

  it('paymentStatus is PARTIALLY_REFUNDED after full pay then partial refund', () => {
    const totalCents = 5000;
    const refundCents = 2000;
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    inv.recordPayment(money(totalCents));
    inv.processRefund(money(refundCents), 'BILLING_ERROR');

    expect(inv.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(inv.status).toBe('OPEN');
  });

  it('paymentStatus transitions to PARTIALLY_PAID on partial repayment after refund reopen', () => {
    const totalCents = 6000;
    const refundCents = 2000;
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);

    // Step 1: full payment → PAID
    expect(inv.recordPayment(money(totalCents)).isSuccess).toBe(true);
    expect(inv.status).toBe('PAID');

    // Step 2: partial refund reverts to OPEN
    expect(inv.processRefund(money(refundCents), 'CUSTOMER_REQUEST').isSuccess).toBe(true);
    expect(inv.status).toBe('OPEN');
    expect(inv.paymentStatus).toBe('PARTIALLY_REFUNDED');

    // Step 3: partial payment (not enough to close) → PARTIALLY_PAID
    const partialRepay = Math.floor(refundCents / 2);
    expect(inv.recordPayment(money(partialRepay)).isSuccess).toBe(true);
    expect(inv.amountDue.cents).toBeGreaterThan(0);
    expect(inv.paymentStatus).toBe('PARTIALLY_PAID');
  });

  test.prop(
    [fc.integer({ min: 500, max: 50_000 }), fc.integer({ min: 1, max: 99 })],
    propertyParams()
  )(
    'RACE-PURE-M3: paymentStatus is PAID iff amountDue === 0 after any payment sequence',
    (totalCents, pctPartial) => {
      const partialCents = Math.floor((totalCents * pctPartial) / 100);
      fc.pre(partialCents > 0 && partialCents < totalCents);

      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      // Partial payment
      expect(inv.recordPayment(money(partialCents)).isSuccess).toBe(true);

      if (inv.amountDue.cents > 0) {
        expect(inv.paymentStatus).not.toBe('PAID');
        expect(inv.status).not.toBe('PAID');
      }

      // Complete the invoice by paying the remainder
      const remaining = inv.amountDue.cents;
      expect(inv.recordPayment(money(remaining)).isSuccess).toBe(true);

      expect(inv.amountDue.cents).toBe(0);
      expect(inv.paymentStatus).toBe('PAID');
      expect(inv.status).toBe('PAID');
    }
  );

  test.prop(
    [fc.integer({ min: 200, max: 50_000 }), fc.integer({ min: 1, max: 98 })],
    propertyParams()
  )(
    'RACE-PURE-M3: paymentStatus is PARTIALLY_PAID whenever amountPaid > 0 and amountDue > 0',
    (totalCents, pctPaid) => {
      const paidCents = Math.floor((totalCents * pctPaid) / 100);
      fc.pre(paidCents > 0 && paidCents < totalCents);

      const inv = buildOpenInvoice([
        {
          description: 'service',
          quantity: 1,
          unitPriceCents: totalCents,
          currency: CURRENCY,
          type: 'ONE_TIME',
        },
      ]);

      expect(inv.recordPayment(money(paidCents)).isSuccess).toBe(true);

      // After partial payment: amountPaid > 0 and amountDue > 0
      expect(inv.amountPaid.cents).toBe(paidCents);
      expect(inv.amountDue.cents).toBeGreaterThan(0);
      expect(inv.paymentStatus).toBe('PARTIALLY_PAID');
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 5 — State machine: illegal transitions are rejected
// ---------------------------------------------------------------------------

describe('Invoice — state machine rejects illegal transitions', () => {
  it('issue() fails on an already-OPEN invoice', () => {
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: 1000,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    expect(inv.issue().isFailure).toBe(true);
  });

  it('void() fails when payments exist', () => {
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: 1000,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    inv.recordPayment(money(500));
    expect(inv.void().isFailure).toBe(true);
  });

  it('void() fails on an already-VOID invoice', () => {
    const result = Invoice.create(
      makeCreateProps(
        [
          {
            description: 'item',
            quantity: 1,
            unitPriceCents: 1000,
            currency: CURRENCY,
            type: 'ONE_TIME',
          },
        ],
        0
      )
    );
    expect(result.isSuccess).toBe(true);
    const inv = result.value;
    inv.void();
    expect(inv.void().isFailure).toBe(true);
  });

  it('markUncollectible() fails on a DRAFT invoice', () => {
    const result = Invoice.create(
      makeCreateProps(
        [
          {
            description: 'item',
            quantity: 1,
            unitPriceCents: 1000,
            currency: CURRENCY,
            type: 'ONE_TIME',
          },
        ],
        0
      )
    );
    expect(result.isSuccess).toBe(true);
    expect(result.value.markUncollectible().isFailure).toBe(true);
  });

  it('processRefund fails on a DRAFT invoice', () => {
    const result = Invoice.create(
      makeCreateProps(
        [
          {
            description: 'item',
            quantity: 1,
            unitPriceCents: 1000,
            currency: CURRENCY,
            type: 'ONE_TIME',
          },
        ],
        0
      )
    );
    expect(result.isSuccess).toBe(true);
    expect(result.value.processRefund(money(100), 'CUSTOMER_REQUEST').isFailure).toBe(true);
  });

  it('recordPayment fails when amount exceeds amountDue', () => {
    const totalCents = 1000;
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: totalCents,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    expect(inv.recordPayment(money(totalCents + 1)).isFailure).toBe(true);
  });

  it('recordPayment fails with zero amount', () => {
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: 1000,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    expect(inv.recordPayment(money(0)).isFailure).toBe(true);
  });

  it('processRefund fails when refund exceeds paid amount', () => {
    const inv = buildOpenInvoice([
      {
        description: 'item',
        quantity: 1,
        unitPriceCents: 1000,
        currency: CURRENCY,
        type: 'ONE_TIME',
      },
    ]);
    inv.recordPayment(money(500));
    expect(inv.processRefund(money(600), 'CUSTOMER_REQUEST').isFailure).toBe(true);
  });

  test.prop([fc.constantFrom('VOID' as const, 'UNCOLLECTIBLE' as const)], propertyParams())(
    'terminal statuses prevent all payment mutations',
    (terminalStatus) => {
      // Build a DRAFT invoice we can transition to the terminal status directly
      const result = Invoice.create(
        makeCreateProps(
          [
            {
              description: 'item',
              quantity: 1,
              unitPriceCents: 1000,
              currency: CURRENCY,
              type: 'ONE_TIME',
            },
          ],
          0
        )
      );
      expect(result.isSuccess).toBe(true);
      const inv = result.value;

      if (terminalStatus === 'VOID') {
        const voidResult = inv.void(); // DRAFT → VOID is valid
        expect(voidResult.isSuccess).toBe(true);
        // Cannot record payment on VOID (status !== 'OPEN')
        expect(inv.recordPayment(money(100)).isFailure).toBe(true);
      } else {
        // DRAFT → UNCOLLECTIBLE is NOT valid; need OPEN first
        inv.issue();
        const ucResult = inv.markUncollectible();
        expect(ucResult.isSuccess).toBe(true);
        expect(inv.recordPayment(money(100)).isFailure).toBe(true);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 6 — toJSON serialisation idempotency (value semantics)
// ---------------------------------------------------------------------------

describe('Invoice — toJSON idempotency and field completeness', () => {
  test.prop([arbLineItemsArray], propertyParams())(
    'toJSON returns consistent shape on repeated calls',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.toJSON()).toEqual(inv.toJSON());
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'toJSON totalAmount.cents matches invoice.totalAmount.cents',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      const json = inv.toJSON() as Record<string, any>;
      expect(json.totalAmount.cents).toBe(inv.totalAmount.cents);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'toJSON line items count matches internal lineItems count',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      const json = inv.toJSON() as Record<string, any>;
      expect((json.lineItems as unknown[]).length).toBe(inv.lineItems.length);
    }
  );

  test.prop([arbLineItemsArray], propertyParams())(
    'accounting invariant fields in toJSON are consistent with live state',
    (items) => {
      const result = Invoice.create(makeCreateProps(items, 0));
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      const json = inv.toJSON() as Record<string, any>;

      // The JSON snapshot must reflect the same invariant.
      const lhs =
        (json.amountDue as { cents: number }).cents +
        (json.amountPaid as { cents: number }).cents -
        (json.amountRefunded as { cents: number }).cents;
      expect(lhs).toBe((json.totalAmount as { cents: number }).cents);
    }
  );
});
