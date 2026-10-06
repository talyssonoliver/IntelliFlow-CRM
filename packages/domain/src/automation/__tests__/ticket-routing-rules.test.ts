import { describe, it, expect } from 'vitest';
import {
  evaluateTicketRoutingConditions,
  TICKET_ROUTING_CONDITION_FIELDS,
  TICKET_ROUTING_FIELD_VALUES,
  type TicketRoutingCondition,
} from '../RoutingConstants';

const billingHigh = { ticketCategory: 'BILLING', ticketPriority: 'HIGH', slaStatus: 'AT_RISK' };

describe('evaluateTicketRoutingConditions', () => {
  it('never matches an empty condition list', () => {
    expect(evaluateTicketRoutingConditions([], billingHigh)).toBe(false);
  });

  it('matches equals and not_equals', () => {
    const equals: TicketRoutingCondition = {
      field: 'ticketCategory',
      operator: 'equals',
      value: 'BILLING',
    };
    expect(evaluateTicketRoutingConditions([equals], billingHigh)).toBe(true);
    expect(evaluateTicketRoutingConditions([{ ...equals, value: 'SALES' }], billingHigh)).toBe(
      false
    );
    expect(
      evaluateTicketRoutingConditions([{ ...equals, operator: 'not_equals' }], billingHigh)
    ).toBe(false);
    expect(
      evaluateTicketRoutingConditions(
        [{ ...equals, operator: 'not_equals', value: 'SALES' }],
        billingHigh
      )
    ).toBe(true);
  });

  it('matches in and not_in against a list only', () => {
    const inCond: TicketRoutingCondition = {
      field: 'ticketPriority',
      operator: 'in',
      value: ['HIGH', 'CRITICAL'],
    };
    expect(evaluateTicketRoutingConditions([inCond], billingHigh)).toBe(true);
    expect(evaluateTicketRoutingConditions([{ ...inCond, value: ['LOW'] }], billingHigh)).toBe(
      false
    );
    expect(evaluateTicketRoutingConditions([{ ...inCond, operator: 'not_in' }], billingHigh)).toBe(
      false
    );
    expect(
      evaluateTicketRoutingConditions(
        [{ ...inCond, operator: 'not_in', value: ['LOW'] }],
        billingHigh
      )
    ).toBe(true);
    // a scalar under a list operator is malformed and never matches
    expect(evaluateTicketRoutingConditions([{ ...inCond, value: 'HIGH' }], billingHigh)).toBe(
      false
    );
    expect(
      evaluateTicketRoutingConditions(
        [{ ...inCond, operator: 'not_in', value: 'LOW' }],
        billingHigh
      )
    ).toBe(false);
  });

  it('compares priority by routing weight for gte and lte', () => {
    const gte: TicketRoutingCondition = {
      field: 'ticketPriority',
      operator: 'gte',
      value: 'MEDIUM',
    };
    expect(evaluateTicketRoutingConditions([gte], billingHigh)).toBe(true);
    expect(evaluateTicketRoutingConditions([{ ...gte, value: 'CRITICAL' }], billingHigh)).toBe(
      false
    );
    expect(evaluateTicketRoutingConditions([{ ...gte, operator: 'lte' }], billingHigh)).toBe(false);
    expect(
      evaluateTicketRoutingConditions([{ ...gte, operator: 'lte', value: 'HIGH' }], billingHigh)
    ).toBe(true);
  });

  it('does not match ordinal operators on non-priority values', () => {
    expect(
      evaluateTicketRoutingConditions(
        [{ field: 'ticketCategory', operator: 'gte', value: 'BILLING' }],
        billingHigh
      )
    ).toBe(false);
  });

  it('requires every condition (AND) and a known fact for each field', () => {
    const conditions: TicketRoutingCondition[] = [
      { field: 'ticketCategory', operator: 'equals', value: 'BILLING' },
      { field: 'ticketPriority', operator: 'equals', value: 'HIGH' },
    ];
    expect(evaluateTicketRoutingConditions(conditions, billingHigh)).toBe(true);
    expect(
      evaluateTicketRoutingConditions(conditions, { ...billingHigh, ticketPriority: 'LOW' })
    ).toBe(false);
    expect(evaluateTicketRoutingConditions(conditions, { ticketCategory: 'BILLING' })).toBe(false);
  });
});

describe('TICKET_ROUTING_FIELD_VALUES', () => {
  it('declares a closed value set for every condition field', () => {
    for (const field of TICKET_ROUTING_CONDITION_FIELDS) {
      expect(TICKET_ROUTING_FIELD_VALUES[field].length).toBeGreaterThan(0);
    }
  });
});
