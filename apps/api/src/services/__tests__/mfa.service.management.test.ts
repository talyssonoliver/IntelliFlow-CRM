/**
 * MFA Service Management Tests
 * PG-125: Tests for verifyTotpTimingSafe, DB persistence, cache invalidation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MfaService, resetMfaService, getMfaService } from '../mfa.service';

describe('MfaService Management (PG-125)', () => {
  let service: MfaService;

  beforeEach(() => {
    resetMfaService();
    service = getMfaService();
  });

  describe('verifyTotpTimingSafe', () => {
    it('should return true for a valid TOTP code', () => {
      const secret = service.generateTotpSecret('test@example.com').secret;
      const code = service.getCurrentTotpCode(secret);
      expect(service.verifyTotpTimingSafe(secret, code)).toBe(true);
    });

    it('should return false for an invalid TOTP code', () => {
      const secret = service.generateTotpSecret('test@example.com').secret;
      expect(service.verifyTotpTimingSafe(secret, '000000')).toBe(false);
    });

    it('should handle whitespace in code', () => {
      const secret = service.generateTotpSecret('test@example.com').secret;
      const code = service.getCurrentTotpCode(secret);
      const spacedCode = code.slice(0, 3) + ' ' + code.slice(3);
      expect(service.verifyTotpTimingSafe(secret, spacedCode)).toBe(true);
    });
  });

  describe('getUserMfaSettings with persistence', () => {
    it('should return null for unknown user (no Prisma)', async () => {
      const result = await service.getUserMfaSettings('unknown-user');
      expect(result).toBeNull();
    });

    it('should return cached settings on second call', async () => {
      const settings = {
        userId: 'user-1',
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
      };
      await service.saveUserMfaSettings(settings);
      const result = await service.getUserMfaSettings('user-1');
      expect(result).toEqual(settings);
    });
  });

  describe('saveUserMfaSettings with persistence', () => {
    it('should save settings to cache', async () => {
      const settings = {
        userId: 'user-2',
        totpEnabled: true,
        totpSecret: 'test-secret',
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: ['code1', 'code2'],
      };
      await service.saveUserMfaSettings(settings);
      const result = await service.getUserMfaSettings('user-2');
      expect(result?.totpEnabled).toBe(true);
      expect(result?.backupCodes).toEqual(['code1', 'code2']);
    });

    it('should update existing settings', async () => {
      await service.saveUserMfaSettings({
        userId: 'user-3',
        totpEnabled: true,
        totpSecret: 'secret',
        smsEnabled: false,
        emailEnabled: false,
      });
      await service.saveUserMfaSettings({
        userId: 'user-3',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
      });
      const result = await service.getUserMfaSettings('user-3');
      expect(result?.totpEnabled).toBe(false);
    });
  });

  describe('cache invalidation', () => {
    it('should return fresh data after save (not stale cache)', async () => {
      // Save initial settings
      await service.saveUserMfaSettings({
        userId: 'user-cache',
        totpEnabled: true,
        totpSecret: 'secret1',
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: ['a', 'b', 'c'],
      });

      // Read (caches)
      const first = await service.getUserMfaSettings('user-cache');
      expect(first?.backupCodes?.length).toBe(3);

      // Update
      await service.saveUserMfaSettings({
        userId: 'user-cache',
        totpEnabled: true,
        totpSecret: 'secret1',
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: ['a'], // Reduced
      });

      // Read again - should get updated data
      const second = await service.getUserMfaSettings('user-cache');
      expect(second?.backupCodes?.length).toBe(1);
    });
  });
});
