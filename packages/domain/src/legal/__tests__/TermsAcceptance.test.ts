/**
 * TermsAcceptance Domain Tests — IFC-309
 *
 * RED phase: written before implementation exists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Import will fail (RED) until TermsAcceptance.ts is created
import { TermsAcceptance } from '../TermsAcceptance';

describe('TermsAcceptance domain class', () => {
  const validProps = {
    id: 'clm0000000000000000000001',
    tenantId: 'tenant-abc',
    userId: 'user-xyz',
    termsVersion: 'v1.0',
    ipAddress: '203.0.113.1',
    userAgent: 'Mozilla/5.0',
    route: '/terms',
  };

  describe('TermsAcceptance.create()', () => {
    it('instantiates with valid fields', () => {
      const ta = TermsAcceptance.create(validProps);
      const record = ta.toRecord();

      expect(record.id).toBe(validProps.id);
      expect(record.tenantId).toBe(validProps.tenantId);
      expect(record.userId).toBe(validProps.userId);
      expect(record.termsVersion).toBe(validProps.termsVersion);
      expect(record.route).toBe(validProps.route);
      expect(record.acceptedAt).toBeInstanceOf(Date);
    });

    it('throws when termsVersion is empty', () => {
      expect(() => TermsAcceptance.create({ ...validProps, termsVersion: '' })).toThrow(
        'termsVersion must be 1-32 chars'
      );
    });

    it('throws when termsVersion exceeds 32 chars', () => {
      expect(() => TermsAcceptance.create({ ...validProps, termsVersion: 'v'.repeat(33) })).toThrow(
        'termsVersion must be 1-32 chars'
      );
    });

    it('accepts exactly 32-char termsVersion', () => {
      const ta = TermsAcceptance.create({ ...validProps, termsVersion: 'v'.repeat(32) });
      expect(ta.termsVersion).toBe('v'.repeat(32));
    });

    it('accepts exactly 1-char termsVersion', () => {
      const ta = TermsAcceptance.create({ ...validProps, termsVersion: '1' });
      expect(ta.termsVersion).toBe('1');
    });
  });

  describe('TermsAcceptance.fromRecord()', () => {
    it('round-trips through fromRecord → toRecord', () => {
      const ts = new Date('2026-06-29T00:00:00.000Z');
      const ta = TermsAcceptance.fromRecord({ ...validProps, acceptedAt: ts });
      const record = ta.toRecord();

      expect(record.acceptedAt).toEqual(ts);
      expect(record.tenantId).toBe(validProps.tenantId);
      expect(record.userId).toBe(validProps.userId);
    });
  });

  describe('toRecord()', () => {
    it('returns a plain object with all 7 expected fields', () => {
      const ta = TermsAcceptance.create(validProps);
      const record = ta.toRecord();

      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('tenantId');
      expect(record).toHaveProperty('userId');
      expect(record).toHaveProperty('termsVersion');
      expect(record).toHaveProperty('acceptedAt');
      expect(record).toHaveProperty('ipAddress');
      expect(record).toHaveProperty('userAgent');
      expect(record).toHaveProperty('route');
    });
  });

  describe('zero infra deps (AC-012)', () => {
    it('has no import statements from @intelliflow/db, @prisma/client, or any infra package', () => {
      const domainFile = join(__dirname, '..', 'TermsAcceptance.ts');
      // Read the file content and check that no `import ... from '...'` line references infra packages
      const content = readFileSync(domainFile, 'utf8');
      // Extract only import statement lines to avoid matching comments
      const importLines = content.split('\n').filter((line: string) => /^\s*import\s+/.test(line));

      const importStr = importLines.join('\n');
      expect(importStr).not.toMatch(/@intelliflow\/db/);
      expect(importStr).not.toMatch(/@prisma\/client/);
      expect(importStr).not.toMatch(/prisma-client/);
      expect(importStr).not.toMatch(/pg-adapter/);
    });
  });

  describe('accessor getters', () => {
    it('exposes termsVersion, tenantId, userId, acceptedAt getters', () => {
      const ta = TermsAcceptance.create(validProps);

      expect(ta.termsVersion).toBe(validProps.termsVersion);
      expect(ta.tenantId).toBe(validProps.tenantId);
      expect(ta.userId).toBe(validProps.userId);
      expect(ta.acceptedAt).toBeInstanceOf(Date);
    });
  });
});
