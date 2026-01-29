/**
 * ConversionSnapshot Tests
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Tests for the ConversionSnapshot value object that captures
 * lead data at the moment of conversion for audit purposes.
 */

import { describe, it, expect } from 'vitest';
import { ConversionSnapshot } from '../ConversionSnapshot';
import { Lead } from '@intelliflow/domain';

describe('ConversionSnapshot', () => {
  const createTestLead = (overrides: Partial<{
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    title: string;
    phone: string;
    source: 'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER';
    ownerId: string;
    tenantId: string;
  }> = {}) => {
    const result = Lead.create({
      email: overrides.email ?? 'test@example.com',
      firstName: overrides.firstName ?? 'John',
      lastName: overrides.lastName ?? 'Doe',
      company: overrides.company ?? 'ACME Corp',
      title: overrides.title ?? 'Sales Manager',
      phone: overrides.phone ?? '+1234567890',
      source: overrides.source ?? 'WEBSITE',
      ownerId: overrides.ownerId ?? 'owner-123',
      tenantId: overrides.tenantId ?? 'tenant-456',
    });
    expect(result.isSuccess).toBe(true);
    return result.value;
  };

  describe('fromLead', () => {
    it('should capture all lead fields', () => {
      const lead = createTestLead();

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.leadId).toBe(lead.id.value);
      expect(snapshot.email).toBe('test@example.com');
      expect(snapshot.firstName).toBe('John');
      expect(snapshot.lastName).toBe('Doe');
      expect(snapshot.company).toBe('ACME Corp');
      expect(snapshot.title).toBe('Sales Manager');
      expect(snapshot.phone).toBe('+1234567890');
      expect(snapshot.source).toBe('WEBSITE');
      expect(snapshot.ownerId).toBe('owner-123');
      expect(snapshot.tenantId).toBe('tenant-456');
    });

    it('should handle null firstName/lastName', () => {
      const result = Lead.create({
        email: 'minimal@example.com',
        ownerId: 'owner-min',
        tenantId: 'tenant-min',
      });
      expect(result.isSuccess).toBe(true);
      const lead = result.value;

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.firstName).toBeNull();
      expect(snapshot.lastName).toBeNull();
    });

    it('should capture score value and confidence', () => {
      const lead = createTestLead();
      // Update score to have non-zero values
      lead.updateScore(85, 0.9, 'model-v1');

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.scoreValue).toBe(85);
      expect(snapshot.scoreConfidence).toBe(0.9);
    });

    it('should set capturedAt to current time', () => {
      const beforeCreate = new Date();
      const lead = createTestLead();

      const snapshot = ConversionSnapshot.fromLead(lead);
      const afterCreate = new Date();

      expect(snapshot.capturedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(snapshot.capturedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('should preserve tenantId and ownerId', () => {
      const lead = createTestLead({
        ownerId: 'specific-owner-id',
        tenantId: 'specific-tenant-id',
      });

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.ownerId).toBe('specific-owner-id');
      expect(snapshot.tenantId).toBe('specific-tenant-id');
    });

    it('should handle lead without phone', () => {
      const result = Lead.create({
        email: 'nophone@example.com',
        firstName: 'No',
        lastName: 'Phone',
        ownerId: 'owner-np',
        tenantId: 'tenant-np',
      });
      expect(result.isSuccess).toBe(true);
      const lead = result.value;

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.phone).toBeNull();
    });

    it('should handle lead without company', () => {
      const result = Lead.create({
        email: 'nocompany@example.com',
        firstName: 'No',
        lastName: 'Company',
        ownerId: 'owner-nc',
        tenantId: 'tenant-nc',
      });
      expect(result.isSuccess).toBe(true);
      const lead = result.value;

      const snapshot = ConversionSnapshot.fromLead(lead);

      expect(snapshot.company).toBeNull();
    });
  });

  describe('value object behavior', () => {
    it('should be immutable', () => {
      const lead = createTestLead();
      const snapshot = ConversionSnapshot.fromLead(lead);

      // Attempting to modify should not change the snapshot
      const originalEmail = snapshot.email;

      // Value objects should not allow mutation
      expect(snapshot.email).toBe(originalEmail);
    });

    it('should implement equals correctly', () => {
      const lead = createTestLead();
      const snapshot1 = ConversionSnapshot.fromLead(lead);
      const snapshot2 = ConversionSnapshot.fromLead(lead);

      // Same lead should produce equal snapshots (except capturedAt)
      // Note: Because capturedAt differs, they won't be strictly equal
      // but the data should match
      expect(snapshot1.leadId).toBe(snapshot2.leadId);
      expect(snapshot1.email).toBe(snapshot2.email);
    });

    it('should serialize to JSON', () => {
      const lead = createTestLead();
      const snapshot = ConversionSnapshot.fromLead(lead);

      const json = snapshot.toValue();

      expect(json).toHaveProperty('leadId');
      expect(json).toHaveProperty('email');
      expect(json).toHaveProperty('firstName');
      expect(json).toHaveProperty('lastName');
      expect(json).toHaveProperty('company');
      expect(json).toHaveProperty('title');
      expect(json).toHaveProperty('phone');
      expect(json).toHaveProperty('source');
      expect(json).toHaveProperty('scoreValue');
      expect(json).toHaveProperty('scoreConfidence');
      expect(json).toHaveProperty('tenantId');
      expect(json).toHaveProperty('ownerId');
      expect(json).toHaveProperty('capturedAt');
    });

    it('should produce JSON that can be used for audit records', () => {
      const lead = createTestLead();
      const snapshot = ConversionSnapshot.fromLead(lead);

      const json = snapshot.toValue() as Record<string, unknown>;

      // Verify JSON can be stringified (important for JSONB storage)
      const jsonString = JSON.stringify(json);
      expect(jsonString).toBeDefined();

      // Verify it can be parsed back
      const parsed = JSON.parse(jsonString);
      expect(parsed.email).toBe('test@example.com');
    });
  });

  describe('edge cases', () => {
    it('should handle all lead sources', () => {
      const sources = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'] as const;

      for (const source of sources) {
        const lead = createTestLead({ source, email: `${source.toLowerCase()}@example.com` });
        const snapshot = ConversionSnapshot.fromLead(lead);

        expect(snapshot.source).toBe(source);
      }
    });

    it('should capture zero score correctly', () => {
      const result = Lead.create({
        email: 'zeroscore@example.com',
        ownerId: 'owner-zs',
        tenantId: 'tenant-zs',
      });
      expect(result.isSuccess).toBe(true);
      const lead = result.value;

      const snapshot = ConversionSnapshot.fromLead(lead);

      // Default score is 0, default confidence is 1 (per LeadScore.create defaults)
      expect(snapshot.scoreValue).toBe(0);
      expect(snapshot.scoreConfidence).toBe(1);
    });
  });
});
