import { describe, it, expect } from 'vitest';
import {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AccountRevenueUpdatedEvent,
  AccountIndustryCategorizedEvent,
} from '../AccountEvents';
import { AccountId } from '../AccountId';

describe('AccountCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const accountId = AccountId.generate();
    const event = new AccountCreatedEvent(accountId, 'Acme Corp', 'owner-123');

    expect(event.eventType).toBe('account.created');
    expect(event.accountId).toBe(accountId);
    expect(event.name).toBe('Acme Corp');
    expect(event.ownerId).toBe('owner-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const accountId = AccountId.generate();
    const event = new AccountCreatedEvent(accountId, 'Acme Corp', 'owner-123');
    const payload = event.toPayload();

    expect(payload.accountId).toBe(accountId.value);
    expect(payload.name).toBe('Acme Corp');
    expect(payload.ownerId).toBe('owner-123');
  });
});

describe('AccountUpdatedEvent', () => {
  it('should create event with updated fields', () => {
    const accountId = AccountId.generate();
    const updatedFields = ['name', 'website', 'phone'];
    const event = new AccountUpdatedEvent(accountId, updatedFields, 'user-123');

    expect(event.eventType).toBe('account.updated');
    expect(event.accountId).toBe(accountId);
    expect(event.updatedFields).toEqual(updatedFields);
    expect(event.updatedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with single updated field', () => {
    const accountId = AccountId.generate();
    const updatedFields = ['industry'];
    const event = new AccountUpdatedEvent(accountId, updatedFields, 'user-123');

    expect(event.updatedFields).toEqual(['industry']);
  });

  it('should serialize to payload correctly', () => {
    const accountId = AccountId.generate();
    const updatedFields = ['name', 'website'];
    const event = new AccountUpdatedEvent(accountId, updatedFields, 'user-123');
    const payload = event.toPayload();

    expect(payload.accountId).toBe(accountId.value);
    expect(payload.updatedFields).toEqual(['name', 'website']);
    expect(payload.updatedBy).toBe('user-123');
  });
});

describe('AccountRevenueUpdatedEvent', () => {
  it('should create event with initial revenue (no previous)', () => {
    const accountId = AccountId.generate();
    const event = new AccountRevenueUpdatedEvent(
      accountId,
      null,
      1000000,
      'user-123'
    );

    expect(event.eventType).toBe('account.revenue_updated');
    expect(event.accountId).toBe(accountId);
    expect(event.previousRevenue).toBeNull();
    expect(event.newRevenue).toBe(1000000);
    expect(event.updatedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with revenue change', () => {
    const accountId = AccountId.generate();
    const event = new AccountRevenueUpdatedEvent(
      accountId,
      1000000,
      1500000,
      'user-123'
    );

    expect(event.previousRevenue).toBe(1000000);
    expect(event.newRevenue).toBe(1500000);
  });

  it('should serialize to payload correctly without previous revenue', () => {
    const accountId = AccountId.generate();
    const event = new AccountRevenueUpdatedEvent(
      accountId,
      null,
      1000000,
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.accountId).toBe(accountId.value);
    expect(payload.previousRevenue).toBeNull();
    expect(payload.newRevenue).toBe(1000000);
    expect(payload.updatedBy).toBe('user-123');
  });

  it('should serialize to payload correctly with previous revenue', () => {
    const accountId = AccountId.generate();
    const event = new AccountRevenueUpdatedEvent(
      accountId,
      1000000,
      1500000,
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.previousRevenue).toBe(1000000);
    expect(payload.newRevenue).toBe(1500000);
  });
});

describe('AccountIndustryCategorizedEvent', () => {
  it('should create event with industry categorization', () => {
    const accountId = AccountId.generate();
    const event = new AccountIndustryCategorizedEvent(
      accountId,
      'Technology',
      'user-123'
    );

    expect(event.eventType).toBe('account.industry_categorized');
    expect(event.accountId).toBe(accountId);
    expect(event.industry).toBe('Technology');
    expect(event.categorizedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const accountId = AccountId.generate();
    const event = new AccountIndustryCategorizedEvent(
      accountId,
      'Technology',
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.accountId).toBe(accountId.value);
    expect(payload.industry).toBe('Technology');
    expect(payload.categorizedBy).toBe('user-123');
  });
});
