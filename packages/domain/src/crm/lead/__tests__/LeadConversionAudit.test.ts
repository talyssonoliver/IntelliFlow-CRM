/**
 * LeadConversionAudit Tests
 *
 * Tests for the LeadConversionAudit entity ensuring proper
 * creation, reconstitution, property access, and serialization.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import {
  LeadConversionAudit,
  type CreateLeadConversionAuditInput,
  type LeadConversionAuditProps,
} from '../LeadConversionAudit';

describe('LeadConversionAudit', () => {
  const defaultInput: CreateLeadConversionAuditInput = {
    leadId: 'lead-001',
    contactId: 'contact-002',
    accountId: 'account-003',
    tenantId: 'tenant-004',
    convertedBy: 'user-005',
    conversionSnapshot: {
      name: 'John Doe',
      email: 'john@example.com',
      score: 85,
      status: 'QUALIFIED',
    },
  };

  describe('create', () => {
    it('should create an audit record with a generated UUID id', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.id).toBeDefined();
      expect(typeof audit.id).toBe('string');
      expect(audit.id.length).toBeGreaterThan(0);
    });

    it('should create unique ids for each instance', () => {
      const audit1 = LeadConversionAudit.create(defaultInput);
      const audit2 = LeadConversionAudit.create(defaultInput);
      expect(audit1.id).not.toBe(audit2.id);
    });

    it('should set all properties from input', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.leadId).toBe('lead-001');
      expect(audit.contactId).toBe('contact-002');
      expect(audit.accountId).toBe('account-003');
      expect(audit.tenantId).toBe('tenant-004');
      expect(audit.convertedBy).toBe('user-005');
      expect(audit.conversionSnapshot).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        score: 85,
        status: 'QUALIFIED',
      });
    });

    it('should generate default idempotency key from leadId:convertedBy', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.idempotencyKey).toBe('lead-001:user-005');
    });

    it('should use provided idempotency key when specified', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        idempotencyKey: 'custom-key-123',
      });
      expect(audit.idempotencyKey).toBe('custom-key-123');
    });

    it('should set createdAt to a recent Date', () => {
      const before = new Date();
      const audit = LeadConversionAudit.create(defaultInput);
      const after = new Date();
      expect(audit.createdAt).toBeInstanceOf(Date);
      expect(audit.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(audit.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle null accountId', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        accountId: null,
      });
      expect(audit.accountId).toBeNull();
    });

    it('should handle empty conversionSnapshot', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        conversionSnapshot: {},
      });
      expect(audit.conversionSnapshot).toEqual({});
    });

    it('should handle complex conversionSnapshot with nested data', () => {
      const complexSnapshot = {
        lead: { name: 'Test', scores: [10, 20, 30] },
        metadata: { source: 'web', nested: { deep: true } },
      };
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        conversionSnapshot: complexSnapshot,
      });
      expect(audit.conversionSnapshot).toEqual(complexSnapshot);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from persisted data', () => {
      const props: LeadConversionAuditProps = {
        leadId: 'lead-100',
        contactId: 'contact-200',
        accountId: 'account-300',
        tenantId: 'tenant-400',
        convertedBy: 'user-500',
        conversionSnapshot: { data: 'preserved' },
        idempotencyKey: 'key-600',
        createdAt: new Date('2025-06-15T10:00:00Z'),
      };

      const audit = LeadConversionAudit.reconstitute('existing-id-789', props);
      expect(audit.id).toBe('existing-id-789');
      expect(audit.leadId).toBe('lead-100');
      expect(audit.contactId).toBe('contact-200');
      expect(audit.accountId).toBe('account-300');
      expect(audit.tenantId).toBe('tenant-400');
      expect(audit.convertedBy).toBe('user-500');
      expect(audit.conversionSnapshot).toEqual({ data: 'preserved' });
      expect(audit.idempotencyKey).toBe('key-600');
      expect(audit.createdAt).toEqual(new Date('2025-06-15T10:00:00Z'));
    });

    it('should preserve null accountId from persistence', () => {
      const props: LeadConversionAuditProps = {
        leadId: 'l',
        contactId: 'c',
        accountId: null,
        tenantId: 't',
        convertedBy: 'u',
        conversionSnapshot: {},
        idempotencyKey: 'k',
        createdAt: new Date(),
      };

      const audit = LeadConversionAudit.reconstitute('id', props);
      expect(audit.accountId).toBeNull();
    });
  });

  describe('toOutput', () => {
    it('should return correct output format', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      const output = audit.toOutput();

      expect(output.leadId).toBe('lead-001');
      expect(output.contactId).toBe('contact-002');
      expect(output.accountId).toBe('account-003');
      expect(output.leadStatus).toBe('CONVERTED');
      expect(output.convertedBy).toBe('user-005');
      expect(output.convertedAt).toBe(audit.createdAt);
      expect(output.conversionSnapshot).toEqual(defaultInput.conversionSnapshot);
    });

    it('should always set leadStatus to CONVERTED', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.toOutput().leadStatus).toBe('CONVERTED');
    });

    it('should return null accountId in output when null', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        accountId: null,
      });
      expect(audit.toOutput().accountId).toBeNull();
    });

    it('should set convertedAt to createdAt', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.toOutput().convertedAt).toBe(audit.createdAt);
    });
  });

  describe('toJSON', () => {
    it('should serialize all fields correctly', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      const json = audit.toJSON();

      expect(json.id).toBe(audit.id);
      expect(json.leadId).toBe('lead-001');
      expect(json.contactId).toBe('contact-002');
      expect(json.accountId).toBe('account-003');
      expect(json.tenantId).toBe('tenant-004');
      expect(json.convertedBy).toBe('user-005');
      expect(json.conversionSnapshot).toEqual(defaultInput.conversionSnapshot);
      expect(json.idempotencyKey).toBe('lead-001:user-005');
      expect(typeof json.createdAt).toBe('string');
    });

    it('should serialize createdAt as ISO string', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      const json = audit.toJSON();
      const isoString = json.createdAt as string;
      // Verify it parses back to a valid date
      expect(new Date(isoString).toISOString()).toBe(isoString);
    });

    it('should serialize null accountId', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        accountId: null,
      });
      const json = audit.toJSON();
      expect(json.accountId).toBeNull();
    });

    it('should include the entity id', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      const json = audit.toJSON();
      expect(json.id).toBe(audit.id);
    });
  });

  describe('Entity behavior', () => {
    it('should expose id via getter', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      expect(audit.id).toBeDefined();
      expect(typeof audit.id).toBe('string');
    });

    it('created instances should use the same id through reconstitute', () => {
      const audit = LeadConversionAudit.create(defaultInput);
      const reconstituted = LeadConversionAudit.reconstitute(audit.id, {
        leadId: audit.leadId,
        contactId: audit.contactId,
        accountId: audit.accountId,
        tenantId: audit.tenantId,
        convertedBy: audit.convertedBy,
        conversionSnapshot: audit.conversionSnapshot,
        idempotencyKey: audit.idempotencyKey,
        createdAt: audit.createdAt,
      });
      expect(reconstituted.id).toBe(audit.id);
    });

    it('different instances have different ids', () => {
      const audit1 = LeadConversionAudit.create(defaultInput);
      const audit2 = LeadConversionAudit.create(defaultInput);
      expect(audit1.id).not.toBe(audit2.id);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string ids in input', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        leadId: '',
        contactId: '',
        tenantId: '',
        convertedBy: '',
      });
      expect(audit.leadId).toBe('');
      expect(audit.contactId).toBe('');
      expect(audit.tenantId).toBe('');
      expect(audit.convertedBy).toBe('');
      // Idempotency key should be ":"
      expect(audit.idempotencyKey).toBe(':');
    });

    it('should handle idempotencyKey with empty string', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        idempotencyKey: '',
      });
      // Empty string is not nullish, so ?? does NOT fall back to default
      expect(audit.idempotencyKey).toBe('');
    });

    it('should handle idempotencyKey with truthy value', () => {
      const audit = LeadConversionAudit.create({
        ...defaultInput,
        idempotencyKey: '0',
      });
      // '0' is truthy as a non-empty string
      expect(audit.idempotencyKey).toBe('0');
    });
  });
});
