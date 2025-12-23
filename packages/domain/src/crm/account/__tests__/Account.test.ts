/**
 * Account Aggregate Root Tests
 *
 * These tests verify the domain logic of the Account entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Account, InvalidRevenueError, InvalidEmployeeCountError } from '../Account';
import { AccountId } from '../AccountId';
import {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AccountRevenueUpdatedEvent,
  AccountIndustryCategorizedEvent,
} from '../AccountEvents';

describe('Account Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new account with valid data', () => {
      const result = Account.create({
        name: 'Acme Corporation',
        website: 'https://acme.com',
        industry: 'Technology',
        employees: 500,
        revenue: 5000000,
        description: 'Leading tech company',
        ownerId: 'owner-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Account);

      const account = result.value;
      expect(account.name).toBe('Acme Corporation');
      expect(account.website).toBe('https://acme.com');
      expect(account.industry).toBe('Technology');
      expect(account.employees).toBe(500);
      expect(account.revenue).toBe(5000000);
      expect(account.description).toBe('Leading tech company');
      expect(account.ownerId).toBe('owner-123');
      expect(account.hasIndustry).toBe(true);
      expect(account.hasRevenue).toBe(true);
    });

    it('should create an account with minimal data', () => {
      const result = Account.create({
        name: 'Minimal Corp',
        ownerId: 'owner-456',
      });

      expect(result.isSuccess).toBe(true);

      const account = result.value;
      expect(account.name).toBe('Minimal Corp');
      expect(account.website).toBeUndefined();
      expect(account.industry).toBeUndefined();
      expect(account.employees).toBeUndefined();
      expect(account.revenue).toBeUndefined();
      expect(account.description).toBeUndefined();
      expect(account.hasIndustry).toBe(false);
      expect(account.hasRevenue).toBe(false);
    });

    it('should fail with negative revenue', () => {
      const result = Account.create({
        name: 'Invalid Corp',
        revenue: -1000,
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidRevenueError);
      expect(result.error.code).toBe('INVALID_REVENUE');
    });

    it('should fail with zero employees', () => {
      const result = Account.create({
        name: 'Invalid Corp',
        employees: 0,
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmployeeCountError);
      expect(result.error.code).toBe('INVALID_EMPLOYEE_COUNT');
    });

    it('should fail with negative employees', () => {
      const result = Account.create({
        name: 'Invalid Corp',
        employees: -10,
        ownerId: 'owner-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmployeeCountError);
      expect(result.error.code).toBe('INVALID_EMPLOYEE_COUNT');
    });

    it('should accept zero revenue', () => {
      const result = Account.create({
        name: 'Startup Corp',
        revenue: 0,
        ownerId: 'owner-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.revenue).toBe(0);
    });

    it('should emit AccountCreatedEvent on creation', () => {
      const result = Account.create({
        name: 'Event Corp',
        ownerId: 'owner-789',
      });

      const account = result.value;
      const events = account.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountCreatedEvent);

      const createdEvent = events[0] as AccountCreatedEvent;
      expect(createdEvent.accountId).toBe(account.id);
      expect(createdEvent.name).toBe('Event Corp');
      expect(createdEvent.ownerId).toBe('owner-789');
    });
  });

  describe('Getters', () => {
    let account: Account;

    beforeEach(() => {
      const result = Account.create({
        name: 'Test Corp',
        website: 'https://test.com',
        industry: 'Technology',
        employees: 100,
        revenue: 1000000,
        description: 'Test company',
        ownerId: 'owner-123',
      });
      account = result.value;
    });

    it('should return all properties correctly', () => {
      expect(account.name).toBe('Test Corp');
      expect(account.website).toBe('https://test.com');
      expect(account.industry).toBe('Technology');
      expect(account.employees).toBe(100);
      expect(account.revenue).toBe(1000000);
      expect(account.description).toBe('Test company');
      expect(account.ownerId).toBe('owner-123');
    });

    it('should check if account has industry', () => {
      expect(account.hasIndustry).toBe(true);

      const noIndustryResult = Account.create({
        name: 'No Industry Corp',
        ownerId: 'owner-456',
      });

      expect(noIndustryResult.value.hasIndustry).toBe(false);
    });

    it('should check if account has revenue', () => {
      expect(account.hasRevenue).toBe(true);

      const noRevenueResult = Account.create({
        name: 'No Revenue Corp',
        ownerId: 'owner-456',
      });

      expect(noRevenueResult.value.hasRevenue).toBe(false);
    });
  });

  describe('updateAccountInfo()', () => {
    let account: Account;

    beforeEach(() => {
      const result = Account.create({
        name: 'Original Corp',
        website: 'https://original.com',
        description: 'Original description',
        ownerId: 'owner-123',
      });
      account = result.value;
      account.clearDomainEvents();
    });

    it('should update account information successfully', () => {
      account.updateAccountInfo(
        {
          name: 'Updated Corp',
          website: 'https://updated.com',
          description: 'Updated description',
        },
        'user-123'
      );

      expect(account.name).toBe('Updated Corp');
      expect(account.website).toBe('https://updated.com');
      expect(account.description).toBe('Updated description');
    });

    it('should emit AccountUpdatedEvent when fields change', () => {
      account.updateAccountInfo(
        {
          name: 'New Name',
          website: 'https://new.com',
        },
        'user-456'
      );

      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountUpdatedEvent);

      const updatedEvent = events[0] as AccountUpdatedEvent;
      expect(updatedEvent.accountId).toBe(account.id);
      expect(updatedEvent.updatedFields).toContain('name');
      expect(updatedEvent.updatedFields).toContain('website');
      expect(updatedEvent.updatedBy).toBe('user-456');
    });

    it('should not emit event when no fields change', () => {
      account.updateAccountInfo(
        {
          name: 'Original Corp', // Same as current
          website: 'https://original.com', // Same as current
        },
        'user-123'
      );

      const events = account.getDomainEvents();
      expect(events).toHaveLength(0);
    });

    it('should update only changed fields', () => {
      account.updateAccountInfo(
        {
          name: 'Changed Name',
        },
        'user-789'
      );

      expect(account.name).toBe('Changed Name');
      expect(account.website).toBe('https://original.com'); // Unchanged
      expect(account.description).toBe('Original description'); // Unchanged
    });
  });

  describe('updateRevenue()', () => {
    let account: Account;

    beforeEach(() => {
      const result = Account.create({
        name: 'Revenue Corp',
        revenue: 1000000,
        ownerId: 'owner-123',
      });
      account = result.value;
      account.clearDomainEvents();
    });

    it('should update revenue successfully', () => {
      const result = account.updateRevenue(2000000, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(account.revenue).toBe(2000000);
    });

    it('should update revenue from undefined to a value', () => {
      const noRevenueResult = Account.create({
        name: 'No Revenue',
        ownerId: 'owner-456',
      });

      const account2 = noRevenueResult.value;
      const result = account2.updateRevenue(500000, 'user-789');

      expect(result.isSuccess).toBe(true);
      expect(account2.revenue).toBe(500000);
      expect(account2.hasRevenue).toBe(true);
    });

    it('should emit AccountRevenueUpdatedEvent', () => {
      account.updateRevenue(3000000, 'user-456');

      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountRevenueUpdatedEvent);

      const revenueEvent = events[0] as AccountRevenueUpdatedEvent;
      expect(revenueEvent.accountId).toBe(account.id);
      expect(revenueEvent.previousRevenue).toBe(1000000);
      expect(revenueEvent.newRevenue).toBe(3000000);
      expect(revenueEvent.updatedBy).toBe('user-456');
    });

    it('should emit event with null previousRevenue when not set', () => {
      const noRevenueResult = Account.create({
        name: 'No Revenue',
        ownerId: 'owner-456',
      });

      const account2 = noRevenueResult.value;
      account2.clearDomainEvents();
      account2.updateRevenue(500000, 'user-789');

      const events = account2.getDomainEvents();
      const revenueEvent = events[0] as AccountRevenueUpdatedEvent;
      expect(revenueEvent.previousRevenue).toBeNull();
      expect(revenueEvent.newRevenue).toBe(500000);
    });

    it('should fail with negative revenue', () => {
      const result = account.updateRevenue(-1000, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidRevenueError);
      expect(result.error.code).toBe('INVALID_REVENUE');
      expect(account.revenue).toBe(1000000); // Unchanged
    });

    it('should accept zero revenue', () => {
      const result = account.updateRevenue(0, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(account.revenue).toBe(0);
    });
  });

  describe('updateEmployeeCount()', () => {
    let account: Account;

    beforeEach(() => {
      const result = Account.create({
        name: 'Employee Corp',
        employees: 100,
        ownerId: 'owner-123',
      });
      account = result.value;
      account.clearDomainEvents();
    });

    it('should update employee count successfully', () => {
      const result = account.updateEmployeeCount(200, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(account.employees).toBe(200);
    });

    it('should emit AccountUpdatedEvent', () => {
      account.updateEmployeeCount(150, 'user-456');

      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountUpdatedEvent);

      const updatedEvent = events[0] as AccountUpdatedEvent;
      expect(updatedEvent.accountId).toBe(account.id);
      expect(updatedEvent.updatedFields).toContain('employees');
      expect(updatedEvent.updatedBy).toBe('user-456');
    });

    it('should fail with zero employee count', () => {
      const result = account.updateEmployeeCount(0, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmployeeCountError);
      expect(result.error.code).toBe('INVALID_EMPLOYEE_COUNT');
      expect(account.employees).toBe(100); // Unchanged
    });

    it('should fail with negative employee count', () => {
      const result = account.updateEmployeeCount(-10, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEmployeeCountError);
      expect(account.employees).toBe(100); // Unchanged
    });
  });

  describe('categorizeIndustry()', () => {
    let account: Account;

    beforeEach(() => {
      const result = Account.create({
        name: 'Industry Corp',
        ownerId: 'owner-123',
      });
      account = result.value;
      account.clearDomainEvents();
    });

    it('should categorize industry successfully', () => {
      account.categorizeIndustry('Technology', 'user-123');

      expect(account.industry).toBe('Technology');
      expect(account.hasIndustry).toBe(true);
    });

    it('should emit AccountIndustryCategorizedEvent', () => {
      account.categorizeIndustry('Healthcare', 'user-456');

      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountIndustryCategorizedEvent);

      const industryEvent = events[0] as AccountIndustryCategorizedEvent;
      expect(industryEvent.accountId).toBe(account.id);
      expect(industryEvent.industry).toBe('Healthcare');
      expect(industryEvent.categorizedBy).toBe('user-456');
    });

    it('should update existing industry', () => {
      account.categorizeIndustry('Finance', 'user-123');
      account.clearDomainEvents();

      account.categorizeIndustry('Technology', 'user-456');

      expect(account.industry).toBe('Technology');

      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountIndustryCategorizedEvent);
    });
  });

  describe('State Transitions', () => {
    it('should transition from no revenue to has revenue', () => {
      const result = Account.create({
        name: 'Transition Corp',
        ownerId: 'owner-123',
      });

      const account = result.value;
      expect(account.hasRevenue).toBe(false);

      account.updateRevenue(1000000, 'user-456');
      expect(account.hasRevenue).toBe(true);
    });

    it('should transition from no industry to has industry', () => {
      const result = Account.create({
        name: 'Transition Corp',
        ownerId: 'owner-123',
      });

      const account = result.value;
      expect(account.hasIndustry).toBe(false);

      account.categorizeIndustry('Technology', 'user-456');
      expect(account.hasIndustry).toBe(true);
    });

    it('should allow revenue to be set to zero', () => {
      const result = Account.create({
        name: 'Revenue Corp',
        revenue: 1000000,
        ownerId: 'owner-123',
      });

      const account = result.value;
      expect(account.hasRevenue).toBe(true);

      account.updateRevenue(0, 'user-456');
      expect(account.revenue).toBe(0);
      expect(account.hasRevenue).toBe(true); // Still has revenue, just zero
    });
  });

  describe('Serialization', () => {
    it('should serialize account to JSON', () => {
      const result = Account.create({
        name: 'JSON Corp',
        website: 'https://json.com',
        industry: 'Technology',
        employees: 250,
        revenue: 2500000,
        description: 'JSON test company',
        ownerId: 'owner-789',
      });

      const account = result.value;
      const json = account.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.name).toBe('JSON Corp');
      expect(json.website).toBe('https://json.com');
      expect(json.industry).toBe('Technology');
      expect(json.employees).toBe(250);
      expect(json.revenue).toBe(2500000);
      expect(json.description).toBe('JSON test company');
      expect(json.ownerId).toBe('owner-789');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });

    it('should serialize account with minimal data', () => {
      const result = Account.create({
        name: 'Minimal JSON',
        ownerId: 'owner-123',
      });

      const account = result.value;
      const json = account.toJSON();

      expect(json.name).toBe('Minimal JSON');
      expect(json.website).toBeUndefined();
      expect(json.industry).toBeUndefined();
      expect(json.employees).toBeUndefined();
      expect(json.revenue).toBeUndefined();
      expect(json.description).toBeUndefined();
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute account from persistence', () => {
      const id = AccountId.generate();
      const now = new Date();

      const account = Account.reconstitute(id, {
        name: 'Reconstituted Corp',
        website: 'https://recon.com',
        industry: 'Finance',
        employees: 300,
        revenue: 3000000,
        description: 'Reconstituted account',
        ownerId: 'owner-999',
        createdAt: now,
        updatedAt: now,
      });

      expect(account.id).toBe(id);
      expect(account.name).toBe('Reconstituted Corp');
      expect(account.website).toBe('https://recon.com');
      expect(account.industry).toBe('Finance');
      expect(account.employees).toBe(300);
      expect(account.revenue).toBe(3000000);
      expect(account.description).toBe('Reconstituted account');
      expect(account.ownerId).toBe('owner-999');
    });

    it('should reconstitute account with minimal data', () => {
      const id = AccountId.generate();

      const account = Account.reconstitute(id, {
        name: 'Minimal Recon',
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(account.id).toBe(id);
      expect(account.name).toBe('Minimal Recon');
      expect(account.website).toBeUndefined();
      expect(account.industry).toBeUndefined();
      expect(account.employees).toBeUndefined();
      expect(account.revenue).toBeUndefined();
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Account.create({
        name: 'Events Corp',
        ownerId: 'owner-123',
      });

      const account = result.value;

      // Creation event is already added
      expect(account.getDomainEvents()).toHaveLength(1);

      account.updateAccountInfo({ name: 'Updated Events Corp' }, 'user-123');
      expect(account.getDomainEvents()).toHaveLength(2);

      account.updateRevenue(1000000, 'user-456');
      expect(account.getDomainEvents()).toHaveLength(3);

      account.categorizeIndustry('Technology', 'user-789');
      expect(account.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const result = Account.create({
        name: 'Clear Corp',
        ownerId: 'owner-123',
      });

      const account = result.value;
      expect(account.getDomainEvents()).toHaveLength(1);

      account.clearDomainEvents();
      expect(account.getDomainEvents()).toHaveLength(0);
    });
  });
});
