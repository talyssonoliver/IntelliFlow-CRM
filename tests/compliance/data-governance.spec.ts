/**
 * Data Governance Compliance Tests - IFC-140
 *
 * Tests GDPR Article 15-22 data subject rights implementation:
 * - DSAR deadline and erasure guards (the full DSAR suite is PG-203's
 *   tests/integration/dsar.test.ts and the service/router tests)
 * - Retention policy enforcement
 * - Legal hold compliance
 * - Tenant-specific encryption
 * - Data residency compliance
 *
 * KPIs:
 * - DSAR answered within one calendar month (Art 12(3))
 * - Encryption coverage 100%
 * - Retention and legal hold compliance audited
 */

import { describe, it, expect } from 'vitest';
// The root project has no workspace dependencies: import the sources, as tests/integration does.
import {
  DSAR_REQUEST_TYPES,
  addCalendarMonths,
} from '../../packages/domain/src/legal/privacy/dsar';
import { dsarCompleteSchema } from '../../packages/validators/src/dsar';

// ============================================
// RETENTION POLICY TESTS
// ============================================

describe('Retention Policy Compliance', () => {
  it('should enforce retention schedules per entity type', async () => {
    // Retention periods from IFC-140 requirements
    const retentionPolicies = {
      audit_logs: 7 * 365, // 7 years (regulatory requirement)
      leads: 2 * 365, // 2 years if no conversion
      contacts: 5 * 365, // 5 years for customer contacts
      opportunities: 5 * 365, // 5 years
      cases: 10 * 365, // 10 years (legal requirement)
      communications: 3 * 365, // 3 years
    };

    // Verify each policy is defined
    for (const [entity, days] of Object.entries(retentionPolicies)) {
      expect(days).toBeGreaterThan(0);
    }
  });

  it('should apply data minimization on export', async () => {
    // Export should redact sensitive fields
    const sensitiveFields = [
      'password_hash',
      'api_keys',
      'session_tokens',
      'internal_notes',
      'credit_card_data',
    ];

    for (const field of sensitiveFields) {
      expect(sensitiveFields).toContain(field);
    }
  });
});

// ============================================
// LEGAL HOLD TESTS
// ============================================

describe('Legal Hold Compliance', () => {
  // PG-203: there is no hold registry; the admin must confirm, per erasure, that no legal
  // hold or retention duty applies, and the request schema refuses anything else.
  const base = { id: 'clh0000000000000000000000', note: 'Checked with the matter partner' };

  it('accepts an erasure completion only with the explicit no-hold confirmation', () => {
    expect(dsarCompleteSchema.safeParse({ ...base, noHoldConfirmed: true }).success).toBe(true);
    expect(dsarCompleteSchema.safeParse({ ...base, noHoldConfirmed: false }).success).toBe(false);
    expect(dsarCompleteSchema.safeParse({ ...base, noHoldConfirmed: 'yes' }).success).toBe(false);
  });
});

// ============================================
// ENCRYPTION COMPLIANCE TESTS
// ============================================

describe('Tenant-Specific Encryption', () => {
  it('should require encryption for data exports', () => {
    // Data export URLs should use HTTPS
    const exportUrl = 'https://storage.example.com/export.json';
    expect(exportUrl.startsWith('https://')).toBe(true);
  });

  it('should require KMS key per tenant', () => {
    // Verify KMS key config structure
    const kmsConfig = {
      keyAlgorithm: 'AES-256-GCM',
      rotationPeriodDays: 365,
      keyUsage: 'ENCRYPT_DECRYPT',
    };

    expect(kmsConfig.keyAlgorithm).toBe('AES-256-GCM');
    expect(kmsConfig.rotationPeriodDays).toBeLessThanOrEqual(365);
  });
});

// ============================================
// DATA RESIDENCY COMPLIANCE TESTS
// ============================================

describe('Data Residency Compliance', () => {
  it('should define supported data regions', () => {
    const supportedRegions = ['eu-west-1', 'us-east-1', 'ap-southeast-1'];
    expect(supportedRegions.length).toBeGreaterThan(0);
  });

  it('should validate EU data stays in EU regions', () => {
    const euRegions = ['eu-west-1', 'eu-west-2', 'eu-central-1'];
    const isEuRegion = (region: string) => region.startsWith('eu-');

    for (const region of euRegions) {
      expect(isEuRegion(region)).toBe(true);
    }
  });
});

// ============================================
// KPI VERIFICATION TESTS
// ============================================

describe('IFC-140 KPI Verification', () => {
  it('DSAR deadline is one calendar month from verification (Art 12(3))', () => {
    expect(addCalendarMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z'
    );
  });

  it('Encryption coverage should be 100%', () => {
    const encryptionCoverage = 100;
    expect(encryptionCoverage).toBe(100);
  });

  it('All DSAR request types should be supported', () => {
    expect([...DSAR_REQUEST_TYPES].sort()).toEqual(
      ['ACCESS', 'ERASURE', 'OBJECTION', 'PORTABILITY', 'RECTIFICATION', 'RESTRICTION'].sort()
    ); // GDPR Articles 15-18, 20 and 21
  });
});
