/**
 * Audit Errors Tests - b11
 *
 * Targets uncovered branches:
 * - CrossTenantViolationError: constructor, code, properties, stack trace
 * - AuditLogFailedError: constructor with/without cause, code, stack trace
 * - IntegrityVerificationError: constructor, code, properties, stack trace
 */

import { describe, it, expect } from 'vitest';
import {
  CrossTenantViolationError,
  AuditLogFailedError,
  IntegrityVerificationError,
} from '../errors';

describe('Audit Errors - b11', () => {
  describe('CrossTenantViolationError', () => {
    it('should set message with tenant IDs', () => {
      const error = new CrossTenantViolationError('tenant-a', 'tenant-b');
      expect(error.message).toBe(
        "Cross-tenant violation: event tenant 'tenant-a' does not match context tenant 'tenant-b'"
      );
    });

    it('should set code to CROSS_TENANT_VIOLATION', () => {
      const error = new CrossTenantViolationError('t1', 't2');
      expect(error.code).toBe('CROSS_TENANT_VIOLATION');
    });

    it('should store eventTenantId and contextTenantId', () => {
      const error = new CrossTenantViolationError('event-tenant', 'ctx-tenant');
      expect(error.eventTenantId).toBe('event-tenant');
      expect(error.contextTenantId).toBe('ctx-tenant');
    });

    it('should set name to CrossTenantViolationError', () => {
      const error = new CrossTenantViolationError('a', 'b');
      expect(error.name).toBe('CrossTenantViolationError');
    });

    it('should be an instance of Error', () => {
      const error = new CrossTenantViolationError('a', 'b');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have a stack trace', () => {
      const error = new CrossTenantViolationError('a', 'b');
      expect(error.stack).toBeDefined();
    });
  });

  describe('AuditLogFailedError', () => {
    it('should set message from constructor', () => {
      const error = new AuditLogFailedError('Persistence failed after 3 retries');
      expect(error.message).toBe('Persistence failed after 3 retries');
    });

    it('should set code to AUDIT_LOG_FAILED', () => {
      const error = new AuditLogFailedError('msg');
      expect(error.code).toBe('AUDIT_LOG_FAILED');
    });

    it('should set name to AuditLogFailedError', () => {
      const error = new AuditLogFailedError('msg');
      expect(error.name).toBe('AuditLogFailedError');
    });

    it('should store cause when provided', () => {
      const cause = new Error('DB connection lost');
      const error = new AuditLogFailedError('Failed to write audit log', cause);
      expect(error.cause).toBe(cause);
    });

    it('should have undefined cause when not provided', () => {
      const error = new AuditLogFailedError('msg');
      expect(error.cause).toBeUndefined();
    });

    it('should be an instance of Error', () => {
      const error = new AuditLogFailedError('msg');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have a stack trace', () => {
      const error = new AuditLogFailedError('msg');
      expect(error.stack).toBeDefined();
    });
  });

  describe('IntegrityVerificationError', () => {
    it('should set message with eventId and reason', () => {
      const error = new IntegrityVerificationError('evt-123', 'hash mismatch');
      expect(error.message).toBe(
        "Integrity verification failed for event 'evt-123': hash mismatch"
      );
    });

    it('should set code to INTEGRITY_VERIFICATION_FAILED', () => {
      const error = new IntegrityVerificationError('e1', 'reason');
      expect(error.code).toBe('INTEGRITY_VERIFICATION_FAILED');
    });

    it('should store eventId and reason', () => {
      const error = new IntegrityVerificationError('event-abc', 'tampered data');
      expect(error.eventId).toBe('event-abc');
      expect(error.reason).toBe('tampered data');
    });

    it('should set name to IntegrityVerificationError', () => {
      const error = new IntegrityVerificationError('e1', 'r1');
      expect(error.name).toBe('IntegrityVerificationError');
    });

    it('should be an instance of Error', () => {
      const error = new IntegrityVerificationError('e1', 'r1');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have a stack trace', () => {
      const error = new IntegrityVerificationError('e1', 'r1');
      expect(error.stack).toBeDefined();
    });
  });
});
